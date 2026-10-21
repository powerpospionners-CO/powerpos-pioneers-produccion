// Diagnóstico de solo lectura del destino; no crea ni altera bases o tablas.
const path = require('node:path');
async function main() {
  const url = new URL(process.env.MYSQL_DATABASE_URL);
  if (url.protocol !== 'mysql:') throw Error('Destino no válido');
  const { PrismaClient } = require(path.join(__dirname, '../generated/prisma-mysql'));
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    const [servidor] = await db.$queryRawUnsafe('SELECT VERSION() AS version, @@SESSION.sql_mode AS modo, @@SESSION.time_zone AS zona, @@character_set_database AS caracteres, @@collation_database AS comparacion, @@max_allowed_packet AS paquete');
    const engines = await db.$queryRawUnsafe("SELECT SUPPORT AS soporte FROM information_schema.ENGINES WHERE ENGINE='InnoDB'");
    const tablas = await db.$queryRawUnsafe('SELECT TABLE_NAME AS nombre, ENGINE AS motor FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE=\'BASE TABLE\'');
    const [json] = await db.$queryRawUnsafe('SELECT JSON_VALID(?) AS valido', '{"prueba":true}');
    const apto = engines.some(e => ['YES', 'DEFAULT'].includes(e.soporte)) &&
      /STRICT_TRANS_TABLES|STRICT_ALL_TABLES/.test(servidor.modo) &&
      servidor.caracteres === 'utf8mb4' && Number(json.valido) === 1 &&
      tablas.every(t => t.motor === 'InnoDB');
    console.log(JSON.stringify({ acceso: true, aptoParaEnsayo: apto, version: servidor.version, zonaSesion: servidor.zona, caracteres: servidor.caracteres, comparacion: servidor.comparacion, paqueteMaximo: String(servidor.paquete), tablas: tablas.length, requiereDestinoVacio: true, datosModificados: false }));
    if (!apto) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => {
  console.error('No se pudo verificar el destino MySQL. No se imprimieron credenciales ni se modificaron datos.');
  process.exitCode = 1;
});
