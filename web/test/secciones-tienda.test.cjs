const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  ts = require("typescript");
const m = { exports: {} };
new Function(
  "exports",
  ts.transpileModule(fs.readFileSync("lib/seccionesTienda.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
)(m.exports);
const { rutasTienda, urlSeccionTienda } = m.exports;
test("navegación y direcciones canónicas funcionan en dominio propio y enlace del sistema", () => {
  assert.equal(rutasTienda("empresa", true).inicio, "/");
  assert.equal(rutasTienda("empresa", true).productos, "/tienda/productos");
  assert.equal(rutasTienda("empresa").contacto, "/tienda/empresa/contacto");
  assert.equal(
    urlSeccionTienda("https://empresa.powerpospioneers.com/", "nosotros"),
    "https://empresa.powerpospioneers.com/tienda/nosotros",
  );
  assert.equal(
    urlSeccionTienda(
      "https://app.powerpospioneers.com/tienda/empresa",
      "productos",
    ),
    "https://app.powerpospioneers.com/tienda/empresa/productos",
  );
});
