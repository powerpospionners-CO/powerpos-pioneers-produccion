const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const m = { exports: {} };
new Function(
  "exports",
  ts.transpileModule(fs.readFileSync("lib/guardarConImagen.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
)(m.exports);
const { guardarConImagen } = m.exports;
test("un fallo de imagen conserva el producto y el reintento actualiza ese registro sin crear otro", async () => {
  let actual = null,
    creados = 0,
    editados = 0,
    imagenes = 0;
  const guardar = async () => {
    if (actual) {
      editados++;
      return actual;
    }
    creados++;
    return { id: 42, nombre: "Producto de prueba" };
  };
  const recordar = (r) => {
    actual = r;
  };
  await assert.rejects(
    guardarConImagen({
      guardar,
      recordar,
      subirImagen: async () => {
        imagenes++;
        throw Error("Fallo simulado");
      },
    }),
  );
  assert.equal(actual.id, 42);
  await guardarConImagen({
    guardar,
    recordar,
    subirImagen: async () => {
      imagenes++;
    },
  });
  assert.equal(creados, 1);
  assert.equal(editados, 1);
  assert.equal(imagenes, 2);
});
test("si falla el guardado no se intenta subir una imagen ni se cambia el registro seleccionado", async () => {
  let recordados = 0,
    subidas = 0;
  await assert.rejects(
    guardarConImagen({
      guardar: async () => {
        throw Error("Validación");
      },
      recordar: () => recordados++,
      subirImagen: async () => subidas++,
    }),
  );
  assert.equal(recordados, 0);
  assert.equal(subidas, 0);
});
