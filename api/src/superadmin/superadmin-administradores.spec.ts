import { SuperadminService } from './superadmin.service';
import * as bcrypt from 'bcrypt';

function usuarios() {
  const filas: any[] = [];
  return {
    filas,
    findUnique: jest.fn(async ({ where }) => filas.find(u => u.email === where.email) ?? null),
    count: jest.fn(async () => filas.length),
    create: jest.fn(async ({ data }) => {
      const usuario = { ...data, id: filas.length + 1, activo: true };
      filas.push(usuario);
      return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, activo: true };
    }),
    findMany: jest.fn(async () => filas.map(({ password, ...u }) => u)),
  };
}

function escenario(aislamientoActivo = false, activa = false) {
  const root: any = {
    empresa: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
    sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 11 }), findMany: jest.fn().mockResolvedValue([{ id: 11, nombre: 'Principal', activo: activa }]) },
    baseSede: {
      findUnique: jest.fn().mockResolvedValue(activa ? { empresaId: 7, sucursalId: 11, estado: 'ACTIVA' } : null),
      findMany: jest.fn().mockResolvedValue(activa ? [{ empresaId: 7, sucursalId: 11, estado: 'ACTIVA' }] : []),
    },
    usuario: usuarios(), $queryRaw: jest.fn(),
  };
  root.$transaction = jest.fn(fn => fn(root));
  const sede: any = { usuario: usuarios(), $queryRaw: jest.fn() };
  sede.$transaction = jest.fn(fn => fn(sede));
  const prisma: any = { ...root, control: root, aislamientoActivo, contexto: jest.fn().mockResolvedValue({ cliente: sede }) };
  const auditoria: any = { registrar: jest.fn() };
  return { root, sede, prisma, auditoria, service: new SuperadminService(prisma, auditoria) };
}
const datos = { nombre: 'Administrador nuevo', email: 'NUEVO@example.com', password: 'ClavePrueba123', sucursalId: 11 };

describe('Administradores de empresas existentes', () => {
  it('no guarda una empresa nueva si falta configurar la creación automática', async () => {
    const { prisma, auditoria, root } = escenario(true);
    const sedes: any = { validarCreacionAutomatica: jest.fn(() => { throw new Error('Falta configurar Hostinger'); }), preparar: jest.fn() };
    const service = new SuperadminService(prisma, auditoria, sedes);
    await expect(service.crearEmpresa({ empresa: { nombre: 'Nueva' }, admin: datos })).rejects.toThrow('Falta configurar');
    expect(root.$transaction).not.toHaveBeenCalled();
    expect(sedes.preparar).not.toHaveBeenCalled();
  });
  it.each([false, true])('informa la activación pendiente=%s después de guardar empresa y administradores', async pendiente => {
    const { prisma, auditoria, root } = escenario(true);
    root.empresa.findUnique.mockResolvedValue(null);
    const tx = { empresa: { create: jest.fn().mockResolvedValue({ id: 7, nombre: 'Nueva', sucursales: [{ id: 11 }] }) }, usuario: { create: jest.fn().mockResolvedValue({ id: 12 }) } };
    prisma.$transaction = jest.fn(fn => fn(tx));
    const sedes: any = { validarCreacionAutomatica: jest.fn(), preparar: pendiente ? jest.fn().mockRejectedValue(new Error('Proveedor no disponible')) : jest.fn().mockResolvedValue(undefined) };
    const service = new SuperadminService(prisma, auditoria, sedes);
    const resultado = await service.crearEmpresa({ empresa: { nombre: 'Nueva', nit: '123' }, admin: datos });
    expect(resultado).toMatchObject({ id: 7, pendienteActivacion: pendiente });
    expect(sedes.preparar).toHaveBeenCalledWith(7, 11);
    expect(tx.usuario.create).toHaveBeenCalledTimes(1);
  });
  it('crea el acceso con contraseña cifrada y permite reintentar sin duplicarlo', async () => {
    const { service, root, auditoria } = escenario();
    const primero = await service.crearAdministrador(7, datos, 1);
    const segundo = await service.crearAdministrador(7, datos, 1);
    expect(primero).toMatchObject({ email: 'nuevo@example.com', empresaId: 7, sucursalId: 11, creado: true });
    expect(segundo.creado).toBe(false);
    expect(root.usuario.filas).toHaveLength(1);
    expect(await bcrypt.compare(datos.password, root.usuario.filas[0].password)).toBe(true);
    expect(primero).not.toHaveProperty('password');
    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
  });
  it('escribe en la sede activa y conserva el control sin otro usuario duplicado', async () => {
    const { service, root, sede } = escenario(true, true);
    expect(await service.crearAdministrador(7, datos, 1)).toMatchObject({ pendienteActivacion: false });
    expect(sede.usuario.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rol: 'ADMIN_EMPRESA', empresaId: 7, sucursalId: 11 }) }));
    expect(root.usuario.create).not.toHaveBeenCalled();
  });
  it('mantiene visible al administrador cuando su sede está pendiente de activación', async () => {
    const { service, prisma } = escenario(true, false);
    expect(await service.crearAdministrador(7, datos, 1)).toMatchObject({ pendienteActivacion: true });
    expect(await service.listarAdministradores(7)).toEqual([expect.objectContaining({ nombre: datos.nombre, pendienteActivacion: true })]);
    expect(prisma.contexto).not.toHaveBeenCalled();
  });
  it('rechaza sedes de otra empresa antes de crear una cuenta', async () => {
    const { service, root } = escenario();
    root.sucursal.findFirst.mockResolvedValue(null);
    await expect(service.crearAdministrador(7, datos, 1)).rejects.toThrow('no pertenece');
    expect(root.usuario.create).not.toHaveBeenCalled();
    expect(root.sucursal.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 11, empresaId: 7 } }));
  });
  it('valida el máximo de administradores y los correos ocupados', async () => {
    const { service, root } = escenario();
    root.usuario.count.mockResolvedValue(3);
    await expect(service.crearAdministrador(7, datos, 1)).rejects.toThrow('máximo 3');
    root.usuario.filas.push({ email: datos.email.toLowerCase(), rol: 'SUPERADMIN', empresaId: null });
    await expect(service.crearAdministrador(7, datos, 1)).rejects.toThrow('ese correo');
    expect(root.usuario.create).not.toHaveBeenCalled();
  });
  it('la empresa y sus usuarios se crean dentro de la misma transacción', async () => {
    const { service, root, prisma, auditoria } = escenario();
    root.empresa.findUnique.mockResolvedValue(null);
    const tx = { empresa: { create: jest.fn().mockResolvedValue({ id: 7, sucursales: [{ id: 11 }] }) }, usuario: { create: jest.fn().mockRejectedValue(new Error('Usuario no guardado')) } };
    prisma.$transaction = jest.fn(fn => fn(tx));
    await expect(service.crearEmpresa({ empresa: { nombre: 'Nueva empresa', nit: '123', email: 'empresa@example.com' }, admin: datos }, 1)).rejects.toThrow('Usuario no guardado');
    expect(tx.empresa.create).toHaveBeenCalledTimes(1);
    expect(tx.usuario.create).toHaveBeenCalledTimes(1);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});
