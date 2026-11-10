const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  ipPrivada,
  rutaImpresion,
  validarSolicitud,
  origenPagina,
  ORIGENES,
  navegacionPermitida,
  tipoVentana,
  bytesTrabajo,
} = require("../seguridad.cjs");
test("solo permite destinos privados y rutas de impresión exactas", () => {
  for (const ip of ["192.168.18.228", "10.0.0.5", "172.16.0.2"])
    assert.equal(ipPrivada(ip), true);
  for (const ip of [
    "127.0.0.1",
    "8.8.8.8",
    "192.168.0.999",
    "printer.local",
    "169.254.169.254",
  ])
    assert.equal(ipPrivada(ip), false);
  assert.equal(rutaImpresion("/impresion/ticket"), true);
  for (const r of [
    "https://evil.com/impresion/ticket",
    "//evil.com",
    "/usuarios",
    "/impresion/ticket?destino=otro",
  ])
    assert.equal(rutaImpresion(r), false);
});
test("portal único sin catálogo y sin navegación privilegiada externa", () => {
  assert.deepEqual(Object.keys(ORIGENES), ["general"]);
  for (const ruta of ["/login", "/auth/callback", "/pos"])
    assert.equal(navegacionPermitida(ORIGENES.general + ruta, "general"), true);
  for (const url of ["https://otra-empresa.example/pos", "https://app.powerpospioneers.com.evil/login", "file:///C:/test", "https://usuario:clave@app.powerpospioneers.com/login"])
    assert.equal(navegacionPermitida(url, "general"), false);
  assert.equal(navegacionPermitida(ORIGENES.general, "desconocido"), false);
});
test("migra instalaciones anteriores conservando impresora sin trasladar token", () => {
  const { migrarConfiguracion } = require("../seguridad.cjs");
  const vieja = { sitio: "anterior", impresora: "192.168.1.20", impresoraMac: "AA:BB:CC:DD:EE:FF", tokenAgenteCifrado: "secreto" };
  const nueva = migrarConfiguracion(vieja);
  assert.equal(nueva.sitio, "general");
  assert.equal(nueva.impresoraMac, vieja.impresoraMac);
  assert.equal(nueva.tokenAgenteCifrado, undefined);
  assert.equal(migrarConfiguracion({ sitio: "general", impresora: "" }).sitio, "general");
  assert.equal(migrarConfiguracion({ sitio: "anterior", impresora: "8.8.8.8" }), null);
  assert.equal(migrarConfiguracion(null), null);
});
test("permite recibos y pantallas locales sin esquemas ejecutables", () => {
  const origen = ORIGENES.general + "/pos";
  assert.equal(tipoVentana("about:blank", origen), "recibo");
  assert.equal(tipoVentana(ORIGENES.general + "/cliente", origen), "pantalla");
  assert.equal(tipoVentana(ORIGENES.general + "/llamado", origen), "pantalla");
  assert.equal(tipoVentana("https://otra-empresa.example/pos", origen), "externa");
  for (const url of ["file:///C:/Windows/win.ini", "javascript:alert(1)", "data:text/html,hello"])
    assert.equal(tipoVentana(url, origen), "bloqueada");
});
test("solo convierte documentos del contrato de impresión con tamaño acotado", () => {
  assert.deepEqual(bytesTrabajo({ tipo: "CIERRE", datosBase64: "aG9sYQ==" }), Buffer.from("hola"));
  for (const t of [null, { tipo: "EJECUTAR", datosBase64: "aG9sYQ==" }, { tipo: "TICKET", datosBase64: "" }, { tipo: "TICKET", datosBase64: "!!!!" }, { tipo: "TICKET", datosBase64: "a=" }])
    assert.throws(() => bytesTrabajo(t));
});
test("rechaza mensajes de sitios o documentos no autorizados", () => {
  assert.equal(origenPagina(ORIGENES.general + "/pos", ORIGENES.general), true);
  assert.equal(
    origenPagina(
      "https://app.powerpospioneers.com.ejemplo.com/pos",
      ORIGENES.general,
    ),
    false,
  );
  assert.throws(() =>
    validarSolicitud({ ruta: "/impresion/ticket", datos: {}, token: "clave" }),
  );
  assert.throws(() =>
    validarSolicitud({ ruta: "/usuarios", datos: {}, token: "aaa.bbb.ccc" }),
  );
  assert.throws(() =>
    validarSolicitud({
      ruta: "/impresion/ticket",
      datos: { texto: "a".repeat(210000) },
      token: "aaa.bbb.ccc",
    }),
  );
});
test("no imprime una sesión de otra empresa en el puesto configurado", () => {
  const s = {
    ruta: "/impresion/ticket",
    datos: {},
    token:
      "aaa." +
      Buffer.from(JSON.stringify({ empresaId: 1 })).toString("base64url") +
      ".ccc",
  };
  assert.throws(() => validarSolicitud(s, 2), /empresa seleccionada/);
  assert.equal(validarSolicitud(s, 1), s);
});
