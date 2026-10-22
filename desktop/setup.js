"use strict";
const sitio = document.getElementById("sitio"),
  impresora = document.getElementById("impresora"),
  estado = document.getElementById("estado"),
  boton = document.getElementById("buscar");
window.powerposDesktop
  .estado()
  .then((c) => {
    sitio.value = c.sitio;
    impresora.value = c.impresora;
  })
  .catch(() => {
    estado.textContent = "No se pudo leer la configuración.";
  });
boton.addEventListener("click", async () => {
  boton.disabled = true;
  estado.textContent = "Buscando en la red local…";
  try {
    const ips = await window.powerposDesktop.buscarImpresoras();
    document.getElementById("impresoras").replaceChildren(
      ...ips.map((ip) => {
        const o = document.createElement("option");
        o.value = ip;
        return o;
      }),
    );
    if (ips.length === 1) {
      impresora.value = ips[0];
      estado.textContent =
        "Se encontró una impresora. Confirma la empresa y guarda.";
    } else
      estado.textContent = ips.length
        ? "Se encontraron varias impresoras: " +
          ips.join(", ") +
          ". Selecciona la IP de esta caja."
        : "No se encontró una impresora. Revisa el cable y que esté encendida.";
  } catch {
    estado.textContent = "No se pudo revisar la red local.";
  } finally {
    boton.disabled = false;
  }
});
document.getElementById("configurar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const b = document.getElementById("guardar");
  b.disabled = true;
  try {
    await window.powerposDesktop.guardarConfiguracion({
      sitio: sitio.value,
      impresora: impresora.value.trim(),
    });
  } catch {
    estado.textContent =
      "Escribe una IP privada válida y selecciona la empresa.";
    b.disabled = false;
  }
});
