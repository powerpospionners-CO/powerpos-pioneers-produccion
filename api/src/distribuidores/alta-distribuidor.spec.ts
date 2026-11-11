import { DistribuidoresService } from './distribuidores.service';
import { correoDistribuidor, dominioDistribuidor, siguienteCodigo } from './alta-distribuidor';
jest.mock('bcrypt', () => ({ hash: jest.fn(async () => 'hash-prueba') }));

describe('Alta automática de distribuidores', () => {
  it('empieza en 001, toma el máximo numérico y continúa después de 999', () => {
    expect(siguienteCodigo([]).codigo).toBe('DIST-001');
    expect(siguienteCodigo(['DIST-009', 'DIST-002', 'DIST-010', 'OTRO']).codigo).toBe('DIST-011');
    expect(siguienteCodigo(['DIST- 012', 'DIST-005']).codigo).toBe('DIST-013');
    expect(siguienteCodigo(['DIST-999']).codigo).toBe('DIST-1000');
    expect(siguienteCodigo(['DIST-002'], 15).codigo).toBe('DIST-016');
  });
  it('conserva el dominio existente de la marca y normaliza empresas nuevas', () => {
    expect(dominioDistribuidor('ENCHILA MARKET PEREIRA', ['uno@distribuidor.enchilamarket.com'])).toBe('distribuidor.enchilamarket.com');
    expect(dominioDistribuidor('Café La Unión', [])).toBe('distribuidor.cafelaunion.com');
    expect(correoDistribuidor(' Juan.Perez ', 'distribuidor.negocio.com')).toBe('juan.perez@distribuidor.negocio.com');
    for (const valor of ['juan@otra.com', 'Juan Pérez', 'juan..perez', '', '@negocio.com']) expect(() => correoDistribuidor(valor, 'distribuidor.negocio.com')).toThrow();
  });
  function escenario() {
    const reservas: any[] = [];
    const central: any = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ nombre: 'ENCHILA MARKET PEREIRA' }) },
      distribuidor: { findMany: jest.fn().mockResolvedValue([{ codigo: 'DIST-004', usuario: { email: 'anterior@distribuidor.enchilamarket.com' } }]) },
      auditoria: { findFirst: jest.fn(async () => reservas[reservas.length - 1] ?? null), create: jest.fn(async ({ data }) => { reservas.push(data); return data; }) },
      $queryRaw: jest.fn(),
    };
    let cola = Promise.resolve();
    central.$transaction = jest.fn(fn => { const resultado = cola.then(() => fn(central)); cola = resultado.catch(() => undefined); return resultado; });
    const tx: any = { distribuidor: { create: jest.fn(async ({ data }) => ({ id: 9, ...data })) }, usuario: { create: jest.fn() } };
    const db: any = { control: central, aislamientoActivo: false, sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) }, usuario: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn(fn => fn(tx)) };
    return { central, tx, db, servicio: new DistribuidoresService(db) };
  }
  const datos = { nombre: 'Juan', usuarioEmail: 'juan', password: 'secreto', sucursalId: 2, porcentajeComision: 10, codigo: 'DIST-999' };
  it('consulta la empresa autenticada y la vista previa no reserva números', async () => {
    const { central, servicio } = escenario();
    expect(await servicio.configuracionAlta(7)).toEqual({ siguienteCodigo: 'DIST-005', dominioCorreo: 'distribuidor.enchilamarket.com' });
    expect(central.distribuidor.findMany.mock.calls[0][0].where).toEqual({ empresaId: 7 });
    expect(central.auditoria.create).not.toHaveBeenCalled();
  });
  it('reserva números distintos para dos altas concurrentes e ignora el código del navegador', async () => {
    const { central, tx, servicio } = escenario();
    const resultado = await Promise.all([servicio.crear(datos, 7), servicio.crear({ ...datos, usuarioEmail: 'maria' }, 7)]);
    expect(resultado.map(r => r.codigo)).toEqual(['DIST-005', 'DIST-006']);
    expect(central.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.usuario.create.mock.calls[0][0].data).toMatchObject({ email: 'juan@distribuidor.enchilamarket.com', password: 'hash-prueba', rol: 'DISTRIBUIDOR', empresaId: 7 });
  });
  it('incluye los códigos de otras sedes de la empresa', async () => {
    const { central, db, servicio } = escenario();
    db.aislamientoActivo = true;
    central.baseSede = { findMany: jest.fn().mockResolvedValue([{ sucursalId: 3 }]) };
    db.contexto = jest.fn().mockResolvedValue({ cliente: { distribuidor: { findMany: jest.fn().mockResolvedValue([{ codigo: 'DIST-009', usuario: null }]) } } });
    expect((await servicio.configuracionAlta(7)).siguienteCodigo).toBe('DIST-010');
    expect(db.contexto).toHaveBeenCalledWith(7, 3, true);
  });
  it('rechaza correos ajenos y nombres repetidos sin reservar código', async () => {
    const { central, servicio } = escenario();
    await expect(servicio.crear({ ...datos, usuarioEmail: 'anterior' }, 7)).rejects.toThrow('Ya existe');
    await expect(servicio.crear({ ...datos, usuarioEmail: 'juan@otro.com' }, 7)).rejects.toThrow('sin @');
    expect(central.auditoria.create).not.toHaveBeenCalled();
  });
});
