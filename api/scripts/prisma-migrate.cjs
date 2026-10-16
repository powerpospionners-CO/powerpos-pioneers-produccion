// Las migraciones requieren continuidad de sesión; la API conserva su pool.
const { spawnSync } = require('node:child_process');

function conexionMigraciones(env) {
  const origen = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  if (!origen) throw new Error('No está configurada la conexión de migraciones');
  const url = new URL(origen);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('La conexión debe ser PostgreSQL');
  if (!env.DIRECT_DATABASE_URL && url.hostname.endsWith('.neon.tech')) {
    url.hostname = url.hostname.replace('-pooler.', '.');
    url.searchParams.delete('pgbouncer');
  }
  return url.toString();
}

async function ejecutarMigraciones(comando, env = process.env) {
  const DATABASE_URL = conexionMigraciones(env);
  const ejecutar = url => {
    const resultado = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', comando], {
      stdio: 'pipe', encoding:'utf8', env: { ...env, DATABASE_URL:url, DIRECT_DATABASE_URL:url }, timeout:180000,
    });
    if (resultado.error || resultado.status !== 0) throw new Error('No se pudieron aplicar o verificar las migraciones; no se habilitará el despliegue');
  };
  ejecutar(DATABASE_URL);
  console.log('Prisma: base de control verificada');
  const { PrismaClient } = require('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:DATABASE_URL}}});
  try {
    // Compatible with an older checkout whose schema predates branch isolation.
    const existe=await db.$queryRawUnsafe("SELECT to_regclass('public.bases_sede')::text AS tabla");
    if (!existe[0]?.tabla) return;
    const sedes=await db.$queryRawUnsafe('SELECT "empresaId","sucursalId","conexionCifrada" FROM bases_sede WHERE estado=$1 ORDER BY "sucursalId"','ACTIVA');
    if (!sedes.length) return;
    const { descifrarConexion }=require('../dist/src/prisma/conexion-cifrada');
    for (const sede of sedes) {
      ejecutar(conexionMigraciones({DATABASE_URL:descifrarConexion(sede.conexionCifrada,sede.empresaId,sede.sucursalId)}));
      console.log(`Prisma: sede ${sede.sucursalId} verificada`);
    }
  } finally { await db.$disconnect(); }
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  (async()=>{try {
    const comando = process.argv[2] || 'deploy';
    if (!['deploy', 'status'].includes(comando)) throw new Error('Solo se permiten deploy o status');
    console.log('Prisma: usando conexión de migraciones separada del pool de la API');
    await ejecutarMigraciones(comando);
  } catch (e) {
    // No imprimir la URL ni la excepción de parsing: pueden contener claves.
    console.error('No se completaron las migraciones. Se conserva la versión anterior de la aplicación.');
    process.exitCode = 1;
  }})();
}
module.exports = { conexionMigraciones, ejecutarMigraciones };
