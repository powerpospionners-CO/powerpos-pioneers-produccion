import { createHmac } from 'crypto';
import { firmaValida, WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { validarPreferencias } from './preferencias-alertas';

describe('WhatsApp oficial: aislamiento, consentimiento y consumo', () => {
  const entorno = { ...process.env };
  const fetchOriginal = global.fetch;
  beforeEach(() => {
    Object.assign(process.env, {
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_ACCESS_TOKEN: 'test',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_GRAPH_VERSION: 'v23.0',
      WHATSAPP_TEMPLATE_ALERTA: 'powerpos_alerta',
      WHATSAPP_LIMITE_DIARIO: '2',
      WHATSAPP_APP_SECRET: 'test-secret',
      WHATSAPP_VERIFY_TOKEN: 'verify-test',
    });
  });
  afterEach(() => {
    process.env = { ...entorno };
    global.fetch = fetchOriginal;
  });
  const crear = () => {
    const salida: any[] = [];
    const preferencias = [
      {
        entidadId: 4,
        detalle: {
          email: '',
          telefono: '+57 302 123 4567',
          whatsapp: true,
          stock: true,
          caja: true,
        },
      },
    ];
    const db: any = {
      usuario: { findMany: jest.fn().mockResolvedValue([{ id: 4 }]) },
      empresa: {
        findUnique: jest.fn().mockResolvedValue({ nombre: 'Empresa correcta' }),
      },
      auditoria: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.entidad === 'UsuarioAlertas' ? preferencias : salida,
            ),
          ),
        create: jest.fn().mockImplementation(({ data }) => {
          salida.push({ id: salida.length + 1, creadoEn: new Date(), ...data });
          return data;
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $transaction: jest.fn().mockImplementation((fn) => fn(db)),
      enCadaSede: jest.fn().mockImplementation((fn) => fn()),
    };
    return { db, salida, preferencias, servicio: new WhatsappService(db) };
  };
  const datos = {
    empresaId: 1,
    tipo: 'STOCK CRÍTICO',
    mensaje: 'Sal: 0 g',
    sucursal: 'Principal',
  };
  it('mantiene preferencias previas sin activar WhatsApp y valida indicativos', () => {
    expect(
      validarPreferencias({ email: '', stock: true, caja: true }).whatsapp,
    ).toBe(false);
    expect(() =>
      validarPreferencias({
        email: '',
        stock: true,
        caja: true,
        whatsapp: true,
      }),
    ).toThrow();
    expect(() =>
      validarPreferencias({
        email: '',
        stock: true,
        caja: true,
        telefono: 'abc',
      }),
    ).toThrow();
  });
  it('no reserva mensajes sin activación y límite explícitos', async () => {
    const { servicio, db } = crear();
    delete process.env.WHATSAPP_LIMITE_DIARIO;
    expect(await servicio.encolar(datos)).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('deduplica, limita por sede y solo usa administradores activos de la empresa', async () => {
    const { servicio, db, salida } = crear();
    expect(await servicio.encolar(datos)).toBe(true);
    expect(await servicio.encolar(datos)).toBe(false);
    expect(await servicio.encolar({ ...datos, mensaje: 'Otro producto' })).toBe(
      true,
    );
    expect(
      await servicio.encolar({ ...datos, mensaje: 'Tercer producto' }),
    ).toBe(false);
    expect(salida).toHaveLength(2);
    expect(db.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ empresaId: 1, activo: true }),
      }),
    );
    expect(salida[0].detalle.empresa).toBe('Empresa correcta');
  });
  it('no permite usar teléfonos sin autorización o de un administrador desactivado', async () => {
    const { servicio, preferencias, db } = crear();
    preferencias[0].detalle.whatsapp = false;
    expect(await servicio.encolar(datos)).toBe(false);
    preferencias[0].detalle.whatsapp = true;
    db.usuario.findMany.mockResolvedValue([]);
    expect(await servicio.encolar(datos)).toBe(false);
  });
  it('un timeout no se reintenta ciegamente y el procesamiento usa cada base de sede', async () => {
    const { servicio, db, salida } = crear();
    await servicio.encolar(datos);
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    await servicio.procesar();
    expect(db.enCadaSede).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(db.auditoria.updateMany).toHaveBeenCalledWith({
      where: { id: salida[0].id, accion: 'ENVIANDO' },
      data: { accion: 'REVISAR' },
    });
  });
  it('revocar consentimiento cancela también un mensaje ya en cola', async () => {
    const { servicio, db, preferencias } = crear();
    await servicio.encolar(datos);
    preferencias[0].detalle.whatsapp = false;
    global.fetch = jest.fn();
    await servicio.procesarSede();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(db.auditoria.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { accion: 'CANCELADO' } }),
    );
  });
  it('envía plantilla con cinco parámetros, nunca texto libre y conserva el identificador de Meta', async () => {
    const { servicio, db } = crear();
    await servicio.encolar(datos);
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.test' }] }),
      });
    await servicio.procesarSede();
    const payload = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(payload.type).toBe('template');
    expect(payload.template.components[0].parameters).toHaveLength(5);
    expect(db.auditoria.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accion: 'ACEPTADO',
          detalle: expect.objectContaining({ messageId: 'wamid.test' }),
        }),
      }),
    );
  });
  it('valida HMAC del cuerpo original y rechaza cuerpos alterados', () => {
    const raw = Buffer.from('{"object":"whatsapp_business_account"}');
    const firma =
      'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(firmaValida(raw, firma, 'secret')).toBe(true);
    expect(firmaValida(Buffer.from('{}'), firma, 'secret')).toBe(false);
    expect(firmaValida(raw, undefined, 'secret')).toBe(false);
    expect(firmaValida(raw, firma, undefined)).toBe(false);
  });
  it('el webhook no procesa solicitudes sin firma y solo confirma el token correcto', async () => {
    const service: any = { registrarEstados: jest.fn() };
    const controller = new WhatsappController(service);
    await expect(
      controller.recibir({
        rawBody: Buffer.from('{}'),
        headers: {},
        body: {},
      } as any),
    ).rejects.toThrow();
    expect(service.registrarEstados).not.toHaveBeenCalled();
    expect(() =>
      controller.verificar(
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong',
          'hub.challenge': '1',
        },
        {} as any,
      ),
    ).toThrow();
    const res: any = {
      type: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    controller.verificar(
      {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-test',
        'hub.challenge': '123',
      },
      res,
    );
    expect(res.send).toHaveBeenCalledWith('123');
  });
});
