const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function cargar(ruta, requireLocal = require) {
  const m = { exports: {} };
  new Function(
    "exports",
    "require",
    ts.transpileModule(fs.readFileSync(ruta, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
  )(m.exports, requireLocal);
  return m.exports;
}
test("solo archivos activan el procesamiento y las cargas paralelas se cierran de forma independiente", () => {
  const c = cargar("lib/cargas.ts");
  const texto = new FormData();
  texto.append("nombre", "Prueba");
  assert.equal(c.contieneArchivo(texto), false);
  assert.equal(c.contieneArchivo({ archivo: "texto" }), false);
  texto.append("archivo", new Blob(["prueba"]), "prueba.txt");
  assert.equal(c.contieneArchivo(texto), true);
  let avisos = 0;
  const dejar = c.observarCargas(() => avisos++);
  const a = c.iniciarCarga(0),
    b = c.iniciarCarga(0);
  c.terminarCarga(a);
  assert.equal(c.estadoCargas().activas, 1);
  c.terminarCarga(a, true);
  assert.equal(c.estadoCargas().fallos, 0);
  c.terminarCarga(b, true);
  assert.deepEqual(c.estadoCargas(), { activas: 0, fallos: 1, guardados: 0 });
  assert.equal(avisos, 4);
  dejar();
  c.iniciarCarga(0);
  assert.equal(avisos, 4);
  assert.deepEqual(c.estadoCargasServidor(), {
    activas: 0,
    fallos: 0,
    guardados: 0,
  });
});
test("el cliente real de API cierra el procesamiento al responder y al fallar, sin tráfico externo", async () => {
  const axios = require("axios");
  const c = cargar("lib/cargas.ts");
  const anterior = global.window;
  const anteriorEvento = global.CustomEvent;
  global.window = {
    localStorage: { getItem: () => null },
    dispatchEvent() {},
    location: { pathname: "/prueba" },
  };
  global.CustomEvent = class {
    constructor(tipo) {
      this.type = tipo;
    }
  };
  try {
    const api = cargar("lib/api.ts", (nombre) => {
      if (nombre === "./cargas") return c;
      if (nombre === "@/store/authStore")
        return { useAuthStore: { getState: () => ({}) } };
      if (nombre === "./sesion-inactiva" || nombre === "./escritorio" || nombre === "./soporte")
        return {};
      return require(nombre);
    }).default;
    const archivo = new FormData();
    archivo.append("archivo", new Blob(["contenido"]), "archivo.txt");
    let terminar;
    const promesa = api.post("/carga", archivo, {
      adapter: (config) =>
        new Promise((resolve) => {
          terminar = () =>
            resolve({
              config,
              status: 200,
              headers: {},
              data: { ok: true },
              statusText: "OK",
            });
        }),
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(c.estadoCargas().activas, 1);
    terminar();
    await promesa;
    assert.equal(
      c.estadoCargas().activas,
      1,
      "Una carga rápida mantiene el diálogo visible el tiempo mínimo",
    );
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(c.estadoCargas().activas, 0);
    await assert.rejects(
      api.post("/carga", archivo, {
        adapter: (config) =>
          Promise.reject(
            new axios.AxiosError("Error simulado", undefined, config),
          ),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.deepEqual(c.estadoCargas(), { activas: 0, fallos: 1, guardados: 0 });
    await api.post(
      "/solo-texto",
      { nombre: "Texto" },
      {
        adapter: async (config) => ({
          config,
          status: 200,
          headers: {},
          data: {},
          statusText: "OK",
        }),
      },
    );
    assert.equal(c.estadoCargas().activas, 0);
  } finally {
    global.window = anterior;
    global.CustomEvent = anteriorEvento;
  }
});

test("Guardar mantiene el diálogo durante la operación y lo cierra aunque falle", async () => {
  const c = cargar("lib/cargas.ts");
  let completar;
  const guardado = c.conGuardado(
    () => new Promise((resolve) => (completar = resolve)),
  );
  assert.equal(c.estadoCargas().guardados, 1);
  completar("resultado");
  assert.equal(await guardado, "resultado");
  assert.equal(c.estadoCargas().guardados, 1);
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal(c.estadoCargas().activas, 0);
  await assert.rejects(
    c.conGuardado(async () => {
      throw Error("Fallo de guardado");
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal(c.estadoCargas().activas, 0);
});
