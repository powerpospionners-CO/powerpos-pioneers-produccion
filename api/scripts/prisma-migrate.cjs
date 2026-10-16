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

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  try {
    const comando = process.argv[2] || 'deploy';
    if (!['deploy', 'status'].includes(comando)) throw new Error('Solo se permiten deploy o status');
    const DATABASE_URL = conexionMigraciones(process.env);
    console.log('Prisma: usando conexión de migraciones separada del pool de la API');
    const resultado = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', comando], {
      stdio: 'inherit', env: { ...process.env, DATABASE_URL },
    });
    if (resultado.error) throw new Error('No se pudo ejecutar Prisma');
    process.exitCode = resultado.status ?? 1;
  } catch (e) {
    // No imprimir la URL ni la excepción de parsing: pueden contener claves.
    console.error(e instanceof Error && !e.message.includes('URL') ? e.message : 'Conexión de migraciones no válida');
    process.exitCode = 1;
  }
}
module.exports = { conexionMigraciones };
