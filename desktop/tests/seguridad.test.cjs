const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  ipPrivada,
  rutaImpresion,
  validarSolicitud,
  origenPagina,
  ORIGENES,
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
test("rechaza mensajes de sitios o documentos no autorizados", () => {
  assert.equal(origenPagina(ORIGENES.trailer + "/pos", ORIGENES.trailer), true);
  assert.equal(
    origenPagina(
      "https://trailerdelsabor.powerpospioneers.com.ejemplo.com/pos",
      ORIGENES.trailer,
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
