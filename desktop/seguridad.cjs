const ORIGENES = Object.freeze({
  enchila: "https://enchilamarketpereira.powerpospioneers.com",
  trailer: "https://trailerdelsabor.powerpospioneers.com",
  general: "https://app.powerpospioneers.com",
});
function rutaImpresion(ruta) {
  return (
    typeof ruta === "string" &&
    (/^\/impresion\/(ticket|comanda|comandas|abrir-cajon)$/.test(ruta) ||
      /^\/caja\/(\d+\/(cerrar|reimprimir-cierre)|reimprimir-mi-cierre)$/.test(
        ruta,
      ))
  );
}
function ipPrivada(ip) {
  if (typeof ip !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
    return false;
  const p = ip.split(".").map(Number);
  if (p.some((n) => n > 255)) return false;
  return (
    p[0] === 10 ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
  );
}
function validarSolicitud(s, empresaEsperada) {
  if (
    !s ||
    !rutaImpresion(s.ruta) ||
    typeof s.token !== "string" ||
    s.token.length > 8192 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s.token)
  )
    throw Error("Solicitud de impresión no válida");
  if (
    !s.datos ||
    typeof s.datos !== "object" ||
    Array.isArray(s.datos) ||
    Buffer.byteLength(JSON.stringify(s.datos)) > 200000
  )
    throw Error("Documento de impresión no válido");
  if (empresaEsperada !== undefined) {
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(s.token.split(".")[1], "base64url").toString(),
      );
    } catch {
      throw Error("Sesión no válida");
    }
    if (payload.empresaId !== empresaEsperada)
      throw Error(
        "La sesión no corresponde a la empresa seleccionada. Cierra sesión e ingresa con el usuario de esta sede.",
      );
  }
  return s;
}
function origenPagina(url, origen) {
  try {
    const u = new URL(url);
    return (
      Object.values(ORIGENES).includes(origen) &&
      u.origin === origen &&
      u.protocol === "https:" && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
function sitioPagina(url) {
  return Object.keys(ORIGENES).find((sitio) => origenPagina(url, ORIGENES[sitio]));
}
function navegacionPermitida(url, sitio) {
  const destino = sitioPagina(url);
  if (!destino || !Object.hasOwn(ORIGENES, sitio)) return false;
  if (sitio === "general" || destino === sitio) return true;
  // La web usa el login central incluso al salir de una empresa.
  const ruta = new URL(url).pathname;
  return destino === "general" && (ruta === "/login" || ruta === "/superadmin");
}
function tipoVentana(url, origen) {
  if (!sitioPagina(origen)) return "bloqueada";
  if (url === "about:blank") return "recibo";
  try {
    const u = new URL(url);
    if (u.origin === new URL(origen).origin && origenPagina(url, u.origin))
      return ["/cliente", "/llamado"].includes(u.pathname) ? "pantalla" : "interna";
    if (u.protocol === "https:" && !u.username && !u.password && !sitioPagina(url))
      return "externa";
  } catch {}
  return "bloqueada";
}
function bytesTrabajo(t) {
  if (!t || !["TICKET", "COMANDA", "CAJON", "CIERRE"].includes(t.tipo) ||
      typeof t.datosBase64 !== "string" || !t.datosBase64.length ||
      t.datosBase64.length > 14 * 1024 * 1024 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(t.datosBase64))
    throw Error("Trabajo de impresión no válido");
  const bytes = Buffer.from(t.datosBase64, "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw Error("Documento de impresión demasiado grande");
  return bytes;
}
module.exports = {
  ORIGENES,
  rutaImpresion,
  ipPrivada,
  validarSolicitud,
  origenPagina,
  sitioPagina,
  navegacionPermitida,
  tipoVentana,
  bytesTrabajo,
};
