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
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

function escribir<T>(clave: string, valor: T[]) {
  try { window.localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* almacenamiento no disponible, se pierde el respaldo pero no rompe la venta actual */ }
}

export function generarClaveVenta(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `venta-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function encolarVentaPendiente(empresaId: number, sucursalId: number, clave: string, payload: any) {
  const clavePendiente = clavePendientes(empresaId, sucursalId);
  const actuales = leer<VentaPendiente>(clavePendiente);
  escribir(clavePendiente, [...actuales, { clave, payload, creadoEn: Date.now(), intentos: 0 }]);
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
export async function sincronizarVentasPendientes(
  empresaId: number, sucursalId: number,
  onVentaSincronizada?: (clave: string, resultado: any) => void,
): Promise<{ sincronizadas: number; fallidas: number }> {
  const clavePendiente = clavePendientes(empresaId, sucursalId);
  const claveFallida = claveFallidas(empresaId, sucursalId);
  const pendientes = leer<VentaPendiente>(clavePendiente);
  if (!pendientes.length) return { sincronizadas: 0, fallidas: 0 };

  let sincronizadas = 0;
  let fallidas = 0;
  const restantes: VentaPendiente[] = [];
  const nuevasFallidas: VentaFallida[] = [];

  for (const venta of pendientes) {
    try {
      const { data } = await api.post('/pedidos', venta.payload);
      sincronizadas++;
      onVentaSincronizada?.(venta.clave, data);
    } catch (e: any) {
      if (!e?.response) {
        // Sin respuesta del servidor: seguimos sin conexión real. Se deja
        // esta y todas las que faltan tal como están, para el próximo intento.
        restantes.push(venta, ...pendientes.slice(pendientes.indexOf(venta) + 1));
        break;
      }
      fallidas++;
      nuevasFallidas.push({ clave: venta.clave, payload: venta.payload, motivo: e.response?.data?.message || 'La venta fue rechazada al sincronizar', creadoEn: venta.creadoEn });
    }
  }

  escribir(clavePendiente, restantes);
  if (nuevasFallidas.length) escribir(claveFallida, [...leer<VentaFallida>(claveFallida), ...nuevasFallidas]);
  return { sincronizadas, fallidas };
}
