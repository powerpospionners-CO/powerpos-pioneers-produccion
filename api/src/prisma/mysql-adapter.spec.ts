import { Prisma } from '@prisma/client';
import { adaptarMysql, filtrosMysql, sqlMysql } from './mysql-adapter';

describe('Adaptación MySQL aislada', () => {
  it('activa modo estricto y UTC en la misma conexión antes de escribir', async () => {
    const orden: string[] = [];
    const tx: any = { $executeRawUnsafe: async (sql: string) => { orden.push(sql); }, producto: { create: async () => { orden.push('crear'); return { id: 1 }; } } };
    const cliente: any = adaptarMysql({ $use: jest.fn(), producto: {}, $transaction: async (fn: any) => fn(tx) });
    await cliente.producto.create({ data: {} });
    expect(orden[0]).toContain('STRICT_ALL_TABLES');
    expect(orden[1]).toContain("time_zone='+00:00'");
    expect(orden[2]).toBe('crear');
    orden.length = 0;
    await cliente.$transaction(async (conexion: any) => conexion.producto.create({ data: {} }));
    expect(orden).toHaveLength(3);
    expect(orden[0]).toContain('STRICT_ALL_TABLES');
  });
  it('convierte identificadores sin interpolar valores, incluso en listas SQL', async () => {
    const db: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const tx = adaptarMysql(db, true);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM productos WHERE id IN (${Prisma.join([1, 2])}) AND "empresaId"=${3} FOR UPDATE`);
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith('SELECT id FROM productos WHERE id IN (?,?) AND `empresaId`=? FOR UPDATE', 1, 2, 3);
  });
  it('sustituye los bloqueos por filas dentro de la misma transacción', async () => {
    const db: any = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    const tx = adaptarMysql(db, true);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${2}::integer)`;
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), '73103', '2');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${2}, 81727)`;
    expect(db.$executeRawUnsafe).toHaveBeenLastCalledWith(expect.any(String), '2', '81727');
  });
  it('no permite sustituir bloqueos fuera de una transacción', async () => {
    const db: any = { $use: jest.fn(), $executeRawUnsafe: jest.fn() };
    const cliente = adaptarMysql(db);
    await expect(cliente.$executeRaw`SELECT pg_advisory_xact_lock(1, ${2})`).rejects.toThrow('transacción');
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
  it('adapta filtros JSON sin alterar el objeto original ni sus fechas', () => {
    const filtro = { AND: [{ detalle: { path: ['clave'], equals: 'venta' } }, { nombre: { contains: 'sal', mode: 'insensitive' } }] };
    expect(filtrosMysql(filtro)).toEqual({ AND: [{ detalle: { path: '$."clave"', equals: 'venta' } }, { nombre: { contains: 'sal' } }] });
    expect(filtro.AND[0].detalle?.path).toEqual(['clave']);
    expect(() => sqlMysql('SELECT pg_desconocido()')).toThrow();
  });
  it('normaliza únicamente filtros y conserva el contenido JSON que se escribe', async () => {
    let middleware: any;
    adaptarMysql({ $use: (fn: any) => { middleware = fn; } });
    const data = { detalle: { path: ['sin modificar'], equals: 'valor', mode: 'insensitive' } };
    const next = jest.fn();
    await middleware({ action: 'create', args: { data } }, next);
    expect(next.mock.calls[0][0].args.data).toBe(data);
  });
});
