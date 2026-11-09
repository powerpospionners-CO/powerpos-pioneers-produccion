import { Prisma } from '@prisma/client';
import { conexionNuevaMysql, provisionarMysql, registrarConexionMysql } from './sedes-provision.mysql';
import { cifrarConexion, descifrarConexion } from './conexion-cifrada';
import { identidadBase } from './sede-databases';

describe('Activación de sedes MySQL', () => {
  const original = { ...process.env };
  beforeEach(() => { process.env.DATABASE_URL = 'mysql://control:secreto@127.0.0.1:3306/u748056473_ppcontrol'; process.env.SEDE_DATABASE_ENCRYPTION_KEY = 'a'.repeat(64); });
  afterEach(() => { process.env = { ...original }; });
  const datos = { base: 'u748056473_cajica', usuario: 'u748056473_cajica', password: 'Seguro@:/#%' };
  it('mantiene el servidor y codifica contraseñas sin permitir la base de control ni otra cuenta', () => {
    const url = new URL(conexionNuevaMysql(datos));
    expect(url.hostname).toBe('127.0.0.1');
    expect(decodeURIComponent(url.password)).toBe(datos.password);
    expect(() => conexionNuevaMysql({ ...datos, base: 'u748056473_ppcontrol' })).toThrow('base de control');
    expect(() => conexionNuevaMysql({ ...datos, base: 'otra_cuenta' })).toThrow('misma cuenta');
    expect(() => conexionNuevaMysql({ ...datos, base: 'base;DROP TABLE empresas' })).toThrow('Completa');
  });
  it('una sede sin conexión devuelve instrucciones y no ejecuta consultas PostgreSQL', async () => {
    const control = { baseSede: { findUnique: jest.fn().mockResolvedValue(null) } };
    const Cliente = jest.fn();
    await expect(provisionarMysql(control, Cliente, 3, 3)).rejects.toThrow('Conectar base de la sede');
    expect(Cliente).not.toHaveBeenCalled();
  });
  it('rechaza una sede ajena antes de conectar', async () => {
    const control = { sucursal: { findFirst: jest.fn().mockResolvedValue(null) } };
    const Cliente = jest.fn();
    await expect(registrarConexionMysql(control, Cliente, 3, 2, datos)).rejects.toThrow('no pertenece');
    expect(Cliente).not.toHaveBeenCalled();
  });
  it('rechaza bases usadas por otra sede antes de conectar', async () => {
    const control = { sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) }, baseSede: { findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ empresaId: 2, sucursalId: 2 }) } };
    const Cliente = jest.fn();
    await expect(registrarConexionMysql(control, Cliente, 3, 3, datos)).rejects.toThrow('otra sede');
    expect(Cliente).not.toHaveBeenCalled();
  });
  it('no registra una base no vacía', async () => {
    const control = { sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) }, baseSede: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } };
    const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ nombre: 'empresas' }]), $disconnect: jest.fn() };
    const Cliente = jest.fn().mockImplementation(() => db);
    await expect(registrarConexionMysql(control, Cliente, 3, 3, datos)).rejects.toThrow('vacía');
    expect(control.baseSede.create).not.toHaveBeenCalled();
    expect(db.$disconnect).toHaveBeenCalled();
  });
  it('guarda la conexión cifrada y nunca retorna la contraseña', async () => {
    const create = jest.fn();
    const control = { sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) }, empresa: { findUnique: jest.fn().mockResolvedValue({ tiendaSlug: 'cajica' }) }, baseSede: { findUnique: jest.fn().mockResolvedValue(null), create } };
    const Cliente = jest.fn().mockImplementation(() => ({ $queryRawUnsafe: jest.fn().mockResolvedValue([]), $disconnect: jest.fn() }));
    expect(await registrarConexionMysql(control, Cliente, 3, 3, datos)).toBeUndefined();
    const registro = create.mock.calls[0][0].data;
    expect(registro.conexionCifrada).not.toContain(datos.password);
    expect(new URL(descifrarConexion(registro.conexionCifrada, 3, 3)).pathname).toBe('/u748056473_cajica');
  });
  it('no sobrescribe una base de otra sede aunque esté registrada', async () => {
    const conexion = conexionNuevaMysql(datos);
    const tx: any = { $queryRawUnsafe: jest.fn(async sql => sql.includes('GET_LOCK') ? [{ tomado: 1 }] : sql.includes('information_schema') ? [{ nombre: 'empresas' }] : []), selloBaseSede: { findUnique: jest.fn().mockResolvedValue({ empresaId: 2, sucursalId: 2 }) }, empresa: { count: jest.fn() } };
    const raw: any = { $use: jest.fn(), $transaction: jest.fn(fn => fn(tx)), $disconnect: jest.fn() };
    const control: any = { baseSede: { findUnique: jest.fn().mockResolvedValue({ id: 3, conexionCifrada: cifrarConexion(conexion, 3, 3), identidadBase: identidadBase(conexion), estado: 'PREPARANDO' }), update: jest.fn() }, empresa: { findUnique: jest.fn().mockResolvedValue({ id: 3 }) }, sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) }, usuario: { findMany: jest.fn().mockResolvedValue([{ id: 12 }]) } };
    await expect(provisionarMysql(control, jest.fn().mockImplementation(() => raw), 3, 3)).rejects.toThrow('no corresponde');
    expect(control.baseSede.update).not.toHaveBeenCalled();
    expect(raw.$disconnect).toHaveBeenCalled();
  });
});
