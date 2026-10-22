const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const fs = require("node:fs/promises"),
  path = require("node:path");
const {
  ORIGENES,
  ipPrivada,
  validarSolicitud,
  origenPagina,
} = require("./seguridad.cjs");
const { buscar, enviar, crearCola } = require("./impresora.cjs");
let ventana,
  config = {},
  archivo,
  buscando,
  puenteComprobado = false;
const cola = crearCola(),
  smoke = process.argv.includes("--smoke-test");
const salidaSmoke =
  process.env.POWERPOS_SMOKE_DIR || path.join(__dirname, "dist");
if (smoke) app.disableHardwareAcceleration();
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
    origenPagina(event.senderFrame.url, ORIGENES[config.sitio])
  );
}
async function guardar() {
  await fs.writeFile(archivo, JSON.stringify(config, null, 2), { mode: 0o600 });
}
async function descubrir() {
  if (!buscando)
    buscando = buscar().finally(() => {
      buscando = undefined;
    });
  return buscando;
}
async function mostrarSetup() {
  await ventana.loadFile(setup);
}
async function sitio() {
  await ventana.loadURL(ORIGENES[config.sitio] + "/pos");
}
ipcMain.handle("powerpos:estado", (event) => {
  if (!esSetup(event) && !esSitio(event)) throw Error("Origen no autorizado");
  if (esSetup(event)) puenteComprobado = true;
  return {
    sitio: config.sitio || "trailer",
    impresora: config.impresora || "",
    version: app.getVersion(),
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
ipcMain.handle("powerpos:guardar-configuracion", async (event, datos) => {
  if (
    !esSetup(event) ||
    !Object.hasOwn(ORIGENES, datos?.sitio) ||
    !ipPrivada(datos?.impresora)
  )
    throw Error("Selecciona empresa e impresora de red válidas");
  config = { sitio: datos.sitio, impresora: datos.impresora };
  await guardar();
  await sitio();
  return true;
});
ipcMain.handle("powerpos:imprimir", async (event, solicitud) => {
  if (!esSitio(event))
    throw Error("Solo el POS de la empresa seleccionada puede imprimir");
  const s = validarSolicitud(
    solicitud,
    config.sitio === "trailer" ? 1 : config.sitio === "enchila" ? 2 : undefined,
  );
  // Los bytes se obtienen directamente de la API HTTPS fija; el renderer no puede enviar bytes ni elegir hosts.
  const respuesta = await fetch("https://api.powerpospioneers.com" + s.ruta, {
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
  const trabajos = cuerpo.trabajos.map((t) => {
    if (
      !["TICKET", "COMANDA", "CAJON", "CIERRE"].includes(t.tipo) ||
      typeof t.datosBase64 !== "string" ||
      t.datosBase64.length > 14 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(t.datosBase64)
    )
      throw Error("Trabajo de impresión no válido");
    return Buffer.from(t.datosBase64, "base64");
  });
  const { trabajos: omitidos, ...resultado } = cuerpo;
  try {
    await cola(async () => {
      const bytes = Buffer.concat(trabajos);
      try {
        await enviar(config.impresora, bytes);
      } catch (e) {
        if (!e.antesDeEnviar)
          throw Error(
            "No se confirmó el envío. Revisa la tirilla antes de reimprimir para evitar duplicados.",
          );
        const ips = await descubrir();
        if (ips.length !== 1)
          throw Error(
            ips.length
              ? "Hay varias impresoras. Selecciona la correcta en Archivo → Configurar impresora."
              : "No se encontró la impresora. Revisa que esté encendida y en la misma red.",
          );
        config.impresora = ips[0];
        await guardar();
        await enviar(config.impresora, bytes);
      }
    });
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
        fallbackBrowser: false,
        motivo: e.message,
      },
    };
  }
});
app.on("web-contents-created", (_event, contenido) => {
  contenido.on("will-attach-webview", (event) => event.preventDefault());
  contenido.setWindowOpenHandler(() => ({ action: "deny" }));
  contenido.on("will-navigate", (event, url) => {
    if (!origenPagina(url, ORIGENES[config.sitio])) event.preventDefault();
  });
  contenido.on("will-redirect", (event, url) => {
    if (!origenPagina(url, ORIGENES[config.sitio])) event.preventDefault();
  });
});
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
        const c = JSON.parse(await fs.readFile(archivo, "utf8"));
        if (Object.hasOwn(ORIGENES, c.sitio) && ipPrivada(c.impresora))
          config = c;
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
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Archivo",
            submenu: [
              { label: "Configurar empresa e impresora", click: mostrarSetup },
              {
                label: "Volver al POS",
                click: () => (config.sitio ? sitio() : mostrarSetup()),
              },
              { type: "separator" },
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
        const imagen = await ventana.webContents.capturePage();
        await fs.writeFile(
          path.join(salidaSmoke, "comprobacion-escritorio.png"),
          imagen.toPNG(),
        );
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
          }),
        );
        app.quit();
      } else if (config.sitio) await sitio();
      else await mostrarSetup();
    })
    .catch(async (error) => {
      if (smoke) {
        await fs.mkdir(salidaSmoke, { recursive: true });
        await fs.writeFile(
          path.join(salidaSmoke, "error-smoke.txt"),
          String(error.message),
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
