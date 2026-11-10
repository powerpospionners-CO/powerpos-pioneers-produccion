const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), asar = require("@electron/asar");
const raiz = path.resolve(__dirname, ".."), pkg = require("../package.json");
const dist = path.join(raiz, "dist"), archivo = path.join(dist, "win-unpacked", "resources", "app.asar");
const empaquetado = JSON.parse(asar.extractFile(archivo, "package.json"));
assert.equal(empaquetado.version, pkg.version, "Versión incorrecta dentro del paquete");
const comparados = [];
for (const nombre of pkg.build.files) {
  assert.ok(asar.extractFile(archivo, nombre).equals(fs.readFileSync(path.join(raiz, nombre))), "Archivo distinto: " + nombre);
  comparados.push(nombre);
}
const permitidos = new Set([...pkg.build.files.map((n) => "/" + n), "/package.json"]);
for (const nombre of asar.listPackage(archivo)) assert.ok(permitidos.has(nombre.replaceAll("\\", "/")), "Archivo inesperado en la distribución: " + nombre);
const instalador = `PowerPOS-Instalar-${pkg.version}.exe`;
const bytes = fs.readFileSync(path.join(dist, instalador));
assert.equal(bytes.subarray(0, 2).toString(), "MZ", "Instalador Windows no válido");
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const verificacion = { version: pkg.version, instalador, bytes: bytes.length, sha256, archivosCoinciden: comparados, comprobadoEn: new Date().toISOString() };
fs.writeFileSync(path.join(dist, `PowerPOS-Instalar-${pkg.version}.sha256`), `${sha256}  ${instalador}\n`);
fs.writeFileSync(path.join(dist, `verificacion-${pkg.version}.json`), JSON.stringify(verificacion, null, 2) + "\n");
console.log(JSON.stringify(verificacion, null, 2));
