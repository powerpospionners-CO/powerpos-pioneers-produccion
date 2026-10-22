const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { crearCola } = require("../impresora.cjs");
test("serializa comandas y recibos y continúa después de un fallo sin duplicar trabajos", async () => {
  const cola = crearCola(),
    orden = [];
  const a = cola(async () => {
    orden.push("a");
    await new Promise((r) => setTimeout(r, 20));
    orden.push("fin-a");
    throw Error("desconectada");
  });
  const b = cola(async () => {
    orden.push("b");
  });
  await assert.rejects(a);
  await b;
  assert.deepEqual(orden, ["a", "fin-a", "b"]);
});
