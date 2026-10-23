const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');

async function verificarRespaldo(archivo, maxHoras = 36, ahora = Date.now()) {
  const raiz = path.dirname(path.resolve(archivo));
  const manifest = JSON.parse(await fs.readFile(archivo, 'utf8'));
  const fecha = Date.parse(manifest.creadoEn);
  if (!Number.isFinite(maxHoras) || maxHoras <= 0 || !Number.isFinite(fecha) || fecha > ahora + 300000 || ahora - fecha > maxHoras * 3600000) throw Error('Respaldo vencido o fecha inválida');
  if (!Array.isArray(manifest.archivos) || !manifest.archivos.length) throw Error('El respaldo no contiene archivos verificables');
  for (const a of manifest.archivos) {
    if (!a || typeof a.ruta !== 'string' || path.isAbsolute(a.ruta) || !/^[a-f0-9]{64}$/i.test(a.sha256) || !Number.isSafeInteger(a.bytes) || a.bytes <= 0) throw Error('Manifiesto inválido');
    const destino = path.resolve(raiz, a.ruta);
    if (!destino.startsWith(raiz + path.sep)) throw Error('Archivo fuera del respaldo');
    const real = await fs.realpath(destino), baseReal = await fs.realpath(raiz);
    if (!real.startsWith(baseReal + path.sep)) throw Error('Archivo fuera del respaldo');
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size !== a.bytes) throw Error('Tamaño de respaldo incorrecto');
    const hash = createHash('sha256');
    for await (const fragmento of createReadStream(real)) hash.update(fragmento);
    if (hash.digest('hex') !== a.sha256.toLowerCase()) throw Error('Integridad del respaldo incorrecta');
  }
  return { respaldo: 'verificado', archivos: manifest.archivos.length, creadoEn: new Date(fecha).toISOString() };
}
async function verificarApi(url, transporte = fetch) {
  const destino = new URL(url);
  if (!['http:', 'https:'].includes(destino.protocol) || destino.username || destino.password) throw Error('URL de salud inválida');
  const r = await transporte(destino, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!r.ok || (await r.json()).estado !== 'ok') throw Error('La API no está disponible');
  return { api: 'disponible' };
}
if (require.main === module) {
  (async () => {
    const resultado = {};
    if (process.env.POWERPOS_HEALTH_URL) Object.assign(resultado, await verificarApi(process.env.POWERPOS_HEALTH_URL));
    if (process.env.BACKUP_MANIFEST_PATH) Object.assign(resultado, await verificarRespaldo(process.env.BACKUP_MANIFEST_PATH, Number(process.env.BACKUP_MAX_HOURS || 36)));
    if (!Object.keys(resultado).length) throw Error('Configura POWERPOS_HEALTH_URL y/o BACKUP_MANIFEST_PATH');
    console.log(JSON.stringify(resultado));
  })().catch(error => { console.error(JSON.stringify({ estado: 'fallo', motivo: error.message })); process.exitCode = 1; });
}
module.exports = { verificarRespaldo, verificarApi };
