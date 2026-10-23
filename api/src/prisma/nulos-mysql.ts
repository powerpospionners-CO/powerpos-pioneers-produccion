import { Prisma } from '@prisma/client';
import { resolve } from 'node:path';

type Nulos = Record<'DbNull' | 'JsonNull' | 'AnyNull', unknown>;
function tiposMysql(): Nulos {
  // Cada cliente generado tiene sus propias instancias de estos valores.
  return (
    require(resolve(__dirname, '../../generated/prisma-mysql')) as {
      Prisma: Nulos;
    }
  ).Prisma;
}

export function normalizarNulosMysql<T>(
  valor: T,
  tipos: () => Nulos = tiposMysql,
): T {
  for (const nombre of ['DbNull', 'JsonNull', 'AnyNull'] as const) {
    if (valor === Prisma[nombre]) return tipos()[nombre] as T;
  }
  if (Array.isArray(valor)) {
    const resultado = valor.map((v) => normalizarNulosMysql(v, tipos));
    return resultado.every((v, i) => v === valor[i]) ? valor : (resultado as T);
  }
  if (
    !valor ||
    typeof valor !== 'object' ||
    Object.getPrototypeOf(valor) !== Object.prototype
  )
    return valor;
  const entradas = Object.entries(valor as Record<string, unknown>);
  const resultado = entradas.map(
    ([clave, dato]) => [clave, normalizarNulosMysql(dato, tipos)] as const,
  );
  return resultado.every(([, dato], i) => dato === entradas[i][1])
    ? valor
    : (Object.fromEntries(resultado) as T);
}
