const net = require("node:net"),
  os = require("node:os");
const { ipPrivada } = require("./seguridad.cjs");
function probar(ip, timeout = 400) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let fin = false;
    const terminar = (v) => {
      if (fin) return;
      fin = true;
      s.destroy();
      resolve(v);
    };
    s.setTimeout(timeout);
    s.once("connect", () => terminar(true));
    s.once("timeout", () => terminar(false));
    s.once("error", () => terminar(false));
    s.connect(9100, ip);
  });
}
async function buscar() {
  const redes = new Map();
  for (const lista of Object.values(os.networkInterfaces()))
    for (const i of lista || []) {
      if (
        (i.family === "IPv4" || i.family === 4) &&
        !i.internal &&
        ipPrivada(i.address)
      )
        redes.set(i.address.split(".").slice(0, 3).join("."), i.address);
    }
  const ips = [];
  for (const [prefijo, propia] of [...redes].slice(0, 4))
    for (let i = 1; i < 255; i++) {
      const ip = prefijo + "." + i;
      if (ip !== propia) ips.push(ip);
    }
  const encontradas = [];
  let indice = 0;
  await Promise.all(
    Array.from({ length: Math.min(32, ips.length) }, async () => {
      while (indice < ips.length) {
        const ip = ips[indice++];
        if (await probar(ip)) encontradas.push(ip);
      }
    }),
  );
  return encontradas.sort();
}
// Se reintenta solo si no se llegó a enviar ningún byte: evita duplicar tirillas.
function enviar(
  ip,
  bytes,
  timeout = 3000,
  crearSocket = () => new net.Socket(),
) {
  return new Promise((resolve, reject) => {
    if (
      !ipPrivada(ip) ||
      !Buffer.isBuffer(bytes) ||
      !bytes.length ||
      bytes.length > 10 * 1024 * 1024
    ) {
      reject(Error("Impresora o documento no válido"));
      return;
    }
    const socket = crearSocket();
    let conectado = false,
      fin = false;
    const terminar = (error) => {
      if (fin) return;
      fin = true;
      socket.destroy();
      if (error) {
        error.antesDeEnviar = !conectado;
        reject(error);
      } else resolve();
    };
    socket.setTimeout(timeout);
    socket.once("error", (e) => terminar(e));
    socket.once("timeout", () =>
      terminar(Error("La impresora no respondió. Revisa red y alimentación.")),
    );
    socket.connect(9100, ip, () => {
      conectado = true;
      socket.end(bytes, () => terminar());
    });
  });
}
function crearCola() {
  let ultima = Promise.resolve();
  return (tarea) => {
    const r = ultima.then(tarea, tarea);
    ultima = r.catch(() => {});
    return r;
  };
}
module.exports = { probar, buscar, enviar, crearCola };
