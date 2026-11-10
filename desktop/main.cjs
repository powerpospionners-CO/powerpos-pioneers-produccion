const { app, BrowserWindow, ipcMain, Menu, dialog, shell, safeStorage, powerMonitor } = require("electron");
const fs = require("node:fs/promises"),
  path = require("node:path");
const {
  ORIGENES,
  ipPrivada,
  validarSolicitud,
  origenPagina,
  navegacionPermitida,
  tipoVentana,
  bytesTrabajo,
  migrarConfiguracion,
} = require("./seguridad.cjs");
const { buscar, enviar, crearCola } = require("./impresora.cjs");
const { crearAgente } = require("./agente.cjs");
const { enviarWindows } = require("./windows.cjs");
const { localizar, normalizarMac, crearRevisionDiaria } = require("./red-impresora.cjs");
let estadoRed = "Sin comprobar", relojRed;
const red = { localizar };
async function actualizarImpresora() {
  if (smoke || !config.impresora || config.impresoraWindows) return;
  const encontrada = await red.localizar(config);
  if (config.impresora !== encontrada.ip || config.impresoraMac !== encontrada.mac) {
    const anterior = { ...config };
    config.impresora = encontrada.ip;
    config.impresoraMac = encontrada.mac;
    try { await guardar(); } catch (e) { config = anterior; throw e; }
  }
  estadoRed = "Impresora verificada: " + encontrada.ip;
}
const revisionDiaria = crearRevisionDiaria({ ejecutar: () => cola(actualizarImpresora), informar: (mensaje) => { estadoRed = mensaje; } });
const transporte = { solicitar: (...args) => fetch(...args), enviar: (...args) => enviar(...args) };
const enlaces = { abrir: (url) => shell.openExternal(url) };
function abrirExterno(url) {
  void enlaces.abrir(url).catch(() => {
    if (!ventana?.isDestroyed()) void dialog.showMessageBox(ventana, { type: "warning", message: "No se pudo abrir el enlace en el navegador de Windows." });
  });
}
const auxiliares = new Set();
let agente, revision = 0, estadoAgente = "Recepción automática desactivada";
let ventana,
  config = {},
  archivo,
  buscando,
  puenteComprobado = false;
const cola = crearCola(),
  smoke = process.argv.includes("--smoke-test");
const salidaSmoke =
  process.env.POWERPOS_SMOKE_DIR || path.join(__dirname, "dist");
if (smoke) {
  app.disableHardwareAcceleration();
  app.setPath("userData", path.join(salidaSmoke, "perfil-pruebas"));
}
const setup = path.join(__dirname, "setup.html");
function esSetup(event) {
  return (
    event.sender === ventana?.webContents &&
    event.senderFrame === ventana.webContents.mainFrame &&
    event.senderFrame.url === require("node:url").pathToFileURL(setup).href
  );
}
function esSitio(event) {
  return (
    event.sender === ventana?.webContents &&
    event.senderFrame === ventana.webContents.mainFrame &&
    origenPagina(event.senderFrame.url, ORIGENES.general)
  );
}
async function guardar() {
  const temporal = archivo + ".tmp";
  await fs.writeFile(temporal, JSON.stringify(config, null, 2), { mode: 0o600 });
  await fs.rename(temporal, archivo);
}
function cerrarAuxiliares() {
  for (const w of auxiliares) if (!w.isDestroyed()) w.destroy();
}
function iniciarAgente() {
  agente?.detener();
  agente = undefined;
  estadoAgente = "Recepción automática desactivada";
  if (!config.tokenAgenteCifrado || (!config.impresora && !config.impresoraWindows) || smoke) return;
  try {
    const token = safeStorage.decryptString(Buffer.from(config.tokenAgenteCifrado, "base64"));
    const version = revision;
    agente = crearAgente({ token,
      imprimir: (bytes, vigente) => enviarLocal(bytes, version, vigente),
      estado: (valor) => { if (version === revision) estadoAgente = valor; },
    });
    agente.terminado.catch(() => { estadoAgente = "No se pudo iniciar la recepción automática"; });
  } catch { estadoAgente = "Vuelve a guardar el token de recepción automática en este usuario de Windows"; }
}
async function enviarLocal(bytes, version, vigente = () => true) {
  return cola(async () => {
    if (version !== revision || !vigente()) throw Error("La configuración cambió o el trabajo venció. Revisa el documento antes de reimprimir.");
    if (config.impresoraWindows) return enviarWindows(config.impresoraWindows, bytes);
    if (!config.impresora) throw Error("Selecciona una impresora de red o usa la impresión de Windows.");
    if (!smoke) await actualizarImpresora();
    if (version !== revision || !vigente()) throw Error("El trabajo venció durante la verificación de la impresora. Vuelve a solicitarlo.");
    try { await transporte.enviar(config.impresora, bytes); }
    catch (e) {
      if (!e.antesDeEnviar) throw Error("No se confirmó el envío. Revisa la tirilla antes de reimprimir para evitar duplicados.");
      const encontrada = await red.localizar(config);
      if (version !== revision || !vigente()) throw Error("El trabajo venció durante la búsqueda. Revisa la impresora y vuelve a solicitarlo.");
      config.impresora = encontrada.ip;
      config.impresoraMac = encontrada.mac;
      await guardar();
      await transporte.enviar(config.impresora, bytes);
    }
  });
}
async function descubrir() {
  if (!buscando)
    buscando = buscar().finally(() => {
      buscando = undefined;
    });
  return buscando;
}
async function mostrarSetup() {
  cerrarAuxiliares();
  await ventana.loadFile(setup);
}
async function sitio() {
  await ventana.loadURL(ORIGENES[config.sitio] + "/pos");
}
ipcMain.handle("powerpos:estado", (event) => {
  if (!esSetup(event) && !esSitio(event)) throw Error("Origen no autorizado");
  if (esSetup(event)) puenteComprobado = true;
  return {
    sitio: "general",
    impresora: config.impresora || "",
    impresoraWindows: config.impresoraWindows || "",
    version: app.getVersion(),
    agenteConfigurado: !!config.tokenAgenteCifrado,
    estadoAgente,
    impresoraMac: config.impresoraMac || "",
    estadoRed,
  };
});
ipcMain.handle("powerpos:configurar", async (event) => {
  if (!esSitio(event)) throw Error("Origen no autorizado");
  await mostrarSetup();
  return true;
});
ipcMain.handle("powerpos:buscar-impresoras", async (event) => {
  if (!esSetup(event)) throw Error("Origen no autorizado");
  return descubrir();
});
ipcMain.handle("powerpos:impresoras-windows", async (event) => {
  if (!esSetup(event)) throw Error("Origen no autorizado");
  return (await ventana.webContents.getPrintersAsync()).map((p) => ({ nombre: p.name, predeterminada: p.isDefault }));
});
async function validarImpresoraWindows(nombre) {
  if (typeof nombre !== "string" || !(await ventana.webContents.getPrintersAsync()).some((p) => p.name === nombre))
    throw Error("Selecciona una impresora instalada en Windows.");
}
ipcMain.handle("powerpos:probar-impresora", async (event, datos) => {
  if (!esSetup(event)) throw Error("Origen no autorizado");
  if (datos?.nombre) await validarImpresoraWindows(datos.nombre);
  else if (!ipPrivada(datos?.ip)) throw Error("Escribe una IP privada válida o selecciona la impresora de Windows.");
  const bytes = Buffer.from("\x1b@PowerPOS " + app.getVersion() + "\nPRUEBA DE IMPRESION\nConexion local de Windows\nSin apertura del cajon\n\n\n\x1dVA\x03", "ascii");
  await cola(() => datos.nombre ? enviarWindows(datos.nombre, bytes) : enviar(datos.ip, bytes));
  return { enviado: true };
});
ipcMain.handle("powerpos:guardar-configuracion", async (event, datos) => {
  if (
    !esSetup(event) ||
    !Object.hasOwn(ORIGENES, datos?.sitio) ||
    (datos?.impresora !== "" && !ipPrivada(datos?.impresora)) ||
    (datos?.tokenAgente && !/^[a-fA-F0-9]{64}$/.test(datos.tokenAgente))
  )
    throw Error("Configura una impresora válida o elige configurarla después. El token debe tener 64 caracteres hexadecimales.");
  const nueva = { sitio: datos.sitio, impresora: datos.impresora };
  if (datos.impresoraWindows) {
    await validarImpresoraWindows(datos.impresoraWindows);
    nueva.impresoraWindows = datos.impresoraWindows;
    nueva.impresora = "";
  }
  if (nueva.impresora) {
    // Guardar confirma explícitamente la selección inicial o el reemplazo físico.
    const identidad = await red.localizar({ impresora: nueva.impresora });
    nueva.impresoraMac = identidad.mac;
  }
  if (!datos.quitarAgente && datos.sitio === config.sitio && config.tokenAgenteCifrado)
    nueva.tokenAgenteCifrado = config.tokenAgenteCifrado;
  if (datos.tokenAgente && !datos.quitarAgente) {
    if (!nueva.impresora && !nueva.impresoraWindows) throw Error("La recepción automática necesita una impresora de red o de Windows.");
    if (!safeStorage.isEncryptionAvailable()) throw Error("Windows no pudo proteger el token. Revisa la sesión de Windows.");
    nueva.tokenAgenteCifrado = safeStorage.encryptString(datos.tokenAgente).toString("base64");
  }
  if (!nueva.impresora && !nueva.impresoraWindows) delete nueva.tokenAgenteCifrado;
  // No cambiar de destino mientras se están enviando bytes.
  await cola(async () => {
    const anterior = config;
    config = nueva;
    try { await guardar(); } catch (e) { config = anterior; throw e; }
    revision++;
    cerrarAuxiliares();
    iniciarAgente();
  });
  void revisionDiaria(true).catch(() => {});
  await sitio();
  return true;
});
ipcMain.handle("powerpos:imprimir", async (event, solicitud) => {
  if (!esSitio(event))
    throw Error("Solo el portal de PowerPOS puede imprimir");
  // La API valida la empresa/sede de la sesión. No hay IDs de clientes
  // incorporados en el instalador ni un catálogo público de empresas.
  const s = validarSolicitud(solicitud);
  const version = revision;
  // Los bytes se obtienen directamente de la API HTTPS fija; el renderer no puede enviar bytes ni elegir hosts.
  const respuesta = await transporte.solicitar("https://api.powerpospioneers.com" + s.ruta, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + s.token,
      "X-PowerPOS-Desktop": "1",
    },
    body: JSON.stringify(s.datos),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) return { status: respuesta.status, data: cuerpo };
  if (
    !cuerpo.preparado ||
    !Array.isArray(cuerpo.trabajos) ||
    !cuerpo.trabajos.length
  )
    return { status: respuesta.status, data: cuerpo };
  if (cuerpo.trabajos.length > 4)
    throw Error("Respuesta de impresión inesperada");
  const trabajos = cuerpo.trabajos.map(bytesTrabajo);
  const { trabajos: omitidos, ...resultado } = cuerpo;
  try {
    await enviarLocal(Buffer.concat(trabajos), version);
    return {
      status: respuesta.status,
      data: {
        ...resultado,
        preparado: false,
        modo: "escritorio",
        impreso: !s.ruta.endsWith("abrir-cajon"),
        abierto: s.ruta.endsWith("abrir-cajon"),
        cajonEnviado: !!cuerpo.cajonEnviado,
      },
    };
  } catch (e) {
    return {
      status: respuesta.status,
      data: {
        ...resultado,
        preparado: false,
        impreso: false,
        abierto: false,
        modo: "escritorio",
        fallbackBrowser: !config.impresora && !config.impresoraWindows && !s.ruta.endsWith("abrir-cajon"),
        motivo: e.message,
      },
    };
  }
});
app.on("web-contents-created", (_event, contenido) => {
  contenido.on("will-attach-webview", (event) => event.preventDefault());
  contenido.setWindowOpenHandler(({ url }) => {
    if (contenido !== ventana?.webContents || !esOrigenActual(contenido.getURL())) return { action: "deny" };
    const tipo = tipoVentana(url, contenido.getURL());
    if (["recibo", "pantalla", "interna"].includes(tipo) && auxiliares.size < 6) return {
      action: "allow", overrideBrowserWindowOptions: {
        show: !smoke, autoHideMenuBar: true, title: "PowerPOS",
        webPreferences: { preload: undefined, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false },
      },
    };
    if (tipo === "externa") abrirExterno(url);
    return { action: "deny" };
  });
  contenido.on("did-create-window", (w) => {
    auxiliares.add(w);
    w.on("closed", () => auxiliares.delete(w));
    // Las pantallas secundarias no reciben el puente de impresión/configuración.
  });
  const controlarNavegacion = (event, url) => {
    if (!navegacionPermitida(url, config.sitio)) {
      event.preventDefault();
      if (contenido === ventana?.webContents && esOrigenActual(contenido.getURL()) && tipoVentana(url, contenido.getURL()) === "externa") abrirExterno(url);
      return;
    }
    if (contenido === ventana?.webContents && new URL(url).pathname === "/login") cerrarAuxiliares();
  };
  contenido.on("will-navigate", (event, url) => {
    controlarNavegacion(event, url);
  });
  contenido.on("will-redirect", (event, url) => {
    controlarNavegacion(event, url);
  });
});
function esOrigenActual(url) {
  return origenPagina(url, ORIGENES.general);
}
if (!app.requestSingleInstanceLock() && !smoke) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      archivo = path.join(
        app.getPath("userData"),
        "configuracion-impresora.json",
      );
      try {
        const c = migrarConfiguracion(JSON.parse(await fs.readFile(archivo, "utf8")));
        if (c)
          config = { sitio: c.sitio, impresora: c.impresora,
            ...(normalizarMac(c.impresoraMac) ? { impresoraMac: normalizarMac(c.impresoraMac) } : {}),
            ...(typeof c.impresoraWindows === "string" && c.impresoraWindows.length <= 256 && !/[\x00-\x1f]/.test(c.impresoraWindows) ? { impresoraWindows: c.impresoraWindows } : {}),
            ...(typeof c.tokenAgenteCifrado === "string" && c.tokenAgenteCifrado.length < 8192 ? { tokenAgenteCifrado: c.tokenAgenteCifrado } : {}) };
      } catch {}
      ventana = new BrowserWindow({
        width: 1440,
        height: 1000,
        minWidth: 1024,
        minHeight: 700,
        show: !smoke,
        title: "PowerPOS",
        icon: path.join(__dirname, "logo.png"),
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });
      ventana.webContents.session.setPermissionRequestHandler(
        (_c, _p, callback) => callback(false),
      );
      ventana.webContents.session.setPermissionCheckHandler(() => false);
      ventana.webContents.session.on("will-download", (_e, item) => {
        item.setSaveDialogOptions({ title: "Guardar archivo de PowerPOS", defaultPath: path.join(app.getPath("downloads"), path.basename(item.getFilename())) });
      });
      ventana.on("closed", cerrarAuxiliares);
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Archivo",
            submenu: [
              { label: "Configurar impresora", click: mostrarSetup },
              {
                label: "Volver al POS",
                click: () => (config.sitio ? sitio() : mostrarSetup()),
              },
              { type: "separator" },
              { label: "Acerca de PowerPOS", click: () => dialog.showMessageBox(ventana, {
                type: "info", title: "PowerPOS", message: "PowerPOS " + app.getVersion(),
                detail: "Sistema conectado a Hostinger.\n" + estadoAgente + "\nImpresora: " + (config.impresoraWindows || config.impresora || "Ventana de impresión manual") + "\n" + estadoRed,
              }) },
              { role: "quit", label: "Salir" },
            ],
          },
          {
            label: "Ver",
            submenu: [
              { role: "reload", label: "Actualizar" },
              { role: "togglefullscreen", label: "Pantalla completa" },
              { role: "resetzoom", label: "Tamaño normal" },
              { role: "zoomin", label: "Ampliar" },
              { role: "zoomout", label: "Reducir" },
            ],
          },
        ]),
      );
      app.on("second-instance", () => {
        if (ventana.isMinimized()) ventana.restore();
        ventana.focus();
      });
      ventana.webContents.on(
        "did-fail-load",
        (_e, codigo, _descripcion, url) => {
          if (codigo !== -3 && url.startsWith("https:") && !smoke)
            dialog.showMessageBox(ventana, {
              type: "warning",
              title: "PowerPOS",
              message:
                "No se pudo cargar el sistema. Comprueba internet y usa Ver → Actualizar para volver a intentar.",
            });
        },
      );
      if (smoke) {
        await mostrarSetup();
        for (let i = 0; i < 40 && !puenteComprobado; i++)
          await new Promise((r) => setTimeout(r, 50));
        if (!puenteComprobado) throw Error("El puente seguro no respondió");
        await fs.mkdir(salidaSmoke, { recursive: true });
        config = { sitio: "general", impresora: "192.168.1.200" };
        const integracion = await require("./smoke.cjs").comprobar({ ventana, auxiliares, salida: salidaSmoke, transporte, enlaces });
        if (process.env.POWERPOS_SMOKE_CAPTURE !== "0") {
        const imagen = await ventana.webContents.capturePage();
        await fs.writeFile(
          path.join(salidaSmoke, "comprobacion-escritorio.png"),
          imagen.toPNG(),
        );
        }
        await fs.writeFile(
          path.join(salidaSmoke, "comprobacion-escritorio.json"),
          JSON.stringify({
            arranque: true,
            puenteSeguro: puenteComprobado,
            sandbox: ventana.webContents.getLastWebPreferences().sandbox,
            contextIsolation:
              ventana.webContents.getLastWebPreferences().contextIsolation,
            nodeIntegration:
              ventana.webContents.getLastWebPreferences().nodeIntegration,
            version: app.getVersion(),
            integracion,
          }),
        );
        app.quit();
      } else if (config.sitio) {
        void revisionDiaria(true).catch(() => {});
        iniciarAgente(); await sitio();
      }
      else await mostrarSetup();
      if (!smoke) {
        relojRed = setInterval(() => { void revisionDiaria().catch(() => {}); }, 60000);
        relojRed.unref();
        powerMonitor.on("resume", () => { void revisionDiaria(true).catch(() => {}); });
      }
    })
    .catch(async (error) => {
      if (smoke) {
        await fs.mkdir(salidaSmoke, { recursive: true });
        await fs.writeFile(
          path.join(salidaSmoke, "error-smoke.txt"),
          String(error.stack || error.message),
        );
        app.exit(1);
      } else {
        dialog.showErrorBox(
          "PowerPOS",
          "No se pudo iniciar la aplicación. Revisa los permisos de tu usuario de Windows.",
        );
        app.quit();
      }
    });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { agente?.detener(); clearInterval(relojRed); });
