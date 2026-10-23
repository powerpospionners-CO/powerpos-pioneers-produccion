import { Prisma } from '@prisma/client';
import { normalizarNulosMysql } from './nulos-mysql';

describe('Nulos JSON entre clientes Prisma generados', () => {
  const mysql = {
    DbNull: { tipo: 'mysql-db-null' },
    JsonNull: { tipo: 'mysql-json-null' },
    AnyNull: { tipo: 'mysql-any-null' },
  };
  it('traduce filtros y escrituras al cliente destino sin mutar la solicitud', () => {
    const fecha = new Date(),
      decimal = new Prisma.Decimal(10);
    const original = {
      where: {
        confirmacion: { equals: Prisma.DbNull },
        OR: [{ datos: { equals: Prisma.AnyNull } }],
      },
      data: { datos: Prisma.JsonNull, fecha, decimal },
    };
    const resultado = normalizarNulosMysql(original, () => mysql);
    expect(resultado.where.confirmacion.equals).toBe(mysql.DbNull);
    expect(resultado.where.OR[0].datos.equals).toBe(mysql.AnyNull);
    expect(resultado.data.datos).toBe(mysql.JsonNull);
    expect(original.where.confirmacion.equals).toBe(Prisma.DbNull);
    expect(resultado.data.fecha).toBe(fecha);
    expect(resultado.data.decimal).toBe(decimal);
  });
  it('conserva referencias y nombres de propiedades JSON si no hay sentinelas', () => {
    const original = {
      data: {
        detalle: { path: ['valor'], equals: 'texto', mode: 'insensitive' },
      },
    };
    const tipos = jest.fn(() => mysql);
    expect(normalizarNulosMysql(original, tipos)).toBe(original);
    expect(tipos).not.toHaveBeenCalled();
  });
});
