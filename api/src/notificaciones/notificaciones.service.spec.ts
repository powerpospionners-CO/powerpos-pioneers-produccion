import { NotificacionesService } from './notificaciones.service';
import { validarPreferencias } from './preferencias-alertas';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

describe('Alertas privadas por empresa', () => {
  const smtpUser = process.env.SMTP_USER,
    smtpPass = process.env.SMTP_PASS;
  beforeEach(() => {
    process.env.SMTP_USER = 'powerpos@example.com';
    process.env.SMTP_PASS = 'solo-pruebas';
  });
  afterAll(() => {
    if (smtpUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = smtpUser;
    if (smtpPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = smtpPass;
  });
  const crear = () => {
    const db: any = {
      usuario: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 4, nombre: 'Administrador', rol: 'ADMIN_EMPRESA' },
          ]),
        findFirst: jest.fn().mockResolvedValue({ id: 4 }),
      },
      auditoria: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              entidadId: 4,
              detalle: { email: 'admin@example.com', stock: true, caja: false },
            },
          ]),
        create: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      empresa: {
        findUnique: jest.fn().mockResolvedValue({ nombre: 'Empresa A' }),
        findMany: jest.fn().mockResolvedValue([{ id: 1, nombre: 'Empresa A' }]),
      },
      ingrediente: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 3, nombre: 'Sal', stock: 2, stockMinimo: 10, unidad: 'g' },
          ]),
      },
      producto: { findMany: jest.fn().mockResolvedValue([]) },
      sucursal: {
        findFirst: jest.fn().mockResolvedValue({ nombre: 'Principal' }),
      },
    };
    const service = new NotificacionesService(db);
    const sendMail = jest.fn().mockResolvedValue({});
    (service as any).transporter = { sendMail };
    return { db, service, sendMail };
  };
  it('valida un correo único y normaliza espacios; rechaza inyección de cabeceras', () => {
    expect(
      validarPreferencias({
        email: ' Admin@Example.COM ',
        stock: true,
        caja: false,
      }).email,
    ).toBe('admin@example.com');
    for (const email of [
      'a@b.com,b@c.com',
      'a@b.com\r\nBcc: b@c.com',
      'inválido',
    ])
      expect(() =>
        validarPreferencias({ email, stock: true, caja: true }),
      ).toThrow();
  });
  it('solo permite configurar administradores activos de la empresa autenticada', async () => {
    const { db, service } = crear();
    db.usuario.findFirst.mockResolvedValue(null);
    await expect(
      service.guardarPreferencias(
        9,
        { email: 'a@b.com', stock: true, caja: true },
        1,
        4,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(db.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 9, empresaId: 1, activo: true }),
      }),
    );
    expect(db.auditoria.create).not.toHaveBeenCalled();
  });
  it('no modifica el correo de inicio de sesión y guarda preferencias auditadas', async () => {
    const { db, service } = crear();
    await service.guardarPreferencias(
      4,
      { email: 'nuevo@example.com', stock: true, caja: true },
      1,
      4,
    );
    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        empresaId: 1,
        usuarioId: 4,
        entidadId: 4,
        detalle: { email: 'nuevo@example.com', stock: true, caja: true },
      }),
    });
  });
  it('no envía a destinatarios generales ni a correos de acceso sin configuración personal', async () => {
    const { db, service, sendMail } = crear();
    db.auditoria.findMany.mockResolvedValue([]);
    await service.enviarAlerta({
      tipo: 'STOCK CRÍTICO',
      empresaId: 1,
      empresa: 'A',
      sucursal: 'Principal',
      mensaje: 'Sal',
    });
    expect(sendMail).not.toHaveBeenCalled();
    expect(db.auditoria.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ empresaId: 1 }),
      }),
    );
  });
  it('respeta la categoría desactivada y no envía si falta empresa', async () => {
    const { service, sendMail } = crear();
    await service.enviarAlerta({
      tipo: 'APERTURA DE CAJA',
      empresaId: 1,
      empresa: 'A',
      sucursal: 'Principal',
      mensaje: 'Caja',
    });
    await service.enviarAlerta({
      tipo: 'STOCK BAJO',
      empresa: 'A',
      sucursal: 'Principal',
      mensaje: 'Sal',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('escapa el contenido y obtiene el nombre de la empresa real', async () => {
    const { service, sendMail } = crear();
    await service.enviarAlerta({
      tipo: 'STOCK CRÍTICO',
      empresaId: 1,
      empresa: 'Otra empresa',
      sucursal: 'Principal',
      mensaje: '<img src=x>',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['admin@example.com'],
        html: expect.stringContaining('&lt;img src=x&gt;'),
      }),
    );
    expect(sendMail.mock.calls[0][0].html).toContain('Empresa A');
  });
  it('una caída del correo no provoca el fallo de la operación que generó la alerta', async () => {
    const { service, sendMail } = crear();
    sendMail.mockRejectedValue(new Error('SMTP caído'));
    await expect(
      service.enviarAlerta({
        tipo: 'STOCK BAJO',
        empresaId: 1,
        empresa: 'A',
        sucursal: 'Principal',
        mensaje: 'Sal',
      }),
    ).resolves.toMatchObject({ enviado: false });
  });
  it('informa claramente cuando el remitente no está configurado', async () => {
    const { service } = crear();
    (service as any).transporter = null;
    await expect(service.probarCorreo(4, 1)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
  it('revisa productos e ingredientes después de ventas sin repetir avisos ya enviados', async () => {
    const { db, service } = crear();
    db.auditoria.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.entidad === 'AlertaStock'
          ? [{ accion: 'i3:critico' }]
          : [
              {
                entidadId: 4,
                detalle: {
                  email: 'admin@example.com',
                  stock: true,
                  caja: true,
                },
              },
            ],
      ),
    );
    const enviar = jest
      .spyOn(service, 'enviarAlerta')
      .mockResolvedValue({ enviado: true, canales: [] });
    await service.revisarStockSede();
    expect(enviar).not.toHaveBeenCalled();
    db.producto.findMany.mockResolvedValue([
      { id: 8, nombre: 'Gaseosa', stockActual: 0, stockMinimo: 2 },
    ]);
    await service.revisarStockSede();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0].mensaje).toContain('Gaseosa');
    expect(enviar.mock.calls[0][0].mensaje).not.toContain('Sal');
    expect(db.auditoria.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ empresaId: 1, accion: 'p8:critico' })],
    });
  });
  it('no marca stock como notificado cuando el correo falla', async () => {
    const { db, service } = crear();
    db.auditoria.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.entidad === 'AlertaStock'
          ? []
          : [
              {
                entidadId: 4,
                detalle: {
                  email: 'admin@example.com',
                  stock: true,
                  caja: true,
                },
              },
            ],
      ),
    );
    jest
      .spyOn(service, 'enviarAlerta')
      .mockResolvedValue({ enviado: false, canales: [] });
    await service.revisarStockSede();
    expect(db.auditoria.createMany).not.toHaveBeenCalled();
  });
});
