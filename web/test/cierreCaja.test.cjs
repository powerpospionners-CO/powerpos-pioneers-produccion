const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function cargar(archivo, api, escritorio = true) {
  const modulo = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib', archivo), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, require: () => ({ default: api }), window: escritorio ? { powerposDesktop: { imprimir: () => { throw Error('Puente no disponible'); } } } : {} });
  return modulo.exports;
}
test('Windows guarda por API normal sin invocar el puente de impresión', async () => {
  const llamadas = [];
  const cierre = cargar('cierreCaja.ts', { post: async (...args) => { llamadas.push(args); return { data: { estado: 'CERRADA' } }; } });
  assert.equal((await cierre.guardarCierreCaja(7, { montoFinal: 150000 })).impresionLocal, true);
  assert.equal(JSON.stringify(llamadas), JSON.stringify([['/caja/7/cerrar', { montoFinal: 150000, imprimir: false }]]));
});
test('la web conserva la impresión del servidor', async () => {
  let datos;
  const cierre = cargar('cierreCaja.ts', { post: async (_, d) => { datos = d; return { data: { estado: 'CERRADA' } }; } }, false);
  assert.equal((await cierre.guardarCierreCaja(7, { montoFinal: 1 })).impresionLocal, false);
  assert.equal(datos.imprimir, undefined);
});
test('respuesta perdida consulta el estado sin repetir el cierre ni imprimir', async () => {
  let solicitudes = 0;
  const cierre = cargar('cierreCaja.ts', { post: async () => { solicitudes++; throw Error('Red'); }, get: async ruta => { assert.equal(ruta, '/caja/abierta'); return { data: null }; } });
  const resultado = await cierre.guardarCierreCaja(7, { montoFinal: 150000 });
  assert.equal(resultado.recuperado, true);
  assert.equal(resultado.impresionLocal, false);
  assert.equal(solicitudes, 1);
});
test('si sigue abierta o no hay conexión conserva el conteo y no afirma éxito', async () => {
  for (const get of [async () => ({ data: { id: 7 } }), async () => { throw Error('Red'); }, async () => ({ data: {} })]) {
    const cierre = cargar('cierreCaja.ts', { post: async () => { throw Error('Red'); }, get });
    await assert.rejects(cierre.guardarCierreCaja(7, { montoFinal: 1 }), /conserva/);
  }
});
test('los errores de validación mantienen el mensaje del servidor', async () => {
  const cierre = cargar('cierreCaja.ts', { post: async () => { throw { response: { status: 400, data: { message: 'El retiro supera el efectivo' } } }; } });
  await assert.rejects(cierre.guardarCierreCaja(7, { montoFinal: 1 }), /El retiro supera el efectivo/);
});
test('cajero imprime su cierre permitido y una impresora caída solo genera advertencia', async () => {
  let ruta;
  const cierre = cargar('cierreCaja.ts', { post: async r => { ruta = r; throw Error('Sin impresora'); } });
  assert.match(await cierre.imprimirCierreGuardado(7, 'CAJERO'), /caja quedó cerrada/);
  assert.equal(ruta, '/caja/reimprimir-mi-cierre');
  await cierre.imprimirCierreGuardado(7, 'ADMIN_EMPRESA');
  assert.equal(ruta, '/caja/7/reimprimir-cierre');
});
test('el puente recibe impresiones y reimpresiones, nunca el guardado del cierre', () => {
  const { rutaImpresionEscritorio: ruta } = cargar('escritorio.ts');
  assert.equal(ruta('/caja/7/cerrar'), false);
  for (const r of ['/caja/7/reimprimir-cierre', '/caja/reimprimir-mi-cierre', '/impresion/ticket']) assert.equal(ruta(r), true);
});
