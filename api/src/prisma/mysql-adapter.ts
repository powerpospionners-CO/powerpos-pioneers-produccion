import { Prisma, PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

export function motorBase() {
  const motor = process.env.DATABASE_ENGINE || 'postgresql';
  if (!['postgresql', 'mysql'].includes(motor)) throw new Error('Motor de base no válido');
  return motor;
}

export function claseCliente(): typeof PrismaClient {
  if (motorBase() === 'postgresql') return PrismaClient;
  // Cliente separado: generar desde prisma/mysql/schema.prisma antes de arrancar.
  return require(resolve(__dirname, '../../generated/prisma-mysql')).PrismaClient;
}

export function filtrosMysql(valor: any): any {
  if (Array.isArray(valor)) return valor.map(filtrosMysql);
  if (!valor || Object.getPrototypeOf(valor) !== Object.prototype) return valor;
  const salida: any = {};
  for (const [clave, dato] of Object.entries(valor)) {
    if (clave === 'mode' && ['insensitive', 'default'].includes(dato as string)) continue;
    if (clave === 'path' && Array.isArray(dato) && ('equals' in valor || 'not' in valor || 'array_contains' in valor)) {
      if (!dato.every(p => typeof p === 'string')) throw new Error('Ruta JSON no compatible');
      salida.path = '$' + dato.map(p => '.' + JSON.stringify(p)).join('');
    } else salida[clave] = filtrosMysql(dato);
  }
  return salida;
}

function normalizarArgumentos(args: any): any {
  if (!args || Object.getPrototypeOf(args) !== Object.prototype) return args;
  const resultado = { ...args };
  if (args.where) resultado.where = filtrosMysql(args.where);
  for (const seleccion of ['include', 'select']) {
    if (args[seleccion]) resultado[seleccion] = Object.fromEntries(Object.entries(args[seleccion]).map(([k, v]) => [k, normalizarArgumentos(v)]));
  }
  return resultado;
}

function consulta(args: any[]) {
  const sql = Array.isArray(args[0]) ? Prisma.sql(args[0], ...args.slice(1)) : args[0];
  if (!sql || typeof sql.sql !== 'string' || !Array.isArray(sql.values)) throw new Error('Consulta sin parámetros');
  return { texto: sql.sql as string, valores: [...sql.values] };
}

export function sqlMysql(texto: string) {
  const convertido = texto.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`').replace(/::(?:integer|int)\b/g, '');
  if (/pg_[a-z_]+|::/.test(convertido)) throw new Error('Consulta PostgreSQL sin adaptación MySQL');
  return convertido;
}

export function adaptarMysql<T>(cliente: T, enTransaccion = false): T {
  const db: any = cliente;
  const modelos = new Set(Prisma.dmmf.datamodel.models.map(m => m.name[0].toLowerCase() + m.name.slice(1)));
  const escrituras = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
  const preparar = async (tx: any) => {
    // Se ejecuta sobre la conexión de la transacción, incluso tras reconexiones.
    await tx.$executeRawUnsafe("SET SESSION sql_mode='STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    await tx.$executeRawUnsafe("SET SESSION time_zone='+00:00'");
  };
  if (!enTransaccion) db.$use(async (params, next) => next({ ...params, args: normalizarArgumentos(params.args) }));
  return new Proxy(db, {
    get(target, nombre) {
      if (nombre === '$transaction') return (trabajo: any, opciones?: any) => {
        if (typeof trabajo !== 'function') throw new Error('MySQL requiere una transacción con callback');
        return target.$transaction(async (tx: any) => {
          await preparar(tx);
          return trabajo(adaptarMysql(tx, true));
        }, opciones);
      };
      if (!enTransaccion && typeof nombre === 'string' && modelos.has(nombre)) {
        return new Proxy(target[nombre], {
          get(delegate, operacion) {
            const valor = Reflect.get(delegate, operacion);
            if (typeof operacion === 'string' && escrituras.has(operacion)) return (...args: any[]) => target.$transaction(async (tx: any) => {
              await preparar(tx);
              return tx[nombre][operacion](...args);
            });
            return typeof valor === 'function' ? valor.bind(delegate) : valor;
          },
        });
      }
      if (nombre === '$queryRaw' || nombre === '$executeRaw') return async (...args: any[]) => {
        const { texto, valores } = consulta(args);
        const bloqueo = texto.trim().match(/^SELECT\s+pg_advisory_xact_lock\(\s*(\?|\d+)(?:::(?:integer|int))?\s*,\s*(\?|\d+)(?:::(?:integer|int))?\s*\)\s*;?$/i);
        if (bloqueo) {
          if (!enTransaccion || nombre !== '$executeRaw') throw new Error('El bloqueo requiere una transacción');
          const claves = bloqueo.slice(1).map(p => p === '?' ? valores.shift() : Number(p));
          if (valores.length || !claves.every(Number.isSafeInteger)) throw new Error('Clave de bloqueo no válida');
          // InnoDB conserva este bloqueo exclusivo hasta COMMIT/ROLLBACK.
          return target.$executeRawUnsafe('INSERT INTO `_powerpos_transaction_locks` (`namespace`,`scope`) VALUES (?,?) ON DUPLICATE KEY UPDATE `scope`=`scope`', ...claves.map(String));
        }
        return target[nombre === '$queryRaw' ? '$queryRawUnsafe' : '$executeRawUnsafe'](sqlMysql(texto), ...valores);
      };
      const valor = Reflect.get(target, nombre);
      return typeof valor === 'function' ? valor.bind(target) : valor;
    },
  });
}
