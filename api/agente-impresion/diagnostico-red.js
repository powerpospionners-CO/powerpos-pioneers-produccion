// Prueba de red sin imprimir, abrir cajón ni modificar config.json.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const https = require('https');
const { execFile } = require('child_process');

function probarPuerto(host, puerto, limiteMs = 2500) {
  return new Promise(resolve => {
    const inicio = Date.now();
    const socket = new net.Socket();
    let terminado = false;
    const terminar = (abierto, motivo) => {
      if (terminado) return;
      terminado = true; socket.destroy();
      resolve({ abierto, motivo, ms: Date.now() - inicio });
    };
    socket.setTimeout(limiteMs);
    socket.once('connect', () => terminar(true, 'OK'));
    socket.once('timeout', () => terminar(false, 'TIEMPO AGOTADO'));
    socket.once('error', error => terminar(false, error.code || 'ERROR'));
    socket.connect(puerto, host); // No se escribe ningún byte.
  });
}

function ejecutar(programa, argumentos) {
  return new Promise(resolve => execFile(programa, argumentos, { windowsHide: true, timeout: 5000 }, (error, salida) => resolve(error ? '' : salida.trim())));
}

function estadoServidor() {
  return new Promise(resolve => {
    const req = https.get('https://api.powerpospioneers.com/', { timeout: 5000 }, res => { res.resume(); resolve('HTTP ' + res.statusCode); });
    req.on('timeout', () => req.destroy(new Error('TIEMPO AGOTADO')));
    req.on('error', error => resolve(error.code || error.message));
  });
}

async function main() {
  const lineas = [], anotar = texto => { lineas.push(texto); console.log(texto); };
  anotar('DIAGNOSTICO DE IMPRESORA POWERPOS - ' + new Date().toISOString());
  anotar('Esta prueba no imprime ni cambia configuracion. No incluye el token.');
  let host = '192.168.18.228', puerto = 9100;
  const archivo = path.join(__dirname, 'config.json');
  if (fs.existsSync(archivo)) {
    try {
      const config = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      if (net.isIPv4(config.impresoraHost)) host = config.impresoraHost;
      if (Number.isInteger(Number(config.impresoraPuerto)) && Number(config.impresoraPuerto) > 0 && Number(config.impresoraPuerto) <= 65535) puerto = Number(config.impresoraPuerto);
    } catch { anotar('No se pudo leer la IP de config.json; se usa la IP reportada del Trailer.'); }
  }
  anotar('Impresora consultada: ' + host + ':' + puerto);
  const interfaces = Object.entries(os.networkInterfaces()).flatMap(([nombre, direcciones]) => (direcciones || [])
    .filter(i => i.family === 'IPv4' && !i.internal).map(i => ({ nombre, ip: i.address })));
  interfaces.forEach(i => anotar('Red del computador: ' + i.nombre + ' - ' + i.ip));
  anotar('Servidor PowerPOS: ' + await estadoServidor());
  if (process.platform === 'win32') {
    const cantidad = await ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '(?i)(?:^|[\\/\\s\"])agente\\.js(?:[\\s\"]|$)' } | Measure-Object).Count`]);
    anotar('Copias del agente abiertas: ' + (cantidad || 'No se pudo consultar'));
  }
  const resultados = [];
  for (let n = 1; n <= 3; n++) {
    if (n > 1) await new Promise(resolve => setTimeout(resolve, 1000));
    const r = await probarPuerto(host, puerto); resultados.push(r);
    anotar('Conexion a impresora ' + n + '/3: ' + r.motivo + ' (' + r.ms + ' ms)');
  }
  const abiertos = resultados.filter(r => r.abierto).length;
  if (abiertos === 3) anotar('Resultado: la impresora respondio en las tres pruebas.');
  else if (abiertos) anotar('Resultado: conexion intermitente; algunas pruebas fallaron.');
  else anotar('Resultado: el puerto de la impresora no respondio en ninguna prueba.');
  if (abiertos !== 3) {
    const prefijo = host.split('.').slice(0, 3).join('.');
    if (interfaces.some(i => i.ip.startsWith(prefijo + '.'))) {
      anotar('Buscando otros equipos de impresion en la misma red...');
      const propias = new Set(interfaces.map(i => i.ip));
      const direcciones = Array.from({ length: 254 }, (_, n) => prefijo + '.' + (n + 1)).filter(ip => !propias.has(ip));
      const encontrados = [];
      for (let i = 0; i < direcciones.length; i += 32) {
        const lote = direcciones.slice(i, i + 32);
        const estados = await Promise.all(lote.map(ip => probarPuerto(ip, puerto, 750)));
        estados.forEach((r, j) => { if (r.abierto) encontrados.push(lote[j]); });
      }
      anotar('Direcciones con puerto ' + puerto + ' abierto: ' + (encontrados.join(', ') || 'Ninguna'));
      anotar('Encontrar un puerto abierto no identifica por si solo la impresora. No se cambia ninguna IP.');
    } else anotar('El computador no muestra una direccion en la misma subred que la IP de la impresora.');
  }
  const destino = path.join(__dirname, 'diagnostico-impresora.txt');
  fs.writeFileSync(destino, lineas.join(os.EOL), 'utf8');
  console.log('\nResultado guardado en diagnostico-impresora.txt. Comparte ese resultado para revisar la conexion.');
}

if (require.main === module) main().catch(() => { console.error('No se pudo completar la prueba. Verifica que la carpeta permita guardar archivos.'); process.exitCode = 1; });
module.exports = { probarPuerto };
