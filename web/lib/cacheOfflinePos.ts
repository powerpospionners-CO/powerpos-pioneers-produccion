// Respaldo local del catálogo de productos y la caja abierta, para que el
// POS pueda seguir vendiendo si el computador se reinicia durante un corte
// de internet largo (ej. un apagón de horas o días) y al abrir la página
// no logra volver a cargar esos datos del servidor. Se actualiza solo cada
// vez que sí hay conexión — nunca se usa si el dato fresco está disponible,
// así que los precios/existencias quedan tan al día como la última vez que
// hubo señal.
const claveCatalogo = (empresaId: number, sucursalId: number) => `pos-catalogo-offline:${empresaId}:${sucursalId}`;
const claveCaja = (empresaId: number, sucursalId: number) => `pos-caja-offline:${empresaId}:${sucursalId}`;

export function guardarCatalogoOffline(empresaId: number, sucursalId: number, productos: unknown[]) {
  try { window.localStorage.setItem(claveCatalogo(empresaId, sucursalId), JSON.stringify(productos)); } catch { /* sin almacenamiento disponible, no es crítico */ }
}

export function leerCatalogoOffline<T = any>(empresaId: number, sucursalId: number): T[] | null {
  try {
    const crudo = window.localStorage.getItem(claveCatalogo(empresaId, sucursalId));
    return crudo ? JSON.parse(crudo) : null;
  } catch { return null; }
}

export function guardarCajaOffline(empresaId: number, sucursalId: number, caja: unknown | null) {
  try {
    if (caja) window.localStorage.setItem(claveCaja(empresaId, sucursalId), JSON.stringify(caja));
    else window.localStorage.removeItem(claveCaja(empresaId, sucursalId));
  } catch { /* no es crítico */ }
}

export function leerCajaOffline<T = any>(empresaId: number, sucursalId: number): T | null {
  try {
    const crudo = window.localStorage.getItem(claveCaja(empresaId, sucursalId));
    return crudo ? JSON.parse(crudo) : null;
  } catch { return null; }
}
