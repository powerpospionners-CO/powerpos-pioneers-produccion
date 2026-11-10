const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { ORIGENES } = require("./seguridad.cjs");
async function esperar(condicion) {
  for (let i = 0; i < 200; i++) {
    if (await condicion()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Tiempo agotado en la comprobación de escritorio");
}
async function comprobar({ ventana, auxiliares, salida, transporte, enlaces }) {
  const wc = ventana.webContents, session = wc.session;
  // Solo esta ejecución de prueba usa páginas sintéticas. Nunca se inicia
  // sesión, envía una venta o imprime sobre el servidor ni dispositivos reales.
  session.protocol.handle("https", () => new Response(
    '<!doctype html><meta charset="UTF-8"><title>PowerPOS · Comprobación</title><h1>Prueba local de integración Windows</h1>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  ));
  const js = (codigo) => wc.executeJavaScript(codigo, true);
  const resultado = {};
  const externos = [];
  enlaces.abrir = async (url) => { externos.push(url); };
  let envios = 0, solicitudes = 0, falloImpresora = false;
  transporte.solicitar = async (url, opciones) => {
    solicitudes++;
    assert.ok(url.startsWith("https://api.powerpospioneers.com/"));
    assert.equal(opciones.headers["X-PowerPOS-Desktop"], "1");
    return Response.json({ id: 123, preparado: true, trabajos: [{ tipo: "CIERRE", datosBase64: Buffer.from("cierre de prueba").toString("base64") }] }, { status: 201 });
  };
  transporte.enviar = async (ip, bytes) => {
    envios++;
    assert.equal(ip, "192.168.1.200");
    assert.equal(bytes.toString(), "cierre de prueba");
    if (falloImpresora) throw Error("Envío incierto: comprueba el papel");
  };
  const navegar = async (url) => {
    await js(`location.href = ${JSON.stringify(url)}; true`);
    await esperar(() => wc.getURL() === url && !wc.isLoading());
  };
  try {
    await ventana.loadURL(ORIGENES.trailer + "/pos");
    const estado = await js("window.powerposDesktop.estado()");
    assert.equal(estado.sitio, "trailer");
    const token = "aaa." + Buffer.from(JSON.stringify({ empresaId: 1 })).toString("base64url") + ".ccc";
    const solicitud = JSON.stringify({ ruta: "/caja/123/cerrar", datos: {}, token });
    const cierre = await js(`window.powerposDesktop.imprimir(${solicitud})`);
    assert.equal(cierre.status, 201);
    assert.equal(cierre.data.id, 123);
    assert.equal(cierre.data.impreso, true);
    assert.equal(cierre.data.trabajos, undefined);
    falloImpresora = true;
    const fallo = await js(`window.powerposDesktop.imprimir(${solicitud})`);
    assert.equal(fallo.status, 201);
    assert.equal(fallo.data.id, 123);
    assert.equal(fallo.data.impreso, false);
    assert.equal(fallo.data.fallbackBrowser, false);
    assert.equal(solicitudes, 2);
    assert.equal(envios, 2);
    resultado.cierreConservadoAnteFalloDeImpresion = true;
    resultado.transporteLocalSinDuplicar = true;
    await navegar(ORIGENES.general + "/login");
    await navegar(ORIGENES.trailer + "/auth/callback");
    resultado.loginCentralYRetorno = true;

    await js("window.open('/cliente', 'powerpos-pantalla-cliente'); true");
    await js("window.open('/llamado', 'powerpos-pantalla-llamado'); true");
    await esperar(() => auxiliares.size === 2 && [...auxiliares].every((w) => !w.webContents.isLoading()));
    for (const w of auxiliares) {
      assert.equal(await w.webContents.executeJavaScript("typeof window.powerposDesktop"), "undefined");
      const p = w.webContents.getLastWebPreferences();
      assert.equal(p.sandbox, true);
      assert.equal(p.nodeIntegration, false);
    }
    resultado.pantallasSinPuentePrivilegiado = true;

    assert.equal(await js(`(() => {
      const w = window.open('', '_blank', 'width=420,height=700');
      if (!w) return false;
      w.document.write('<!doctype html><title>Recibo</title><p>RECIBO DE PRUEBA</p>');
      w.document.close(); return true;
    })()`), true);
    await esperar(() => auxiliares.size === 3);
    const recibo = [...auxiliares].find((w) => w.webContents.getURL() === "about:blank");
    assert.ok(recibo);
    assert.match(await recibo.webContents.executeJavaScript("document.body.innerText"), /RECIBO DE PRUEBA/);
    assert.equal(await recibo.webContents.executeJavaScript("typeof window.print"), "function");
    resultado.reciboDeRespaldo = true;
    assert.equal(await js("window.open('file:///C:/Windows/win.ini') === null"), true);
    assert.equal(await js("window.open('data:text/html,prueba') === null"), true);
    resultado.ventanasPeligrosasBloqueadas = true;

    let finalDescarga;
    const archivo = path.join(salida, "descarga-prueba.csv");
    const descargar = (_e, item) => {
      item.setSavePath(archivo);
      item.once("done", (_evento, estado) => { finalDescarga = estado; });
    };
    session.once("will-download", descargar);
    await js(`(() => { const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['producto,cantidad\\nPrueba,1'], {type:'text/csv'}));
      a.download = 'prueba.csv'; document.body.appendChild(a); a.click(); a.remove(); return true; })()`);
    await esperar(() => finalDescarga !== undefined);
    assert.equal(finalDescarga, "completed");
    assert.match(await fs.readFile(archivo, "utf8"), /producto,cantidad/);
    resultado.descargaDeArchivos = true;

    await navegar(ORIGENES.general + "/login");
    assert.equal(auxiliares.size, 0);
    resultado.cierreDePantallasAlSalir = true;
    await navegar(ORIGENES.trailer + "/pos");
    let bloqueada = false;
    const detectar = (e, url) => { if (url === ORIGENES.enchila + "/pos") bloqueada = e.defaultPrevented; };
    wc.on("will-navigate", detectar);
    await js(`location.href = ${JSON.stringify(ORIGENES.enchila + "/pos")}; true`);
    await esperar(() => bloqueada);
    wc.removeListener("will-navigate", detectar);
    assert.equal(wc.getURL(), ORIGENES.trailer + "/pos");
    resultado.otraEmpresaBloqueada = true;
    await js("location.assign('https://checkout.wompi.co/p/?prueba=local'); true");
    await esperar(() => externos.includes("https://checkout.wompi.co/p/?prueba=local"));
    assert.equal(wc.getURL(), ORIGENES.trailer + "/pos");
    resultado.pagoExternoSinSalirDelPOS = true;
    return resultado;
  } finally { session.protocol.unhandle("https"); }
}
module.exports = { comprobar };
