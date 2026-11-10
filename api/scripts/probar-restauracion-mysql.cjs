// Ensayo exclusivamente en los servicios efímeros de CI. No carga .env.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { extraer, cifrar, descifrar } = require('./export-migracion-mysql.cjs');
const { importar, validarSnapshot } = require('./import-migracion-mysql.cjs');

async function main() {
  const origen = new URL(process.env.POS_TEST_DATABASE_URL || 'http://invalido');
  if (origen.protocol !== 'mysql:' || origen.hostname !== '127.0.0.1' || origen.port !== '55440' || origen.pathname !== '/powerpos_pos_test') throw Error('Solo se permite la base MySQL efímera de CI');
  const { PrismaClient } = require('../generated/prisma-mysql');
  const destino = new URL(origen); destino.pathname = '/powerpos_restore_test';
  const fuente = new PrismaClient({ datasources: { db: { url: origen.toString() } }, log: [] });
  let restaurada;
  try {
    const snapshot = await extraer(fuente, undefined, 'mysql');
    const clave = randomBytes(32);
    const copia = descifrar(cifrar(snapshot, clave), clave);
    validarSnapshot(copia);
    await fuente.$executeRawUnsafe('CREATE DATABASE IF NOT EXISTS `powerpos_restore_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    const esquema = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--schema', 'prisma/mysql/schema.prisma', '--skip-generate'], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, MYSQL_DATABASE_URL: destino.toString() }, encoding: 'utf8' });
    if (esquema.status !== 0) throw Error('No se pudo preparar el destino aislado');
    restaurada = new PrismaClient({ datasources: { db: { url: destino.toString() } }, log: [] });
    const resultado = await importar(restaurada, copia);
    assert.equal(resultado.verificado, true);
    const recuperado = await extraer(restaurada, undefined, 'mysql');
    assert.deepEqual([...validarSnapshot(recuperado)], [...validarSnapshot(snapshot)]);
    await assert.rejects(importar(restaurada, copia), /Destino no vacío/);
    console.log('PASS respaldo cifrado MySQL: restauración en otra base, comparación de todas las tablas y rechazo de sobrescritura');
  } finally {
    if (restaurada) await restaurada.$disconnect();
    await fuente.$disconnect();
  }
}
if (require.main === module) main().catch(() => { console.error('Falló el ensayo de restauración aislada; no se imprimieron conexiones ni datos'); process.exitCode = 1; });
