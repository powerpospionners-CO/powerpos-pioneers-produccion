// Agente de impresión de PowerPOS.
//
// Corre en el computador del negocio, en la misma red que la impresora
// térmica. Se conecta al backend en la nube y espera trabajos de impresión
// (ticket, comanda, apertura de cajón); cuando llega uno, lo envía por la
// red local a la impresora y confirma el resultado al backend.
//
// No necesita instalar nada (usa solo módulos de Node). Requiere Node.js
// instalado en el computador. Para dejarlo siempre encendido, configúralo
// para que arranque con Windows (ver README.md de esta carpeta).

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const { exec } = require('child_process');

const RUTA_CONFIG = path.join(__dirname, 'config.json');

function cargarConfig() {
  if (!fs.existsSync(RUTA_CONFIG)) {
    console.error(`No se encontró config.json en ${RUTA_CONFIG}`);
    console.error('Copia config.ejemplo.json como config.json y completa tus datos.');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(RUTA_CONFIG, 'utf8'));
  for (const campo of ['apiUrl', 'token']) {
    if (!config[campo]) {
      console.error(`Falta el campo "${campo}" en config.json`);
      process.exit(1);
    }
  }
  config.modoImpresora = config.modoImpresora === 'usb' ? 'usb' : 'red';
  if (config.modoImpresora === 'usb') {
    if (!config.impresoraCompartida) {
      console.error('Falta el campo "impresoraCompartida" en config.json (modoImpresora: "usb")');
      process.exit(1);
    }
  } else if (!config.impresoraHost) {
    console.error('Falta el campo "impresoraHost" en config.json (modoImpresora: "red")');
    process.exit(1);
  }
  config.impresoraPuerto = config.impresoraPuerto || 9100;
  config.apiUrl = String(config.apiUrl).replace(/\/$/, '');
  return config;
}

function clienteHttp(url) {
  return url.startsWith('https://') ? https : http;
}

// Intenta una conexión TCP corta a un puerto, solo para saber si algo
// responde ahí (no envía ni recibe datos reales).
function puertoAbierto(ip, puerto, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resuelto = false;
    const terminar = (abierto) => {
      if (resuelto) return;
      resuelto = true;
      socket.destroy();
      resolve(abierto);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => terminar(true));
    socket.once('timeout', () => terminar(false));
    socket.once('error', () => terminar(false));
    socket.connect(puerto, ip);
  });
}

// Lee la tabla ARP del sistema (IP -> MAC) para confirmar, cuando hay más
// de un candidato, cuál de las IPs que respondieron es la impresora.
function leerTablaArp() {
  return new Promise((resolve) => {
    exec('arp -a', (error, stdout) => {
      const tabla = new Map();
      if (!error && stdout) {
        for (const linea of stdout.split('\n')) {
          const match = linea.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{17})/);
          if (match) tabla.set(match[1], match[2].toLowerCase().replace(/-/g, ':'));
        }
      }
      resolve(tabla);
    });
  });
}

function propiaSubredLocal() {
  const interfaces = os.networkInterfaces();
  for (const nombre of Object.keys(interfaces)) {
    for (const iface of interfaces[nombre]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const partes = iface.address.split('.');
        return { prefijo: `${partes[0]}.${partes[1]}.${partes[2]}`, propiaIp: iface.address };
      }
    }
  }
  return null;
}

// La IP de la impresora puede cambiar (DHCP del router) si se reinicia la
// impresora o el router. En vez de depender de que la IP quede fija,
// cuando falla una conexión se busca la impresora en toda la red local por
// el puerto 9100 y, si hay varios candidatos, se confirma con la MAC
// (config.impresoraMac) usando la tabla ARP del sistema.
async function buscarImpresoraEnRed(config) {
  const subred = propiaSubredLocal();
  if (!subred) return null;
  console.log(`Buscando la impresora en la red ${subred.prefijo}.0/24 ...`);

  const candidatos = [];
  const tareas = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${subred.prefijo}.${i}`;
    if (ip === subred.propiaIp) continue;
    tareas.push(puertoAbierto(ip, config.impresoraPuerto, 250).then((abierto) => { if (abierto) candidatos.push(ip); }));
  }
  await Promise.all(tareas);

  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];

  if (config.impresoraMac) {
    const macBuscada = String(config.impresoraMac).toLowerCase().replace(/-/g, ':');
    const tablaArp = await leerTablaArp();
    const confirmado = candidatos.find((ip) => tablaArp.get(ip) === macBuscada);
    if (confirmado) return confirmado;
  }
  console.warn(`Se encontraron ${candidatos.length} dispositivos con el puerto ${config.impresoraPuerto} abierto; se usará el primero (${candidatos[0]}). Agrega "impresoraMac" en config.json para que la búsqueda sea exacta.`);
  return candidatos[0];
}

function guardarIpImpresora(nuevaIp) {
  try {
    const config = JSON.parse(fs.readFileSync(RUTA_CONFIG, 'utf8'));
    config.impresoraHost = nuevaIp;
    fs.writeFileSync(RUTA_CONFIG, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('No se pudo guardar la nueva IP de la impresora en config.json:', error.message);
  }
}

function intentarConexion(config, datos) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve('timeout');
    }, 4000);

    socket.once('error', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve('error');
    });
    socket.connect(config.impresoraPuerto, config.impresoraHost, () => {
      socket.end(datos, () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  });
}

// Impresora en red. Si no conecta en la IP guardada, busca la impresora en
// la red local y, si la encuentra en otra IP, actualiza config.json y
// reintenta una sola vez — así el cambio de IP se autocorrige solo.
async function imprimirRed(config, datosBase64, reintentando = false) {
  const datos = Buffer.from(datosBase64, 'base64');
  const resultado = await intentarConexion(config, datos);
  if (!resultado) return null;

  if (!reintentando) {
    console.warn(`No se pudo conectar a ${config.impresoraHost}:${config.impresoraPuerto}. Buscando la impresora en la red...`);
    const ipEncontrada = await buscarImpresoraEnRed(config);
    if (ipEncontrada && ipEncontrada !== config.impresoraHost) {
      console.log(`Impresora encontrada en ${ipEncontrada} (antes ${config.impresoraHost}). Guardando en config.json...`);
      config.impresoraHost = ipEncontrada;
      guardarIpImpresora(ipEncontrada);
      return imprimirRed(config, datosBase64, true);
    }
  }

  return resultado === 'timeout'
    ? `Tiempo agotado conectando a ${config.impresoraHost}:${config.impresoraPuerto}`
    : `No se pudo conectar a ${config.impresoraHost}:${config.impresoraPuerto}`;
}

// Impresora conectada por cable USB al computador, instalada y compartida en
// Windows (ver README: "Imprimir por USB"). Se manda tal cual (RAW) al
// nombre compartido usando "copy /b", la forma clásica de Windows para
// pasar bytes crudos a una impresora sin que el driver los reinterprete.
function imprimirUsb(config, datosBase64) {
  return new Promise((resolve) => {
    const datos = Buffer.from(datosBase64, 'base64');
    const archivoTemporal = path.join(os.tmpdir(), `powerpos-ticket-${Date.now()}-${Math.round(Math.random() * 1e9)}.bin`);
    fs.writeFile(archivoTemporal, datos, (errorEscritura) => {
      if (errorEscritura) {
        resolve(`No se pudo preparar el archivo a imprimir: ${errorEscritura.message}`);
        return;
      }
      const destino = `\\\\localhost\\${config.impresoraCompartida}`;
      exec(`copy /b "${archivoTemporal}" "${destino}"`, (error, _stdout, stderr) => {
        fs.unlink(archivoTemporal, () => {});
        if (error) {
          resolve(`No se pudo imprimir en "${config.impresoraCompartida}": ${(stderr || error.message || '').trim()}`);
        } else {
          resolve(null);
        }
      });
    });
  });
}

function imprimir(config, datosBase64) {
  return config.modoImpresora === 'usb' ? imprimirUsb(config, datosBase64) : imprimirRed(config, datosBase64);
}

function confirmar(config, id, ok, motivo) {
  const cliente = clienteHttp(config.apiUrl);
  const cuerpo = JSON.stringify({ id, ok, motivo });
  const url = new URL(`${config.apiUrl}/impresion/confirmar`);

  const req = cliente.request(
    {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(cuerpo),
        'X-Agente-Token': config.token,
      },
    },
    (res) => {
      res.resume();
    },
  );
  req.on('error', (error) => console.error('No se pudo confirmar el trabajo al servidor:', error.message));
  req.write(cuerpo);
  req.end();
}

async function manejarTrabajo(config, trabajo) {
  const etiqueta = { TICKET: 'ticket', COMANDA: 'comanda', CAJON: 'apertura de cajón', CIERRE: 'cierre de caja' }[trabajo.tipo] || trabajo.tipo;
  console.log(`→ Trabajo recibido: ${etiqueta} (${trabajo.id})`);
  const error = await imprimir(config, trabajo.datosBase64);
  if (error) {
    console.error(`✗ No se pudo imprimir (${etiqueta}): ${error}`);
    confirmar(config, trabajo.id, false, error);
  } else {
    console.log(`✓ Impreso correctamente (${etiqueta})`);
    confirmar(config, trabajo.id, true);
  }
}

function conectar(config) {
  const url = new URL(`${config.apiUrl}/impresion/stream?token=${encodeURIComponent(config.token)}`);
  const cliente = clienteHttp(config.apiUrl);

  console.log(`Conectando a ${config.apiUrl} ...`);

  const req = cliente.get(url, (res) => {
    if (res.statusCode !== 200) {
      console.error(`El servidor respondió ${res.statusCode}. Revisa el token en config.json.`);
      res.resume();
      programarReconexion(config);
      return;
    }

    console.log('✓ Conectado. Esperando trabajos de impresión...');
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let indice;
      while ((indice = buffer.indexOf('\n\n')) !== -1) {
        const bloque = buffer.slice(0, indice);
        buffer = buffer.slice(indice + 2);
        const linea = bloque.split('\n').find((l) => l.startsWith('data:'));
        if (!linea) continue;
        try {
          const trabajo = JSON.parse(linea.slice(5).trim());
          if (trabajo.tipo === 'PING') continue; // latido de conexión, no es un trabajo real
          manejarTrabajo(config, trabajo);
        } catch (error) {
          console.error('No se pudo interpretar el trabajo recibido:', error.message);
        }
      }
    });

    res.on('end', () => {
      console.warn('Se cerró la conexión con el servidor. Reintentando...');
      programarReconexion(config);
    });
    res.on('error', (error) => {
      console.error('Error en la conexión:', error.message);
      programarReconexion(config);
    });
  });

  req.on('error', (error) => {
    console.error('No se pudo conectar al servidor:', error.message);
    programarReconexion(config);
  });
}

let reconectando = false;
function programarReconexion(config) {
  if (reconectando) return;
  reconectando = true;
  setTimeout(() => {
    reconectando = false;
    conectar(config);
  }, 5000);
}

console.log('=== Agente de impresión PowerPOS ===');
const config = cargarConfig();
conectar(config);
