const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { cifrar, descifrar, extraer } = require('./export-migracion-mysql.cjs');
test('respaldo autenticado mantiene valores exactos y rechaza manipulación', () => {
  const clave = randomBytes(32);
  const valor = { precio: '999999999999.99', fecha: '2026-10-20 23:59:59.123456', claveAcceso: 'hash existente', lista: ['sal', 'ají'], nulo: null };
  const copia = cifrar(valor, clave);
  assert.deepEqual(descifrar(copia, clave), valor);
  assert.ok(!copia.includes('hash existente'));
  assert.throws(() => descifrar(copia, randomBytes(32)));
  const alterado = JSON.parse(copia); alterado.tag = '00'.repeat(16);
  assert.throws(() => descifrar(JSON.stringify(alterado), clave));
});
test('extrae en transacción consistente y de solo lectura sin convertir decimales', async () => {
  const operaciones = [];
  const tx = {
    $executeRawUnsafe: async sql => { operaciones.push(sql); },
    $queryRawUnsafe: async sql => { operaciones.push(sql); return [{ id: 1, precio: '0.01' }]; },
  };
  const db = { $transaction: async (trabajo, opciones) => { assert.equal(opciones.isolationLevel, 'RepeatableRead'); return trabajo(tx); } };
  const datos = await extraer(db, [{ name: 'Producto', dbName: 'productos', fields: [{ name: 'id', kind: 'scalar', type: 'Int' }, { name: 'precio', kind: 'scalar', type: 'Decimal' }] }]);
  assert.equal(operaciones[0], 'SET TRANSACTION READ ONLY');
  assert.match(operaciones[1], /"precio"::text/);
  assert.equal(datos.tablas.Producto.filas[0].precio, '0.01');
  assert.ok(operaciones.every(sql => !/INSERT|UPDATE|DELETE|TRUNCATE|ALTER/.test(sql)));
});
