const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function worker(respuestas) {
  const llamadas = [], eventos = {};
  const contexto = vm.createContext({ Request, URL, self: { location: { origin: 'https://pos.example' }, addEventListener: (nombre, fn) => eventos[nombre] = fn }, fetch: async req => { llamadas.push(req); return respuestas.shift(); } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), contexto);
  return { contexto, llamadas, eventos };
}
test('recupera un archivo 421 conservando la versión y sin cachear el fallo', async () => {
  const { contexto, llamadas } = worker([new Response('Misdirected', { status: 421 }), new Response('javascript')]);
  contexto.request = new Request('https://pos.example/_next/static/chunks/app.js?dpl=version-original');
  const respuesta = await vm.runInContext('descargar(request)', contexto);
  assert.equal(respuesta.status, 200);
  assert.equal(await respuesta.text(), 'javascript');
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[1].url, llamadas[0].url);
  assert.equal(llamadas[1].cache, 'no-store');
});
test('no crea un ciclo de reintentos si persiste el 421 ni repite respuestas correctas', async () => {
  for (const status of [200, 421]) {
    const { contexto, llamadas } = worker([new Response('', { status }), new Response('', { status })]);
    contexto.request = new Request('https://pos.example/pos');
    assert.equal((await vm.runInContext('descargar(request)', contexto)).status, status);
    assert.equal(llamadas.length, status === 200 ? 1 : 2);
  }
});
test('no intercepta ni repite ventas POST o peticiones a la API', () => {
  const { eventos, llamadas } = worker([]);
  for (const request of [new Request('https://api.example/pedidos'), new Request('https://pos.example/pedidos', { method: 'POST' })]) {
    eventos.fetch({ request, respondWith() { assert.fail('No debe interceptar esta petición'); } });
  }
  assert.equal(llamadas.length, 0);
});

