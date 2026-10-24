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
  }
});
test('la raíz del dominio de empresa conserva su tienda pública', () => {
  const r = proxy(new NextRequest('https://enchilamarketpereira.powerpospioneers.com/', { headers: { host: 'enchilamarketpereira.powerpospioneers.com' } }));
  assert.equal(r.headers.get('x-middleware-rewrite'), 'https://enchilamarketpereira.powerpospioneers.com/tienda/enchilamarketpereira');
});
