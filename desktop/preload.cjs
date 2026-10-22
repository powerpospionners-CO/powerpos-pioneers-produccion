const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "powerposDesktop",
  Object.freeze({
    version: "1.0.0",
    imprimir: (solicitud) => ipcRenderer.invoke("powerpos:imprimir", solicitud),
    configurar: () => ipcRenderer.invoke("powerpos:configurar"),
    estado: () => ipcRenderer.invoke("powerpos:estado"),
    guardarConfiguracion: (datos) =>
      ipcRenderer.invoke("powerpos:guardar-configuracion", datos),
    buscarImpresoras: () => ipcRenderer.invoke("powerpos:buscar-impresoras"),
  }),
);
