const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { createHash } = require('node:crypto');
const { verificarRespaldo, verificarApi } = require('./verificar-operacion.cjs');
test('detecta respaldos vencidos, corruptos y ausentes', async () => {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'powerpos-backup-test-'));
  const ahora = Date.now(), contenido = Buffer.from('respaldo cifrado de prueba');
  const archivo = path.join(carpeta, 'manifest.json'), base = path.join(carpeta, 'base.enc');
  const manifest = { creadoEn: new Date(ahora).toISOString(), archivos: [{ ruta: 'base.enc', bytes: contenido.length, sha256: createHash('sha256').update(contenido).digest('hex') }] };
  try {
    await fs.writeFile(base, contenido); await fs.writeFile(archivo, JSON.stringify(manifest));
    assert.equal((await verificarRespaldo(archivo, 36, ahora)).archivos, 1);
    await assert.rejects(verificarRespaldo(archivo, 36, ahora + 37 * 3600000), /vencido/);
    await fs.writeFile(base, Buffer.alloc(contenido.length));
    await assert.rejects(verificarRespaldo(archivo, 36, ahora), /Integridad/);
    await fs.unlink(base); await assert.rejects(verificarRespaldo(archivo, 36, ahora));
  } finally {
    await fs.rm(archivo, { force: true }); await fs.rm(base, { force: true }); await fs.rmdir(carpeta);
  }
});
test('el monitor detecta respuestas HTTP fallidas y cuerpos incorrectos', async () => {
  assert.equal((await verificarApi('https://example.test/health/ready', async () => ({ ok: true, json: async () => ({ estado: 'ok' }) }))).api, 'disponible');
  await assert.rejects(verificarApi('https://example.test/health/ready', async () => ({ ok: false })), /no está disponible/);
  await assert.rejects(verificarApi('https://example.test/health/ready', async () => ({ ok: true, json: async () => ({ estado: 'fallo' }) })), /no está disponible/);
});
