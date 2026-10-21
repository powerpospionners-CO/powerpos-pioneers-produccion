// Carga exclusivamente en destinos nuevos de Hostinger. No habilita la API ni cambia DNS.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { descifrar } = require('./export-migracion-mysql.cjs');
const modelos = Prisma.dmmf.datamodel.models;
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const q = v => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) throw Error('Identificador inválido');
  return '`' + v + '`';
};
const campos = m => m.fields.filter(f => f.kind !== 'object');
const tabla = m => q(m.dbName || m.name);
// Ignorar espacios fuera de cadenas JSON sin convertir sus números a Number.
function jsonCompacto(texto) {
  JSON.parse(texto); // Validar sin usar el resultado para convertir los datos.
  let cadena = false, escape = false, salida = '';
  for (const c of texto) {
    if (cadena) {
      salida += c;
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') cadena = false;
    } else if (c === '"') { cadena = true; salida += c; }
    else if (!/\s/.test(c)) salida += c;
  }
  return salida;
}
function normalizar(f, valor) {
  if (valor === null) {
    if (f.isRequired) throw Error('Campo obligatorio nulo');
    return null;
  }
  if (f.isList) {
    const lista = typeof valor === 'string' ? JSON.parse(valor) : valor;
    if (!Array.isArray(lista) || !lista.every(v => typeof v === 'string')) throw Error('Lista inválida');
    return JSON.stringify(lista);
  }
  if (f.type === 'Json') return jsonCompacto(valor);
  if (f.type === 'Decimal') {
    if (!/^-?\d+(\.\d+)?$/.test(String(valor))) throw Error('Decimal inválido');
    let [entero, decimales = ''] = String(valor).split('.');
    decimales = decimales.replace(/0+$/, '');
    entero = entero.replace(/^(-?)0+(?=\d)/, '$1');
    if (entero === '-0' && !decimales) entero = '0';
    return entero + (decimales ? '.' + decimales : '');
  }
  if (f.type === 'DateTime') {
    const texto = String(valor);
    if (/^\d{4}-\d\d-\d\d$/.test(texto) && Number.isFinite(Date.parse(texto + 'T00:00:00Z'))) return texto;
    const fecha = texto.match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(?:\.(\d+))?(?:Z|\+00(?::?00)?)?$/);
    if (!fecha || /[1-9]/.test((fecha[3] || '').slice(3))) throw Error('Fecha incompatible con DATETIME(3)');
    const salida = fecha[1] + ' ' + fecha[2] + '.' + (fecha[3] || '').padEnd(3, '0').slice(0, 3);
    if (!Number.isFinite(Date.parse(salida.replace(' ', 'T') + 'Z'))) throw Error('Fecha inválida');
    return salida;
  }
  if (f.type === 'Boolean') {
    if (![true, false, 0, 1].includes(valor)) throw Error('Booleano inválido');
    return Boolean(valor);
  }
  if (f.type === 'Int') {
    if (!Number.isSafeInteger(valor) || valor < -2147483648 || valor > 2147483647) throw Error('Entero inválido');
    return valor;
  }
  if (typeof valor !== 'string') throw Error('Texto inválido');
  if (f.kind === 'enum') {
    const e = Prisma.dmmf.datamodel.enums.find(e => e.name === f.type);
    if (!e?.values.some(v => v.name === valor)) throw Error('Enum inválido');
  }
  return valor;
}
function validarSnapshot(snapshot) {
  if (snapshot.formato !== 1 || snapshot.motorOrigen !== 'postgresql' || snapshot.esquema !== hash(modelos)) throw Error('Esquema del respaldo diferente');
  if (Object.keys(snapshot.tablas).length !== modelos.length) throw Error('Respaldo incompleto');
  const datos = new Map();
  for (const m of modelos) {
    const t = snapshot.tablas[m.name], fs = campos(m);
    if (!t || JSON.stringify(t.campos) !== JSON.stringify(fs.map(f => ({ nombre: f.name, tipo: f.type, lista: f.isList })))) throw Error('Columnas incompatibles');
    const filas = t.filas.map(r => {
      if (Object.keys(r).length !== fs.length || fs.some(f => !Object.hasOwn(r, f.name))) throw Error('Fila incompleta');
      return Object.fromEntries(fs.map(f => [f.name, normalizar(f, r[f.name])]));
    });
    if (new Set(filas.map(r => r.id)).size !== filas.length) throw Error('IDs duplicados');
    datos.set(m.name, filas);
  }
  // Verificar todas las referencias antes de escribir una sola fila.
  for (const m of modelos) for (const f of m.fields.filter(f => f.relationFromFields?.length)) {
    const referencias = new Set(datos.get(f.type).map(r => JSON.stringify(f.relationToFields.map(k => r[k]))));
    for (const r of datos.get(m.name)) {
      const valores = f.relationFromFields.map(k => r[k]);
      if (valores.some(v => v === null)) continue;
      if (!referencias.has(JSON.stringify(valores))) throw Error('Referencia ausente en ' + m.name);
    }
  }
  return datos;
}
async function importar(db, snapshot) {
  const datos = validarSnapshot(snapshot);
  const verificadas = await db.$transaction(async tx => {
    const estructura = await tx.$queryRawUnsafe("SELECT TABLE_NAME AS nombre, ENGINE AS motor, TABLE_COLLATION AS comparacion FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");
    const esperadas = new Set([...modelos.map(m => m.dbName || m.name), '_powerpos_transaction_locks']);
    if (estructura.length !== esperadas.size || estructura.some(t => !esperadas.has(t.nombre) || t.motor !== 'InnoDB' || t.comparacion !== 'utf8mb4_unicode_ci')) throw Error('Estructura de destino no verificada');
    await tx.$executeRawUnsafe("SET SESSION sql_mode='STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    await tx.$executeRawUnsafe("SET SESSION time_zone='+00:00'");
    const [modo] = await tx.$queryRawUnsafe('SELECT @@SESSION.sql_mode AS modo');
    if (!String(modo.modo).includes('STRICT_ALL_TABLES')) throw Error('No se activó modo estricto');
    // El esquema se crea por separado; jamás borrar ni reemplazar filas existentes.
    for (const m of modelos) {
      const [r] = await tx.$queryRawUnsafe(`SELECT COUNT(*) AS cantidad FROM ${tabla(m)}`);
      if (Number(r.cantidad) !== 0) throw Error('Destino no vacío: ' + m.name);
    }
    await tx.$executeRawUnsafe('SET SESSION FOREIGN_KEY_CHECKS=0');
    try {
      for (const m of modelos) {
        const fs = campos(m), filas = datos.get(m.name);
        for (let inicio = 0; inicio < filas.length; inicio += 50) {
          const lote = filas.slice(inicio, inicio + 50);
          const sql = `INSERT INTO ${tabla(m)} (${fs.map(f => q(f.dbName || f.name)).join(',')}) VALUES ${lote.map(() => '(' + fs.map(() => '?').join(',') + ')').join(',')}`;
          try { await tx.$executeRawUnsafe(sql, ...lote.flatMap(r => fs.map(f => r[f.name]))); }
          catch (e) { throw Error(`Carga rechazada: ${m.name} (${e.code || 'ERROR'},${e.meta?.code || 'sin código'})`); }
        }
        const columnas = fs.map(f => `${['Decimal','DateTime','Json'].includes(f.type) || f.isList ? 'CAST(' + q(f.dbName || f.name) + ' AS CHAR)' : q(f.dbName || f.name)} AS ${q(f.name)}`).join(',');
        const copia = await tx.$queryRawUnsafe(`SELECT ${columnas} FROM ${tabla(m)} ORDER BY id`);
        const normalizadas = copia.map(r => Object.fromEntries(fs.map(f => [f.name, normalizar(f, r[f.name])])));
        const ordenar = filas => [...filas].sort((a,b) => typeof a.id === 'number' ? a.id-b.id : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        if (hash(ordenar(normalizadas)) !== hash(ordenar(filas))) throw Error('Verificación de datos falló: ' + m.name);
      }
      // Reactivar checks no valida filas anteriores: comprobar huérfanos explícitamente.
      for (const m of modelos) for (const f of m.fields.filter(f => f.relationFromFields?.length)) {
        const padre = modelos.find(m => m.name === f.type);
        const campoDb = (modelo, k) => q(modelo.fields.find(f => f.name === k).dbName || k);
        const union = f.relationFromFields.map((k,i) => `h.${campoDb(m,k)}=p.${campoDb(padre,f.relationToFields[i])}`).join(' AND ');
        const presentes = f.relationFromFields.map(k => `h.${campoDb(m,k)} IS NOT NULL`).join(' AND ');
        const [r] = await tx.$queryRawUnsafe(`SELECT COUNT(*) AS cantidad FROM ${tabla(m)} h LEFT JOIN ${tabla(padre)} p ON ${union} WHERE ${presentes} AND p.${campoDb(padre,f.relationToFields[0])} IS NULL`);
        if (Number(r.cantidad)) throw Error('Relación inválida: ' + m.name);
      }
    } finally { await tx.$executeRawUnsafe('SET SESSION FOREIGN_KEY_CHECKS=1'); }
    return modelos.map(m => ({ tabla: m.name, filas: datos.get(m.name).length }));
  }, { timeout: 600000, maxWait: 15000 });
  return { verificado: true, tablas: verificadas, produccionHabilitada: false };
}
async function main() {
  const [, , archivo, archivoClave, accion] = process.argv;
  if (!archivo || !archivoClave) throw Error('Falta respaldo privado');
  const clave = (await fs.readFile(archivoClave, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/i.test(clave)) throw Error('Clave inválida');
  const snapshot = descifrar(await fs.readFile(archivo, 'utf8'), Buffer.from(clave, 'hex'));
  const datos = validarSnapshot(snapshot);
  if (accion !== '--apply') {
    console.log(JSON.stringify({ respaldoValido: true, tablas: datos.size, filas: [...datos.values()].reduce((n,r) => n+r.length,0), destinoModificado: false }));
    return;
  }
  const url = new URL(process.env.MYSQL_DATABASE_URL);
  if (url.protocol !== 'mysql:' || !/^\/u748056473_pp(control|trailer|enchila)$/.test(url.pathname)) throw Error('Destino no autorizado');
  const { PrismaClient } = require(path.join(__dirname, '../generated/prisma-mysql'));
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try { console.log(JSON.stringify(await importar(db, snapshot))); }
  finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => {
  console.error('Importación detenida. No se habilitó producción ni se imprimieron datos privados. Revisar validación y conexión antes de continuar.');
  process.exitCode = 1;
});
module.exports = { normalizar, jsonCompacto, validarSnapshot, importar };
