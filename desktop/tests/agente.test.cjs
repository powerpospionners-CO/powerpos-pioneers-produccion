const { test } = require("node:test");
const assert = require("node:assert/strict");
const { crearAgente } = require("../agente.cjs");
const { crearCola } = require("../impresora.cjs");
const trabajo = { id: "trabajo-123", tipo: "CIERRE", datosBase64: Buffer.from("cierre").toString("base64") };
async function esperar(condicion) {
  for (let i = 0; i < 100; i++) {
    if (condicion()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("No se completó la prueba");
}
function servidor(datos, { fallarConfirmacion = false } = {}) {
  const confirmaciones = [], solicitudes = [];
  let stream;
  return { confirmaciones, solicitudes,
    fetchImpl: async (url, options) => {
      solicitudes.push({ url, options });
      if (url.endsWith("/confirmar")) {
        confirmaciones.push(JSON.parse(options.body));
        if (fallarConfirmacion) throw Error("Corte de conexión");
        return new Response("{}", { status: 201 });
      }
      return new Response(new ReadableStream({
        start(c) {
          stream = c;
          const texto = datos.map((t) => "data: " + JSON.stringify(t) + "\r\n\r\n").join("");
          // Corta en mitad de un evento para comprobar el parser incremental.
          c.enqueue(new TextEncoder().encode(texto.slice(0, 11)));
          c.enqueue(new TextEncoder().encode(texto.slice(11)));
          options.signal.addEventListener("abort", () => { try { c.close(); } catch {} }, { once: true });
        }, cancel() { stream = undefined; },
      }), { headers: { "Content-Type": "text/event-stream" } });
    },
  };
}
test("recibe SSE fragmentado y CRLF; deduplica trabajos y confirma sin exponer el token en la URL", async () => {
  const s = servidor([{ tipo: "PING" }, trabajo, trabajo]);
  let impresiones = 0;
  const a = crearAgente({ token: "secreto", fetchImpl: s.fetchImpl, imprimir: async (bytes, vigente) => {
    assert.equal(vigente(), true);
    assert.equal(bytes.toString(), "cierre"); impresiones++;
  } });
  try {
    await esperar(() => s.confirmaciones.length > 0);
    assert.equal(impresiones, 1);
    assert.equal(s.confirmaciones[0].ok, true);
    assert.ok(s.solicitudes.every(({ url }) => !url.includes("secreto")));
    assert.equal(s.solicitudes[0].options.headers["X-Agente-Token"], "secreto");
  } finally { a.detener(); await a.terminado; }
});
test("un envío incierto se confirma como fallido y nunca se vuelve a imprimir por pérdida de confirmación", async () => {
  const s = servidor([trabajo, trabajo], { fallarConfirmacion: true });
  let impresiones = 0;
  const a = crearAgente({ token: "secreto", fetchImpl: s.fetchImpl, imprimir: async () => {
    impresiones++; throw Error("Revisa la tirilla antes de reimprimir");
  } });
  try {
    await esperar(() => s.confirmaciones.length > 0);
    assert.equal(impresiones, 1);
    assert.equal(s.confirmaciones[0].ok, false);
    assert.match(s.confirmaciones[0].motivo, /Revisa/);
  } finally { a.detener(); await a.terminado; }
});
test("detener o cambiar de configuración invalida trabajos que todavía no se enviaron", async () => {
  const s = servidor([trabajo]);
  const cola = crearCola();
  let liberar, impresiones = 0;
  const primero = cola(() => new Promise((r) => { liberar = r; }));
  const a = crearAgente({ token: "secreto", fetchImpl: s.fetchImpl, imprimir: (bytes, vigente) => cola(() => {
    if (!vigente()) throw Error("Configuración cambiada");
    impresiones++;
  }) });
  await esperar(() => !!liberar);
  await new Promise((r) => setTimeout(r, 10));
  a.detener(); liberar(); await primero; await a.terminado;
  assert.equal(impresiones, 0);
});
test("un token rechazado detiene la reconexión y muestra una acción concreta", async () => {
  const estados = [];
  let solicitudes = 0;
  const a = crearAgente({ token: "secreto", estado: (s) => estados.push(s), fetchImpl: async () => {
    solicitudes++; return new Response("{}", { status: 401 });
  }, imprimir: () => assert.fail("No debe imprimir") });
  await a.terminado;
  assert.equal(solicitudes, 1);
  assert.match(estados.at(-1), /Token rechazado/);
});
test("reconecta después de un corte sin repetir el trabajo ya recibido", async () => {
  const s = servidor([trabajo]);
  let conexiones = 0, impresiones = 0;
  const a = crearAgente({ token: "secreto", demora: 1, imprimir: async () => { impresiones++; },
    fetchImpl: async (url, options) => {
      if (url.endsWith("/stream") && ++conexiones === 1)
        return new Response('data: ' + JSON.stringify(trabajo) + '\n\n', { headers: { "Content-Type": "text/event-stream" } });
      return s.fetchImpl(url, options);
    },
  });
  try {
    await esperar(() => conexiones === 2 && s.confirmaciones.length >= 2);
    assert.equal(impresiones, 1);
    assert.ok(s.confirmaciones.every((c) => c.ok === true));
  } finally { a.detener(); await a.terminado; }
});
test("un evento inválido se rechaza sin enviar bytes a la impresora", async () => {
  const s = servidor([{ ...trabajo, datosBase64: "!!!!" }]);
  const a = crearAgente({ token: "secreto", fetchImpl: s.fetchImpl, imprimir: () => assert.fail("No debe imprimir") });
  try {
    await esperar(() => s.confirmaciones.length > 0);
    assert.equal(s.confirmaciones[0].ok, false);
  } finally { a.detener(); await a.terminado; }
});
