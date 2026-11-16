const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const m = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('lib/catalogoDistribuidor.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m.exports);
const { buscarProductosDistribuidor, unidadVentaDistribuidor } = m.exports;
test('el distribuidor encuentra el chile a granel por nombre y código, sin incluir productos no disponibles', () => {
  const chile = { nombre: 'Chile picoso', codigoBarras: '12345', disponible: true, ventaGranel: true, unidadGranel: 'kg' };
  const productos = [chile, { ...chile, nombre: 'Chile retirado', disponible: false }];
  assert.deepEqual(buscarProductosDistribuidor(productos, ' CHILE '), [chile]);
  assert.deepEqual(buscarProductosDistribuidor(productos, '12345'), [chile]);
  assert.deepEqual(buscarProductosDistribuidor(productos, ''), []);
});
test('el peso y volumen usan la misma unidad base que el POS, sin convertir paquetes en gramos', () => {
  assert.equal(unidadVentaDistribuidor({ ventaGranel: true, unidadGranel: 'kg' }), 'g');
  assert.equal(unidadVentaDistribuidor({ ventaGranel: true, unidadGranel: 'g' }), 'g');
  assert.equal(unidadVentaDistribuidor({ ventaGranel: true, unidadGranel: null }), 'g');
  assert.equal(unidadVentaDistribuidor({ ventaGranel: true, unidadGranel: 'l' }), 'ml');
  assert.equal(unidadVentaDistribuidor({ ventaGranel: true, unidadGranel: 'ml' }), 'ml');
  assert.equal(unidadVentaDistribuidor({ ventaGranel: true, unidadGranel: 'kg' }, 7), null);
  assert.equal(unidadVentaDistribuidor({ ventaGranel: false }), null);
});
