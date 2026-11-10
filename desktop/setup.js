"use strict";
const impresora = document.getElementById("impresora"),
  estado = document.getElementById("estado"),
  boton = document.getElementById("buscar");
const modo = document.getElementById("modo"), impresoraWindows = document.getElementById("impresora-windows");
function actualizarModo() {
  document.getElementById("panel-red").hidden = modo.value !== "red";
  document.getElementById("panel-windows").hidden = modo.value !== "windows";
  impresora.required = modo.value === "red";
  impresoraWindows.required = modo.value === "windows";
  document.getElementById("probar").disabled = modo.value === "sin";
}
async function cargarWindows(seleccion = impresoraWindows.value) {
  try {
    const lista = await window.powerposDesktop.impresorasWindows();
    impresoraWindows.replaceChildren(new Option("Selecciona la impresora", ""), ...lista.map((p) => new Option(p.nombre + (p.predeterminada ? " (predeterminada)" : ""), p.nombre)));
    if (seleccion && !lista.some((p) => p.nombre === seleccion))
      impresoraWindows.add(new Option(seleccion + " (no disponible)", seleccion));
    impresoraWindows.value = seleccion;
  } catch { estado.textContent = "No se pudo consultar las impresoras. Comprueba el servicio de impresión de Windows."; }
}
modo.addEventListener("change", actualizarModo);
document.getElementById("actualizar-windows").addEventListener("click", () => void cargarWindows());
actualizarModo();
window.powerposDesktop
  .estado()
  .then(async (c) => {
    impresora.value = c.impresora;
    modo.value = c.impresoraWindows ? "windows" : c.impresora ? "red" : "sin";
    actualizarModo();
    await cargarWindows(c.impresoraWindows || "");
    document.getElementById("estado-agente").textContent = (c.agenteConfigurado ? "Token guardado. " : "") + c.estadoAgente;
    document.getElementById("estado-red").textContent = c.impresoraMac ? "Impresora identificada: " + c.impresoraMac + ". " + c.estadoRed : "Al guardar se identifica la impresora para seguirla cuando cambie de IP.";
    document.title = "PowerPOS " + c.version + " · Configuración";
  })
  .catch(() => {
    estado.textContent = "No se pudo leer la configuración.";
  });
boton.addEventListener("click", async () => {
  boton.disabled = true;
  estado.textContent = "Buscando en la red local…";
  try {
    const ips = await window.powerposDesktop.buscarImpresoras();
    document.getElementById("impresoras").replaceChildren(
      ...ips.map((ip) => {
        const o = document.createElement("option");
        o.value = ip;
        return o;
      }),
    );
    if (ips.length === 1) {
      impresora.value = ips[0];
      estado.textContent =
        "Se encontró una impresora. Confirma que sea la de esta caja y guarda.";
    } else
      estado.textContent = ips.length
        ? "Se encontraron varias impresoras: " +
          ips.join(", ") +
          ". Selecciona la IP de esta caja."
        : "No se encontró una impresora. Revisa el cable y que esté encendida.";
  } catch {
    estado.textContent = "No se pudo revisar la red local.";
  } finally {
    boton.disabled = false;
  }
});
document.getElementById("probar").addEventListener("click", async (event) => {
  const b = event.currentTarget;
  b.disabled = true;
  try {
    await window.powerposDesktop.probarImpresora(modo.value === "windows" ? { nombre: impresoraWindows.value } : { ip: impresora.value.trim() });
    estado.textContent = "Prueba enviada. Confirma que salió papel; no se envió ninguna apertura del cajón.";
  } catch (e) {
    estado.textContent = "No se confirmó la prueba. Revisa la IP, la red y si salió papel antes de volver a enviarla. " + e.message;
  } finally { b.disabled = false; }
});
document.getElementById("configurar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const b = document.getElementById("guardar");
  b.disabled = true;
  try {
    await window.powerposDesktop.guardarConfiguracion({
      sitio: "general",
      impresora: modo.value === "red" ? impresora.value.trim() : "",
      impresoraWindows: modo.value === "windows" ? impresoraWindows.value : "",
      tokenAgente: document.getElementById("token-agente").value.trim(),
      quitarAgente: document.getElementById("quitar-agente").checked,
    });
  } catch (error) {
    estado.textContent = error.message || "No se pudo guardar. Revisa los datos y vuelve a intentar.";
    b.disabled = false;
  }
});
