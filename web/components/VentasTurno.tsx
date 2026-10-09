'use client';

import { useNotificar } from '@/components/Notificaciones';
import { useEffect, useState } from 'react';
import { Ban, List, Pencil, Receipt, X } from 'lucide-react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import ModalCobro, { PagoConfirmado } from './ModalCobro';

type Venta = {
  id: number; numero: string; total: string; metodoPago: string; estado: string; creadoEn: string;
  pagos?: { metodoPago: string; monto: string }[];
};
type DetalleVenta = {
  numero: string;
  detalles: {
    id: number;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
    presentacionNombre: string | null;
    producto: { nombre: string };
    adicionales: { nombre: string; precio: string; cantidad: number; subtotal: string }[];
  }[];
};

export default function VentasTurno({ cajaId, sucursalId, puedeGestionar }: { cajaId: number | null; sucursalId?: number; puedeGestionar: boolean }) {
  const { aviso, confirmar } = useNotificar();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [ventaEditar, setVentaEditar] = useState<Venta | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [ventaDetalle, setVentaDetalle] = useState<DetalleVenta | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const verProductos = async (venta: Venta) => {
    setCargandoDetalle(true);
    try {
      const { data } = await api.get(`/pedidos/${venta.id}`);
      setVentaDetalle(data);
    } catch {
      aviso('No se pudo cargar el detalle de esa venta.', 'error');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const cargar = async () => {
    if (!cajaId) { setVentas([]); return; }
    try {
      const { data } = await api.get('/pedidos', { params: { cajaId, ...(sucursalId ? { sucursalId } : {}) } });
      setVentas(data);
    } catch { /* silencioso: panel informativo */ }
  };

  useEffect(() => { if (abierto) void cargar(); }, [abierto, cajaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const anular = async (venta: Venta) => {
    if (!(await confirmar(`Se va a anular la venta ${venta.numero} por ${moneda(Number(venta.total))}. Se devuelven las existencias y se eliminan sus movimientos financieros.`, { titulo: 'Anular venta', textoConfirmar: 'Sí, anular', peligroso: true }))) return;
    setError('');
    try {
      await api.patch(`/pedidos/${venta.id}/estado`, { estado: 'ANULADO' });
      await cargar();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo anular la venta.');
    }
  };

  const confirmarEdicion = async (pago: PagoConfirmado) => {
    if (!ventaEditar) return;
    setProcesando(true); setError('');
    try {
      await api.patch(`/pedidos/${ventaEditar.id}/pago`, pago);
      setVentaEditar(null);
      await cargar();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo actualizar el pago.');
    } finally { setProcesando(false); }
  };

  if (!cajaId) return null;

  return (
    <div className="border-t border-gray-800 bg-gray-900/60">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white">
        <Receipt size={15} /> Ventas de este turno {abierto ? '▲' : '▼'}
      </button>
      {abierto && (
        <div className="max-h-64 overflow-y-auto px-4 pb-3">
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          {!ventas.length && <p className="py-3 text-center text-sm text-gray-500">Aún no hay ventas en este turno.</p>}
          <table className="w-full text-left text-xs">
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id} className={`border-b border-gray-800 ${v.estado === 'ANULADO' ? 'opacity-40' : ''}`}>
                  <td className="py-2 pr-2 text-gray-300">{v.numero}</td>
                  <td className="py-2 pr-2 text-gray-500">{new Date(v.creadoEn).toLocaleTimeString('es-CO')}</td>
                  <td className="py-2 pr-2 text-gray-400">{v.estado === 'ANULADO' ? 'ANULADO' : v.metodoPago}</td>
                  <td className="py-2 pr-2 text-right font-semibold text-white">{moneda(Number(v.total))}</td>
                  <td className="py-2 text-right">
                    <button type="button" title="Ver productos" onClick={() => verProductos(v)} className="mr-2 text-gray-500 hover:text-blue-400"><List size={13} /></button>
                    {puedeGestionar && v.estado !== 'ANULADO' && (
                      <>
                        <button type="button" title="Editar medio de pago" onClick={() => setVentaEditar(v)} className="mr-2 text-gray-500 hover:text-orange-400"><Pencil size={13} /></button>
                        <button type="button" title="Anular venta" onClick={() => anular(v)} className="text-gray-500 hover:text-red-400"><Ban size={13} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ventaEditar && (
        <ModalCobro
          total={Number(ventaEditar.total)}
          procesando={procesando}
          titulo={`Editar pago · ${ventaEditar.numero}`}
          textoConfirmar="Guardar pago"
          metodoInicial={ventaEditar.metodoPago}
          pagosIniciales={ventaEditar.pagos}
          onConfirmar={confirmarEdicion}
          onCancelar={() => setVentaEditar(null)}
        />
      )}

      {(ventaDetalle || cargandoDetalle) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Productos de la venta {ventaDetalle?.numero || ''}</h3>
              <button type="button" onClick={() => setVentaDetalle(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {cargandoDetalle && <p className="py-10 text-center text-gray-500">Cargando…</p>}
            {ventaDetalle && !cargandoDetalle && (
              <div className="space-y-2">
                {ventaDetalle.detalles.map((d) => (
                  <div key={d.id} className="rounded-lg border border-gray-800 p-3 text-sm">
                    <div className="flex justify-between text-gray-200">
                      <span>{d.cantidad}x {d.producto.nombre}{d.presentacionNombre ? ` — ${d.presentacionNombre}` : ''}</span>
                      <strong className="text-white">{moneda(Number(d.subtotal))}</strong>
                    </div>
                    <p className="text-xs text-gray-500">{moneda(Number(d.precioUnitario))} c/u</p>
                    {d.adicionales.length > 0 && (
                      <div className="mt-1 space-y-0.5 border-t border-gray-800 pt-1">
                        {d.adicionales.map((a, i) => (
                          <div key={i} className="flex justify-between text-xs text-gray-400">
                            <span>+ {a.cantidad}x {a.nombre}</span>
                            <span>{moneda(Number(a.subtotal))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {!ventaDetalle.detalles.length && <p className="py-6 text-center text-gray-500">Esta venta no tiene productos.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
