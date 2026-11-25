const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const archivo = path.join(__dirname, '../proxy.ts');
const modulo = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(archivo, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: modulo, exports: modulo.exports, require: createRequire(archivo), process });
const { proxy } = modulo.exports;
test('los apartados internos se sirven en el dominio de la empresa', () => {
  for (const ruta of ['/codigos-barras', '/auditoria', '/gastos', '/pos', '/configuracion']) {
    const r = proxy(new NextRequest('https://enchilamarketpereira.powerpospioneers.com' + ruta, { headers: { host: 'enchilamarketpereira.powerpospioneers.com' } }));
    assert.equal(r.headers.get('x-middleware-rewrite'), null);
    assert.equal(r.headers.get('x-middleware-next'), '1');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
});
test('la raíz del dominio de empresa conserva su tienda pública', () => {
  const r = proxy(new NextRequest('https://enchilamarketpereira.powerpospioneers.com/', { headers: { host: 'enchilamarketpereira.powerpospioneers.com' } }));
  assert.equal(r.headers.get('x-middleware-rewrite'), 'https://enchilamarketpereira.powerpospioneers.com/tienda/enchilamarketpereira');
});

test('las páginas públicas separadas no se confunden con Productos del panel', () => {
 for (const seccion of ['productos','nosotros','contacto']) {
  const r = proxy(new NextRequest(`https://enchilamarketpereira.powerpospioneers.com/tienda/${seccion}`, { headers: { host: 'enchilamarketpereira.powerpospioneers.com' } }));
  assert.equal(r.headers.get('x-middleware-rewrite'), `https://enchilamarketpereira.powerpospioneers.com/tienda/enchilamarketpereira/${seccion}`);
  assert.equal(r.headers.get('x-robots-tag'), null);
 }
 const panel = proxy(new NextRequest('https://enchilamarketpereira.powerpospioneers.com/productos', { headers: { host: 'enchilamarketpereira.powerpospioneers.com' } }));
 assert.equal(panel.headers.get('x-middleware-next'), '1'); assert.equal(panel.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('reescribe fichas y políticas públicas sin confundir el panel',()=>{for(const [ruta,destino] of [['/tienda/productos/800','/tienda/empresa/productos/800'],['/tienda/politicas','/tienda/empresa/politicas']]){const r=proxy(new NextRequest('https://empresa.powerpospioneers.com'+ruta,{headers:{host:'empresa.powerpospioneers.com'}}));assert.equal(r.headers.get('x-middleware-rewrite'),'https://empresa.powerpospioneers.com'+destino);}});
