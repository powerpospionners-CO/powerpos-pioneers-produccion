'use client';

import { useEffect, useState } from 'react';
import { Ban, Pencil, Receipt } from 'lucide-react';
import api from '@/lib/api';
import ModalCobro, { PagoConfirmado } from './ModalCobro';

const moneda = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

type Venta = {
  id: number; numero: string; total: string; metodoPago: string; estado: string; creadoEn: string;
  pagos?: { metodoPago: string; monto: string }[];
};

export default function VentasTurno({ cajaId, sucursalId, puedeGestionar }: { cajaId: number | null; sucursalId?: number; puedeGestionar: boolean }) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [ventaEditar, setVentaEditar] = useState<Venta | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      const { data } = await api.get('/pedidos', { params: sucursalId ? { sucursalId } : undefined });
      setVentas(cajaId ? data.filter((v: any) => v.cajaId === cajaId) : []);
    } catch { /* silencioso: panel informativo */ }
  };

  useEffect(() => { if (abierto) void cargar(); }, [abierto, cajaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const anular = async (venta: Venta) => {
    if (!window.confirm(`¿Anular la venta ${venta.numero} por ${moneda(Number(venta.total))}? Esto repone existencias y elimina sus movimientos financieros.`)) return;
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
                  {puedeGestionar && v.estado !== 'ANULADO' && (
                    <td className="py-2 text-right">
                      <button type="button" title="Editar medio de pago" onClick={() => setVentaEditar(v)} className="mr-2 text-gray-500 hover:text-orange-400"><Pencil size={13} /></button>
                      <button type="button" title="Anular venta" onClick={() => anular(v)} className="text-gray-500 hover:text-red-400"><Ban size={13} /></button>
                    </td>
                  )}
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
    </div>
  );
}
