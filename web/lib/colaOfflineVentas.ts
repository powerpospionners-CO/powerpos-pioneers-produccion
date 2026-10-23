// Cola de ventas del POS cuando se corta la conexión. No pretende cubrir
// días completos sin internet (para eso haría falta espejar todo el
// inventario localmente) — cubre el caso real y frecuente: wifi malo o un
// corte de unos minutos. Mientras tanto la venta se guarda en el
// dispositivo y se reintenta sola al volver la señal, usando una clave de
// idempotencia para que un reintento nunca duplique una venta que en
// realidad sí había llegado al servidor.
import api from './api';

type VentaPendiente = { clave: string; payload: any; creadoEn: number; intentos: number };
type VentaFallida = { clave: string; payload: any; motivo: string; creadoEn: number };

const clavePendientes = (empresaId: number, sucursalId: number) => `pos-cola-offline:${empresaId}:${sucursalId}`;
const claveFallidas = (empresaId: number, sucursalId: number) => `pos-cola-fallidas:${empresaId}:${sucursalId}`;

function leer<T>(clave: string): T[] {
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos) || datos.some(venta => !venta || typeof venta !== 'object' || typeof venta.clave !== 'string' || !venta.payload || typeof venta.payload !== 'object' || Array.isArray(venta.payload))) {
      throw new Error('Formato de cola inválido');
    }
    return datos as T[];
  } catch {
    // Conservar el original: nunca reemplazar ventas ilegibles por una cola vacía.
    throw new Error('No se puede leer el respaldo de ventas de este equipo. Conserva los datos del navegador y solicita recuperar la cola antes de continuar.');
  }
}

function escribir<T>(clave: string, valor: T[]) {
  // El cajero solo puede dar por respaldada una venta si se pudo guardar.
  window.localStorage.setItem(clave, JSON.stringify(valor));
}

export function generarClaveVenta(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `venta-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function encolarVentaPendiente(empresaId: number, sucursalId: number, clave: string, payload: any) {
  const clavePendiente = clavePendientes(empresaId, sucursalId);
  const actuales = leer<VentaPendiente>(clavePendiente);
  if (!actuales.some((venta) => venta.clave === clave)) escribir(clavePendiente, [...actuales, { clave, payload: { ...payload, claveIdempotencia: clave }, creadoEn: Date.now(), intentos: 0 }]);
}

export function listarVentasPendientes(empresaId: number, sucursalId: number): VentaPendiente[] {
  return leer<VentaPendiente>(clavePendientes(empresaId, sucursalId));
}

export function listarVentasFallidas(empresaId: number, sucursalId: number): VentaFallida[] {
  return leer<VentaFallida>(claveFallidas(empresaId, sucursalId));
}

export function quitarVentaFallida(empresaId: number, sucursalId: number, clave: string) {
  const k = claveFallidas(empresaId, sucursalId);
  escribir(k, leer<VentaFallida>(k).filter((v) => v.clave !== clave));
}

// Intenta enviar cada venta pendiente, en orden. Si una falla por falta de
// conexión (sin respuesta del servidor), se detiene ahí — no tiene caso
// seguir intentando las demás si claramente seguimos sin señal. Si falla
// porque el servidor la rechazó de verdad (ej. ya no hay existencias), se
// saca de la cola y se guarda como fallida para que el admin la revise a
// mano, en vez de reintentarla para siempre.
async function sincronizar(
  empresaId: number, sucursalId: number,
  onVentaSincronizada?: (clave: string, resultado: any) => void,
): Promise<{ sincronizadas: number; fallidas: number }> {
  const clavePendiente = clavePendientes(empresaId, sucursalId);
  const claveFallida = claveFallidas(empresaId, sucursalId);
  const pendientes = leer<VentaPendiente>(clavePendiente);
  if (!pendientes.length) return { sincronizadas: 0, fallidas: 0 };

  let sincronizadas = 0;
  let fallidas = 0;
  const nuevasFallidas: VentaFallida[] = [];
  const procesadas = new Set<string>();

  for (const venta of pendientes) {
    try {
      const { data } = await api.post('/pedidos', { ...venta.payload, claveIdempotencia: venta.clave });
      sincronizadas++;
      procesadas.add(venta.clave);
      try { onVentaSincronizada?.(venta.clave, data); } catch { /* el documento ya se confirmó */ }
    } catch (e: any) {
      if (!e?.response || [401, 403, 408, 409, 425, 429].includes(e.response.status) || e.response.status >= 500) {
        // Sin respuesta del servidor: seguimos sin conexión real. Se deja
        // esta y todas las que faltan tal como están, para el próximo intento.
        break;
      }
      fallidas++;
      procesadas.add(venta.clave);
      nuevasFallidas.push({ clave: venta.clave, payload: venta.payload, motivo: e.response?.data?.message || 'La venta fue rechazada al sincronizar', creadoEn: venta.creadoEn });
    }
  }

  // Guardar rechazos antes de retirarlos de la cola. Volver a leer conserva
  // las ventas agregadas mientras esperábamos las respuestas de la API.
  if (nuevasFallidas.length) {
    const anteriores = leer<VentaFallida>(claveFallida);
    escribir(claveFallida, [...anteriores, ...nuevasFallidas.filter((venta) => !anteriores.some((anterior) => anterior.clave === venta.clave))]);
  }
  escribir(clavePendiente, leer<VentaPendiente>(clavePendiente).filter((venta) => !procesadas.has(venta.clave)));
  return { sincronizadas, fallidas };
}

const sincronizaciones = new Map<string, Promise<{ sincronizadas: number; fallidas: number }>>();

export function sincronizarVentasPendientes(
  empresaId: number, sucursalId: number,
  onVentaSincronizada?: (clave: string, resultado: any) => void,
): Promise<{ sincronizadas: number; fallidas: number }> {
  const clave = clavePendientes(empresaId, sucursalId);
  const actual = sincronizaciones.get(clave);
  if (actual) return actual;
  const ejecutar = () => sincronizar(empresaId, sucursalId, onVentaSincronizada);
  const tarea = Promise.resolve().then(async () => typeof navigator !== 'undefined' && navigator.locks
    ? await navigator.locks.request(clave, ejecutar) : await ejecutar())
    .finally(() => sincronizaciones.delete(clave));
  sincronizaciones.set(clave, tarea);
  return tarea;
}
