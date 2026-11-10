// Exportación PostgreSQL/MySQL de solo lectura. No importa ni cambia conexiones.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createCipheriv, createDecipheriv, randomBytes, createHash } = require('node:crypto');
const { Prisma, PrismaClient } = require('@prisma/client');
const modelos = Prisma.dmmf.datamodel.models;
const hash = valor => createHash('sha256').update(valor).digest('hex');
const q = nombre => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nombre)) throw Error('Identificador no válido');
  return `"${nombre}"`;
};
function cifrar(valor, clave) {
  if (!Buffer.isBuffer(clave) || clave.length !== 32) throw Error('Clave de respaldo no válida');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', clave, iv);
  cipher.setAAD(Buffer.from('PowerPOS-Migracion-1'));
  const datos = Buffer.concat([cipher.update(JSON.stringify(valor), 'utf8'), cipher.final()]);
  return JSON.stringify({ formato: 1, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), datos: datos.toString('base64') });
}
function descifrar(texto, clave) {
  const valor = JSON.parse(texto);
  if (valor.formato !== 1) throw Error('Formato de respaldo desconocido');
  const cipher = createDecipheriv('aes-256-gcm', clave, Buffer.from(valor.iv, 'hex'));
  cipher.setAAD(Buffer.from('PowerPOS-Migracion-1'));
  cipher.setAuthTag(Buffer.from(valor.tag, 'hex'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(valor.datos, 'base64')), cipher.final()]).toString('utf8'));
}
async function extraer(db, seleccion = modelos, motor = 'postgresql') {
  if (!['postgresql', 'mysql'].includes(motor)) throw Error('Motor de respaldo inválido');
  const mysql = motor === 'mysql';
  const identificador = nombre => mysql ? q(nombre).replace(/"/g, '`') : q(nombre);
  return db.$transaction(async tx => {
    // MySQL no permite cambiar READ ONLY después de BEGIN. Este recorrido
    // ejecuta exclusivamente SELECT; usar un usuario con permisos de lectura.
    if (!mysql) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const tablas = {};
    let cantidad = 0;
    for (const modelo of seleccion) {
      const fields = modelo.fields.filter(f => f.kind !== 'object');
      // Mantener decimales y timestamps como texto evita perder precisión.
      const columnas = fields.map(f => {
        const columna = identificador(f.dbName || f.name);
        const texto = ['Decimal', 'DateTime', 'BigInt', 'Json'].includes(f.type) || (mysql && f.isList);
        return `${texto ? (mysql ? `CAST(${columna} AS CHAR)` : `${columna}::text`) : columna} AS ${identificador(f.name)}`;
      }).join(',');
      const filas = [];
      let cursor;
      for (;;) {
        const lote = await tx.$queryRawUnsafe(`SELECT ${columnas} FROM ${identificador(modelo.dbName || modelo.name)}${cursor === undefined ? '' : ` WHERE id > ${mysql ? '?' : '$1'}`} ORDER BY id LIMIT 1000`, ...(cursor === undefined ? [] : [cursor]));
        filas.push(...lote); cantidad += lote.length;
        if (cantidad > 500000) throw Error('Respaldo excede el límite de memoria verificado; requiere exportación por streaming');
        if (lote.length < 1000) break;
        cursor = lote[lote.length - 1].id;
      }
      tablas[modelo.name] = { campos: fields.map(f => ({ nombre: f.name, tipo: f.type, lista: f.isList })), filas };
    }
    return { formato: 1, fecha: new Date().toISOString(), motorOrigen: motor, esquema: hash(JSON.stringify(seleccion)), tablas };
  }, { isolationLevel: 'RepeatableRead', timeout: 300000 });
}
async function main() {
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({ tablas: modelos.length, soloLectura: true, respaldoCifrado: true, requiereCopiaPorBase: true, corteProduccion: false }));
    return;
  }
  const etiqueta = process.argv[2];
  if (!/^(control|sede-[1-9]\d*-[1-9]\d*)$/.test(etiqueta || '')) throw Error('Indica control o sede-EMPRESA-SUCURSAL');
  require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
  const origen = new URL(process.env.MIGRACION_ORIGEN_URL || process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:', 'mysql:'].includes(origen.protocol)) throw Error('Motor de origen inválido');
  const motor = origen.protocol === 'mysql:' ? 'mysql' : 'postgresql';
  const Cliente = motor === 'mysql' ? require('../generated/prisma-mysql').PrismaClient : PrismaClient;
  origen.searchParams.set('connect_timeout', '10');
  const db = new Cliente({ datasources: { db: { url: origen.toString() } }, log: [] });
  try {
    const datos = await extraer(db, modelos, motor);
    const raiz = process.env.BACKUP_DIRECTORY ? path.resolve(process.env.BACKUP_DIRECTORY) : path.resolve(__dirname, '../../.tools/respaldos');
    await fs.mkdir(raiz, { recursive: true });
    const clave = randomBytes(32), sello = `${etiqueta}-${Date.now()}`;
    const archivo = path.join(raiz, `${sello}.powerpos-backup`);
    const raizClaves = process.env.BACKUP_KEY_DIRECTORY ? path.resolve(process.env.BACKUP_KEY_DIRECTORY) : raiz;
    await fs.mkdir(raizClaves, { recursive: true });
    const llave = path.join(raizClaves, `${sello}.private`);
    // Archivos nuevos exclusivamente: nunca reemplaza un respaldo anterior.
    await fs.writeFile(llave, clave.toString('hex'), { flag: 'wx', mode: 0o600 });
    await fs.writeFile(archivo, cifrar(datos, clave), { flag: 'wx', mode: 0o600 });
    const comprobado = descifrar(await fs.readFile(archivo, 'utf8'), clave);
    if (hash(JSON.stringify(comprobado)) !== hash(JSON.stringify(datos))) throw Error('El respaldo no coincide');
    const contenido = await fs.readFile(archivo);
    await fs.writeFile(path.join(raiz, `${sello}.manifest.json`), JSON.stringify({ creadoEn: datos.fecha, archivos: [{ ruta: path.basename(archivo), bytes: contenido.length, sha256: hash(contenido) }] }), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ respaldoVerificado: true, etiqueta, tablas: Object.keys(datos.tablas).length, registros: Object.values(datos.tablas).reduce((n, t) => n + t.filas.length, 0), origenSinModificar: true }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => {
  console.error('No se completó el respaldo. No se modificaron bases ni se imprimieron credenciales.');
  process.exitCode = 1;
});
module.exports = { cifrar, descifrar, extraer };
