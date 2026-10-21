// Exportación PostgreSQL de solo lectura. No importa datos ni cambia conexiones.
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
async function extraer(db, seleccion = modelos) {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const tablas = {};
    let cantidad = 0;
    for (const modelo of seleccion) {
      const fields = modelo.fields.filter(f => f.kind !== 'object');
      // Mantener decimales y timestamps como texto evita perder precisión.
      const columnas = fields.map(f => `${q(f.dbName || f.name)}${['Decimal', 'DateTime', 'BigInt', 'Json'].includes(f.type) ? '::text' : ''} AS ${q(f.name)}`).join(',');
      const filas = [];
      let cursor;
      for (;;) {
        const lote = await tx.$queryRawUnsafe(`SELECT ${columnas} FROM ${q(modelo.dbName || modelo.name)}${cursor === undefined ? '' : ' WHERE id > $1'} ORDER BY id LIMIT 1000`, ...(cursor === undefined ? [] : [cursor]));
        filas.push(...lote); cantidad += lote.length;
        if (cantidad > 500000) throw Error('Respaldo excede el límite de memoria verificado; requiere exportación por streaming');
        if (lote.length < 1000) break;
        cursor = lote[lote.length - 1].id;
      }
      tablas[modelo.name] = { campos: fields.map(f => ({ nombre: f.name, tipo: f.type, lista: f.isList })), filas };
    }
    return { formato: 1, fecha: new Date().toISOString(), motorOrigen: 'postgresql', esquema: hash(JSON.stringify(seleccion)), tablas };
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
  if (!['postgres:', 'postgresql:'].includes(origen.protocol)) throw Error('El origen debe ser PostgreSQL');
  origen.searchParams.set('connect_timeout', '10');
  const db = new PrismaClient({ datasources: { db: { url: origen.toString() } }, log: [] });
  try {
    const datos = await extraer(db);
    const raiz = path.resolve(__dirname, '../../.tools/respaldos');
    await fs.mkdir(raiz, { recursive: true });
    const clave = randomBytes(32), sello = `${etiqueta}-${Date.now()}`;
    const archivo = path.join(raiz, `${sello}.powerpos-backup`);
    const llave = path.join(raiz, `${sello}.private`);
    // Archivos nuevos exclusivamente: nunca reemplaza un respaldo anterior.
    await fs.writeFile(llave, clave.toString('hex'), { flag: 'wx', mode: 0o600 });
    await fs.writeFile(archivo, cifrar(datos, clave), { flag: 'wx', mode: 0o600 });
    const comprobado = descifrar(await fs.readFile(archivo, 'utf8'), clave);
    if (hash(JSON.stringify(comprobado)) !== hash(JSON.stringify(datos))) throw Error('El respaldo no coincide');
    console.log(JSON.stringify({ respaldoVerificado: true, etiqueta, tablas: Object.keys(datos.tablas).length, registros: Object.values(datos.tablas).reduce((n, t) => n + t.filas.length, 0), origenSinModificar: true }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => {
  console.error('No se completó el respaldo. No se modificaron bases ni se imprimieron credenciales.');
  process.exitCode = 1;
});
module.exports = { cifrar, descifrar, extraer };
