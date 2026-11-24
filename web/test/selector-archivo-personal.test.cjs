const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function selector(api) {
  const valores = [];
  let i = 0;
  const ocupados = [],
    subidos = [];
  const react = {
    useState: (inicial) => {
      const indice = i++;
      if (!(indice in valores)) valores[indice] = inicial;
      return [
        valores[indice],
        (valor) => {
          valores[indice] =
            typeof valor === "function" ? valor(valores[indice]) : valor;
        },
      ];
    },
  };
  const jsx = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: "fragment",
  };
  const m = { exports: {} };
  new Function(
    "exports",
    "require",
    ts.transpileModule(
      fs.readFileSync("components/SelectorArchivoPersonal.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText,
  )(m.exports, (n) =>
    n === "react"
      ? react
      : n === "react/jsx-runtime"
        ? jsx
        : n === "@/lib/api"
          ? { __esModule: true, default: api }
          : require(n),
  );
  const props = {
    name: "archivoId",
    required: true,
    onOcupado: (v) => ocupados.push(v),
    onSubido: (v) => subidos.push(v),
  };
  return {
    ocupados,
    subidos,
    render() {
      i = 0;
      return m.exports.default(props);
    },
  };
}
function nodos(n, filtro) {
  if (!n || typeof n !== "object") return [];
  return [
    ...(filtro(n) ? [n] : []),
    ...[].concat(n.props?.children || []).flatMap((h) => nodos(h, filtro)),
  ];
}
test("seleccionar el PDF inicia la subida antes de Guardar y entrega el ID para reutilizarlo", async () => {
  let completar,
    llamadas = 0;
  const s = selector({
    post: (ruta, body) => {
      llamadas++;
      assert.equal(ruta, "/personal/archivos");
      assert.equal(body.get("archivo").name, "prueba.pdf");
      return new Promise((resolve) => (completar = resolve));
    },
  });
  const input = {
    files: [
      new File(["%PDF-1.4 prueba"], "prueba.pdf", { type: "application/pdf" }),
    ],
    value: "prueba.pdf",
  };
  const carga = nodos(
    s.render(),
    (n) => n.type === "input" && n.props.type === "file",
  )[0].props.onChange({ currentTarget: input });
  assert.equal(llamadas, 1);
  assert.equal(
    nodos(s.render(), (n) => n.type === "input" && n.props.type === "file")[0]
      .props.disabled,
    true,
  );
  assert.deepEqual(s.ocupados, [true]);
  completar({ data: { id: "archivo-confirmado" } });
  await carga;
  assert.equal(
    nodos(
      s.render(),
      (n) => n.type === "input" && n.props.name === "archivoId",
    )[0].props.value,
    "archivo-confirmado",
  );
  assert.deepEqual(s.ocupados, [true, false]);
  assert.equal(s.subidos.at(-1), "archivo-confirmado");
  assert.equal(llamadas, 1);
});
test("un fallo no deja un ID anterior y permite volver a seleccionar el mismo archivo", async () => {
  const s = selector({
    post: async () => {
      throw Error("Fallo simulado");
    },
  });
  const input = {
    files: [new File(["pdf"], "prueba.pdf")],
    value: "prueba.pdf",
  };
  await nodos(
    s.render(),
    (n) => n.type === "input" && n.props.type === "file",
  )[0].props.onChange({ currentTarget: input });
  assert.equal(input.value, "");
  assert.equal(
    nodos(s.render(), (n) => n.type === "input" && n.props.type === "hidden")[0]
      .props.value,
    "",
  );
  assert.equal(nodos(s.render(), (n) => n.props?.role === "alert").length, 1);
  assert.deepEqual(s.ocupados, [true, false]);
});
