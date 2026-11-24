const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function archivos(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? archivos(path.join(dir, e.name))
        : e.name.endsWith(".tsx")
          ? [path.join(dir, e.name)]
          : [],
    );
}
test("las acciones usan controles y no reaparecen diálogos bloqueantes del navegador", () => {
  const errores = [];
  let revisados = 0;
  for (const archivo of [...archivos("app"), ...archivos("components")]) {
    const texto = fs.readFileSync(archivo, "utf8");
    const fuente = ts.createSourceFile(
      archivo,
      texto,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visitar(n) {
      if (
        ts.isCallExpression(n) &&
        /^window\.(alert|confirm|prompt)$/.test(n.expression.getText(fuente))
      )
        errores.push(archivo + ": diálogo del navegador");
      if (ts.isJsxOpeningElement(n)) {
        const tag = n.tagName.getText(fuente),
          attrs = n.attributes.properties;
        const tiene = (nombre) =>
          attrs.some((a) => a.name?.getText(fuente) === nombre);
        if (tag === "a" && tiene("onClick") && !tiene("href"))
          errores.push(
            archivo + ": acción implementada como enlace sin destino",
          );
        if (tag === "button") {
          revisados++;
          let padre = n.parent.parent,
            formulario = false;
          while (padre) {
            if (
              ts.isJsxElement(padre) &&
              padre.openingElement.tagName.getText(fuente) === "form"
            ) {
              formulario = true;
              break;
            }
            padre = padre.parent;
          }
          if (
            !formulario &&
            ![
              "onClick",
              "onPointerDown",
              "onMouseDown",
              "onTouchStart",
              "form",
            ].some(tiene)
          )
            errores.push(archivo + ": botón sin acción ni formulario asociado");
          if (formulario && tiene("onClick") && !tiene("type"))
            errores.push(
              archivo + ": botón auxiliar puede enviar el formulario",
            );
        }
      }
      ts.forEachChild(n, visitar);
    }
    visitar(fuente);
  }
  assert(revisados > 100);
  assert.deepEqual(errores, []);
});
