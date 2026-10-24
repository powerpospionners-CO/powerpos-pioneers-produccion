import { AccesoBarrasService } from './acceso-barras.service';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';

describe('Acceso limitado a códigos de barras', () => {
  const usuario = { id: 7, empresaId: 2, sucursalId: 2 };
  const token = 'a'.repeat(64);
  const preparar = () => {
    let config: any = { id: 10, detalle: { habilitado: true, hash: '' } };
    let sesion: any = { detalle: { hash: createHash('sha256').update(token).digest('hex'), configuracionId: 10, venceEn: Date.now() + 60000, sucursalId: 2 } };
    const db: any = {
      auditoria: { findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.entidad === 'AccesoBarrasConfiguracion' ? config : sesion)), create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(1) },
      usuario: { findFirst: jest.fn().mockResolvedValue({ id: 7, rol: 'CAJERO' }) },
      producto: { findMany: jest.fn().mockResolvedValue([]) }, $transaction: jest.fn(),
    };
    return { db, config, sesion, servicio: new AccesoBarrasService(db) };
  };
  it('requiere autorización, token de este usuario, misma sucursal y sesión vigente', async () => {
    const { db, servicio, sesion, config } = preparar();
    await servicio.verificar(usuario, token);
    expect(db.auditoria.findFirst.mock.calls[0][0].where).toMatchObject({ empresaId: 2, entidadId: 7 });
    await expect(servicio.verificar(usuario, 'b'.repeat(64))).rejects.toThrow();
    await expect(servicio.verificar({ ...usuario, sucursalId: 3 }, token)).rejects.toThrow();
    sesion.detalle.venceEn = 1;
    await expect(servicio.verificar(usuario, token)).rejects.toThrow();
    config.detalle.habilitado = false;
    await expect(servicio.verificar(usuario, token)).rejects.toThrow();
  });
  it('limita intentos en la base compartida antes de verificar el código', async () => {
    const { db, servicio } = preparar();
    db.auditoria.count.mockResolvedValue(6);
    await expect(servicio.desbloquear(usuario, '12345678')).rejects.toThrow('15 minutos');
    expect(db.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entidad: 'AccesoBarrasIntento' }) }));
  });
  it('genera un código y guarda solamente su hash, sin autorizar usuarios de otra empresa', async () => {
    const { db, servicio } = preparar();
    const resultado = await servicio.configurar(7, true, { ...usuario, id: 9 });
    expect(resultado.codigo).toMatch(/^\d{8}$/);
    const datos = db.auditoria.create.mock.calls[0][0].data;
    expect(datos.usuarioId).toBe(9);
    expect(await bcrypt.compare(resultado.codigo!, datos.detalle.hash)).toBe(true);
    expect(JSON.stringify(datos)).not.toContain(resultado.codigo);
    db.usuario.findFirst.mockResolvedValue(null);
    await expect(servicio.configurar(7, true, { ...usuario, empresaId: 3 })).rejects.toThrow();
    expect(db.usuario.findFirst.mock.calls[1][0].where.empresaId).toBe(3);
  });
  it('rechaza cambios a precio o inventario aunque el token sea válido', async () => {
    const { db, servicio } = preparar();
    await expect(servicio.guardar(usuario, token, 4, { codigoBarras: '123', anterior: null, precio: 1 })).rejects.toThrow('Solo puedes');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('devuelve solo datos de identificación y filtra por empresa', async () => {
    const { db, servicio } = preparar();
    await servicio.listar(usuario, token, 'Arroz', '4', 'true');
    expect(db.producto.findMany.mock.calls[0][0]).toMatchObject({ where: { empresaId: 2, activo: true, id: { gt: 4 } }, select: { id: true, nombre: true, codigoBarras: true }, take: 51 });
  });
});
