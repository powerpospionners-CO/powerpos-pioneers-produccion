const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const modulo = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../lib/borradorVenta.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: modulo, exports: modulo.exports });
const { crearBorradorVenta } = modulo.exports;
const inicial = () => ({ carrito: [], cliente: null, descuento: '', cobro: null, intento: null });
function memoria() {
  const valores = new Map();
  return { getItem: k => valores.get(k) ?? null, setItem: (k,v) => valores.set(k,v), removeItem: k => valores.delete(k) };
}
test('recarga recupera productos, cantidad, descuento, cliente y pago mixto sin confirmar una venta', () => {
  const storage = memoria();
  const venta = crearBorradorVenta(storage, 'empresa2:sede1:usuario3', inicial());
  venta.set('carrito', [{ item: { productoId: 9, precio: 172000 }, cantidad: 1 }]);
  venta.set('cliente', 42);
  venta.set('descuento', '500');
  venta.set('cobro', { pagos: [{ metodo: 'NEQUI', monto: 31400 }, { metodo: 'EFECTIVO', monto: 90600 }] });
  const recarga = crearBorradorVenta(storage, 'empresa2:sede1:usuario3', inicial());
  assert.equal(JSON.stringify(recarga.getSnapshot().datos), JSON.stringify(venta.getSnapshot().datos));
  assert.equal(recarga.getSnapshot().recuperado, true);
  assert.equal(recarga.getSnapshot().datos.intento, null);
});
test('el reintento después de recargar conserva la misma clave de la solicitud', () => {
  const storage = memoria();
  const venta = crearBorradorVenta(storage, 'a', inicial());
  venta.set('intento', { firma: 'pedido-sin-respuesta', clave: 'misma-clave' });
  assert.equal(crearBorradorVenta(storage, 'a', inicial()).getSnapshot().datos.intento.clave, 'misma-clave');
});
test('confirmar o guardar en la cola offline elimina el borrador completo', () => {
  const storage = memoria(), venta = crearBorradorVenta(storage, 'a', inicial());
  venta.set('carrito', [{ cantidad: 2 }]); venta.set('cliente', 4);
  venta.reiniciar();
  assert.equal(storage.getItem('a'), null);
  assert.equal(JSON.stringify(crearBorradorVenta(storage, 'a', inicial()).getSnapshot().datos), JSON.stringify(inicial()));
});
test('no mezcla las empresas, sedes ni usuarios', () => {
  const storage = memoria();
  crearBorradorVenta(storage, '2:1:3', inicial()).set('cliente', 42);
  for (const clave of ['1:1:3', '2:2:3', '2:1:4']) assert.equal(crearBorradorVenta(storage, clave, inicial()).getSnapshot().datos.cliente, null);
});
test('un respaldo corrupto se conserva para revisión sin sobreescribirlo', () => {
  const storage = memoria(); storage.setItem('a', '{contenido dañado');
  const venta = crearBorradorVenta(storage, 'a', inicial()); venta.set('cliente', 5);
  assert.ok(venta.getSnapshot().error);
  assert.equal(storage.getItem('a'), '{contenido dañado');
});
test('almacenamiento lleno mantiene el trabajo en memoria e informa que no se puede recargar', () => {
  const storage = memoria(); storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const venta = crearBorradorVenta(storage, 'a', inicial());
  venta.set('cliente', 42);
  assert.equal(venta.getSnapshot().datos.cliente, 42);
  assert.match(venta.getSnapshot().error, /No recargues/);
});
test('actualizaciones sucesivas usan el estado más reciente sin perder cantidades', () => {
  const venta = crearBorradorVenta(memoria(), 'a', inicial());
  venta.set('carrito', [{ cantidad: 1 }]);
  venta.set('carrito', anterior => anterior.map(item => ({ ...item, cantidad: item.cantidad + 1 })));
  venta.set('carrito', anterior => anterior.map(item => ({ ...item, cantidad: item.cantidad + 1 })));
  assert.equal(venta.getSnapshot().datos.carrito[0].cantidad, 3);
});
