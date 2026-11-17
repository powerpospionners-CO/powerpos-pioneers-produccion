const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const m = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('lib/catalogoDistribuidor.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m.exports);
const { buscarProductosDistribuidor, unidadVentaDistribuidor, tieneExistenciasDistribuidor } = m.exports;
test('el distribuidor encuentra el chile a granel por nombre y código, sin incluir productos no disponibles', () => {
  const chile = { nombre: 'Chile picoso', codigoBarras: '12345', disponible: true, stockActual: 500, ventaGranel: true, unidadGranel: 'kg' };
  const productos = [chile, { ...chile, nombre: 'Chile retirado', disponible: false }];
  assert.deepEqual(buscarProductosDistribuidor(productos, ' CHILE '), [chile]);
  assert.deepEqual(buscarProductosDistribuidor(productos, '12345'), [chile]);
  assert.deepEqual(buscarProductosDistribuidor(productos, ''), []);
});
test('oculta existencias cero, negativas o desconocidas y solo permite presentaciones completas', () => {
  const p = { nombre: 'Chile', disponible: true, stockActual: 200 };
  assert.deepEqual(buscarProductosDistribuidor([p, ...[0, -1, undefined, NaN].map(stockActual => ({ ...p, stockActual }))], 'chile'), [p]);
  assert.equal(tieneExistenciasDistribuidor(p, 250), false);
  assert.equal(tieneExistenciasDistribuidor(p, 200), true);
  assert.equal(tieneExistenciasDistribuidor(p, 1), true);
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
