const path = require("node:path");
const { execFile } = require("node:child_process");
const { probar, buscar } = require("./impresora.cjs");
const { ipPrivada } = require("./seguridad.cjs");
function normalizarMac(valor) {
  if (typeof valor !== "string") return undefined;
  const mac = valor.trim().toLowerCase().replaceAll("-", ":");
  if (!/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(mac) ||
      mac === "00:00:00:00:00:00" || (parseInt(mac.slice(0, 2), 16) & 1)) return undefined;
  return mac;
}
function tablaArp(texto) {
  const mapa = new Map();
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([a-fA-F0-9:-]{17})\s/);
    if (!m || !ipPrivada(m[1])) continue;
    const mac = normalizarMac(m[2]);
    if (!mac) continue;
    // Una IP repetida en interfaces distintas no permite identificar el equipo.
    if (mapa.has(m[1]) && mapa.get(m[1]) !== mac) mapa.set(m[1], undefined);
    else mapa.set(m[1], mac);
  }
  return mapa;
}
async function leerArp() {
  return new Promise((resolve, reject) => {
    execFile(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "arp.exe"), ["-a"],
      { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) reject(Error("No se pudo identificar la impresora en la red local."));
        else resolve(tablaArp(stdout));
      });
  });
}
async function localizar(config, { sondear = probar, explorar = buscar, vecinos = leerArp } = {}) {
  if (!ipPrivada(config.impresora)) throw Error("Configura la impresora de red.");
  const mac = normalizarMac(config.impresoraMac);
  if (await sondear(config.impresora)) {
    const actual = (await vecinos()).get(config.impresora);
    if (mac ? actual === mac : !!actual) return { ip: config.impresora, mac: actual };
    // Sin identidad no se envían documentos a una IP potencialmente reasignada.
  }
  if (!mac) throw Error("Confirma la impresora en Configuración para guardar su identificación MAC y seguirla cuando cambie de IP.");
  const ips = await explorar();
  const tabla = await vecinos();
  const coincidencias = ips.filter((ip) => tabla.get(ip) === mac);
  if (coincidencias.length !== 1) throw Error(coincidencias.length ?
    "La impresora aparece en varias redes. Revisa las conexiones de Windows." :
    "No se encontró la impresora registrada. Revisa que esté encendida y en la misma red.");
  return { ip: coincidencias[0], mac };
}
function diaBogota(fecha) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}
function crearRevisionDiaria({ ejecutar, ahora = () => new Date(), informar = () => {} }) {
  let ultimaFecha, intento = 0, pendiente;
  return function revisar(forzar = false) {
    if (pendiente) return pendiente;
    const fecha = ahora(), dia = diaBogota(fecha);
    if (!forzar && (ultimaFecha === dia || fecha.getTime() - intento < 60000)) return Promise.resolve();
    intento = fecha.getTime();
    pendiente = Promise.resolve().then(ejecutar).then(() => {
      ultimaFecha = dia;
    }).catch((e) => { informar(e.message); throw e; }).finally(() => { pendiente = undefined; });
    return pendiente;
  };
}
module.exports = { normalizarMac, tablaArp, leerArp, localizar, crearRevisionDiaria, diaBogota };
