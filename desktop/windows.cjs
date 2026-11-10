const fs = require("node:fs/promises"), path = require("node:path");
const os = require("node:os"), { execFile } = require("node:child_process");
// execFile pasa argumentos, nunca comandos concatenados ni copy /b.
async function enviarWindows(nombre, bytes, { ejecutar = execFile, temporal = os.tmpdir() } = {}) {
  if (typeof nombre !== "string" || !nombre.trim() || nombre.length > 256 || /[\x00-\x1f]/.test(nombre) ||
      !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 10 * 1024 * 1024)
    throw Error("Impresora o documento de Windows no válido");
  const carpeta = await fs.mkdtemp(path.join(temporal, "powerpos-impresion-"));
  const archivo = path.join(carpeta, "documento.bin");
  try {
    await fs.writeFile(archivo, bytes, { mode: 0o600 });
    await new Promise((resolve, reject) => {
      const ejecutable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      ejecutar(ejecutable, ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File",
        path.join(__dirname, "imprimir-windows.ps1").replace(/app\.asar([\\/])/, "app.asar.unpacked$1"), "-PrinterName", nombre, "-DocumentPath", archivo],
      { windowsHide: true, timeout: 30000, maxBuffer: 65536 }, (error, stdout) => {
        let resultado;
        try { resultado = JSON.parse(String(stdout).replace(/^\uFEFF/, "").trim()); } catch {}
        if (!error && resultado?.enviado === true) return resolve();
        const e = Error(resultado?.motivo || "Windows no confirmó el envío. Revisa la cola de impresión y el papel antes de reimprimir.");
        e.antesDeEnviar = resultado?.antesDeEnviar === true;
        reject(e);
      });
    });
  } finally {
    await fs.unlink(archivo).catch(() => {});
    await fs.rmdir(carpeta).catch(() => {});
  }
}
module.exports = { enviarWindows };
