const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const { normalizar, jsonCompacto, validarSnapshot, importar } = require('./import-migracion-mysql.cjs');
const modelos = Prisma.dmmf.datamodel.models;
const campo = (tipo, extra = {}) => ({ type: tipo, isRequired: true, ...extra });
const estructura = () => [...modelos.map(m => m.dbName || m.name), '_powerpos_transaction_locks'].map(nombre => ({nombre,motor:'InnoDB',comparacion:'utf8mb4_unicode_ci'}));
function respaldoVacio() {
  return {
    formato: 1, motorOrigen: 'postgresql',
    esquema: createHash('sha256').update(JSON.stringify(modelos)).digest('hex'),
    tablas: Object.fromEntries(modelos.map(m => [m.name, {
      campos: m.fields.filter(f => f.kind !== 'object').map(f => ({ nombre: f.name, tipo: f.type, lista: f.isList })), filas: [],
    }])),
  };
}
test('conserva decimales y números JSON sin redondearlos', () => {
  assert.equal(normalizar(campo('Decimal'), '9999999999999999.123400'), '9999999999999999.1234');
  assert.equal(jsonCompacto('{ "valor": 9007199254740993, "texto": "a b \\\" c" }'), '{"valor":9007199254740993,"texto":"a b \\\" c"}');
  assert.equal(normalizar(campo('Json', {isRequired:false}), null), null);
  assert.equal(normalizar(campo('Json', {isRequired:false}), 'null'), 'null');
});
test('conserva fecha de periodo y milisegundos; rechaza pérdida de precisión', () => {
  assert.equal(normalizar(campo('DateTime'), '2026-10-20'), '2026-10-20');
  assert.equal(normalizar(campo('DateTime'), '2026-10-20 23:59:59.123000'), '2026-10-20 23:59:59.123');
  assert.throws(() => normalizar(campo('DateTime'), '2026-10-20 23:59:59.123001'));
});
test('convierte listas a JSON y rechaza listas y filas incompletas', () => {
  assert.equal(normalizar(campo('String', {isList:true}), ['uno', 'dos']), '["uno","dos"]');
  assert.throws(() => normalizar(campo('String', {isList:true}), ['uno', 2]));
  const s = respaldoVacio();
  assert.equal(validarSnapshot(s).size, 59);
  s.tablas.SelloBaseSede.filas.push({id:1});
  assert.throws(() => validarSnapshot(s), /incompleta/);
});
test('rechaza un esquema distinto y relaciones ausentes antes de conectar', () => {
  const s = respaldoVacio();
  s.esquema = 'otro';
  assert.throws(() => validarSnapshot(s), /Esquema/);
  const r = respaldoVacio();
  const modelo = modelos.find(m => m.name === 'Sucursal');
  const fila = Object.fromEntries(modelo.fields.filter(f => f.kind !== 'object').map(f => [f.name,
    !f.isRequired ? null : f.type === 'Int' ? 1 : f.type === 'Boolean' ? true : f.type === 'DateTime' ? '2026-10-21 00:00:00' : 'prueba'
  ]));
  r.tablas.Sucursal.filas.push(fila);
  assert.throws(() => validarSnapshot(r), /Referencia ausente/);
});
test('se niega a escribir sobre un destino que ya tiene filas', async () => {
  const ejecutadas = [];
  const tx = {
    $executeRawUnsafe: async sql => { ejecutadas.push(sql); },
    $queryRawUnsafe: async sql => sql.includes('information_schema') ? estructura() : sql.includes('sql_mode') ? [{modo:'STRICT_ALL_TABLES'}] : [{cantidad:1}],
  };
  await assert.rejects(importar({$transaction: fn => fn(tx)}, respaldoVacio()), /Destino no vacío/);
  assert.ok(ejecutadas.every(sql => !sql.startsWith('INSERT') && !sql.includes('FOREIGN_KEY_CHECKS=0')));
});
test('ante diferencia de datos restaura checks y rechaza la transacción', async () => {
  const s = respaldoVacio();
  s.tablas.SelloBaseSede.filas.push({id:1,empresaId:1,sucursalId:1,verificadoEn:'2026-10-21 00:00:00'});
  const ejecutadas = [];
  const tx = {
    $executeRawUnsafe: async sql => { ejecutadas.push(sql); },
    $queryRawUnsafe: async sql => sql.includes('information_schema') ? estructura() : sql.includes('sql_mode') ? [{modo:'STRICT_ALL_TABLES'}] : sql.startsWith('SELECT COUNT') ? [{cantidad:0}] : [],
  };
  await assert.rejects(importar({$transaction: fn => fn(tx)}, s), /Verificación de datos falló/);
  assert.equal(ejecutadas.at(-1), 'SET SESSION FOREIGN_KEY_CHECKS=1');
});
