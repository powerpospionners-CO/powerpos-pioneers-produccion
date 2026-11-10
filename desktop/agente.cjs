const { bytesTrabajo } = require("./seguridad.cjs");
const API = "https://api.powerpospioneers.com";

// Comparte la misma cola de la impresión directa. Los IDs se recuerdan antes
// de enviar: perder la confirmación nunca autoriza otra copia del documento.
function crearAgente({ token, imprimir, estado = () => {}, fetchImpl = fetch, demora = 5000 }) {
  const control = new AbortController(), vistos = new Map();
  let pendientes = 0;
  const headers = { "X-Agente-Token": token };
  async function confirmar(id, ok, motivo) {
    try {
      const r = await fetchImpl(API + "/impresion/confirmar", {
        method: "POST", redirect: "error",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id, ok, ...(motivo ? { motivo: motivo.slice(0, 500) } : {}) }),
        signal: AbortSignal.any([control.signal, AbortSignal.timeout(10000)]),
      });
      if (!r.ok) throw Error("Confirmación rechazada");
    } catch {
      if (!control.signal.aborted) estado("No se confirmó el trabajo al servidor. Revisa el papel antes de reimprimir.");
    }
  }
  function recibir(t) {
    if (t?.tipo === "PING") return;
    if (typeof t?.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(t.id)) return;
    for (const [id, item] of vistos) if (item.final && Date.now() - item.fecha > 3600000) vistos.delete(id);
    const previo = vistos.get(t.id);
    if (previo) {
      if (previo.final) void confirmar(t.id, previo.ok, previo.motivo);
      return;
    }
    let bytes;
    try { bytes = bytesTrabajo(t); } catch { void confirmar(t.id, false, "Trabajo no válido"); return; }
    if (pendientes >= 20 || vistos.size >= 10000) {
      void confirmar(t.id, false, "Cola de impresión ocupada. Revisa la impresora.");
      return;
    }
    const resultado = { final: false, ok: false, fecha: Date.now() };
    vistos.set(t.id, resultado);
    pendientes++;
    const recibidoEn = Date.now();
    Promise.resolve().then(() => {
      if (control.signal.aborted) throw Error("Se desactivó la recepción automática");
      return imprimir(bytes, () => !control.signal.aborted && Date.now() - recibidoEn < 5000);
    }).then(() => { resultado.ok = true; }, (e) => {
      resultado.motivo = e.message || "No se confirmó el envío a la impresora";
      if (!control.signal.aborted) estado(resultado.motivo);
    }).finally(() => {
      pendientes--;
      resultado.final = true;
      void confirmar(t.id, resultado.ok, resultado.motivo);
    });
  }
  async function conectar() {
    while (!control.signal.aborted) {
      const conexion = new AbortController();
      let lector, reloj;
      const latido = () => {
        clearTimeout(reloj);
        reloj = setTimeout(() => conexion.abort(), 50000);
        reloj.unref?.();
      };
      try {
        estado("Conectando recepción automática…");
        latido();
        const r = await fetchImpl(API + "/impresion/stream", {
          headers, redirect: "error",
          signal: AbortSignal.any([control.signal, conexion.signal]),
        });
        if (!r.ok || !r.headers.get("content-type")?.includes("text/event-stream")) {
          await r.body?.cancel();
          estado(r.status === 401 || r.status === 403 ? "Token rechazado. Revisa la configuración de recepción automática." : "Servidor no disponible. Reconectando…");
          if (r.status === 401 || r.status === 403) return;
          throw Error("Canal no disponible");
        }
        estado("Recepción automática conectada");
        lector = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!control.signal.aborted) {
          const { done, value } = await lector.read();
          if (done) break;
          latido();
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 15 * 1024 * 1024) throw Error("Evento demasiado grande");
          let match;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const bloque = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const datos = bloque.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
            if (datos) { try { recibir(JSON.parse(datos)); } catch {} }
          }
        }
      } catch {
        if (!control.signal.aborted) estado("Conexión interrumpida. Reconectando…");
      } finally {
        clearTimeout(reloj);
        conexion.abort();
        await lector?.cancel().catch(() => {});
      }
      if (!control.signal.aborted) await new Promise((resolve) => {
        const terminar = () => { clearTimeout(timer); control.signal.removeEventListener("abort", terminar); resolve(); };
        const timer = setTimeout(terminar, demora);
        timer.unref?.();
        control.signal.addEventListener("abort", terminar, { once: true });
      });
    }
  }
  const terminado = conectar();
  return { detener: () => control.abort(), terminado };
}
module.exports = { crearAgente };
