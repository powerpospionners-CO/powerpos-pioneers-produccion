const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const moduleTema = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('lib/temaTienda.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleTema.exports);
const { temaTienda } = moduleTema.exports;
test('selecciona texto legible tanto para logos claros como oscuros', () => {
  assert.equal(temaTienda('#ffff00')['--store-on-brand'], '#111111');
  assert.equal(temaTienda('#111144')['--store-on-brand'], '#ffffff');
  assert.equal(temaTienda('#ff6a00')['--store-brand'], '#ff6a00');
});
test('rechaza colores ajenos al formato permitido en variables de estilo', () => {
  assert.equal(temaTienda('url(https://example.com)')['--store-brand'], '#0f766e');
  assert.equal(temaTienda('#123456', 'red')['--store-secondary'], '#123456');
});
