'use client';

import { useEffect, useState } from 'react';
import { Wallet, X } from 'lucide-react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { moneda } from '@/lib/formato';
import { useNotificar } from '@/components/Notificaciones';

type CajaCerrada = {
  id: number;
  abiertaEn: string;
  cerradaEn: string | null;
  montoInicial: string;
  montoFinal: string | null;
  diferencia: string | null;
  usuario?: { nombre: string };
  sucursal?: { nombre: string };
};

type Resumen = {
  id: number;
  estado: string;
  cajeroNombre: string;
  sucursalNombre: string;
  abiertaEn: string;
  cerradaEn: string | null;
  montoInicial: number;
  montoFinal: number | null;
  montoEsperado: number;
  diferencia: number | null;
  totalVentas: number;
  cantidadVentas: number;
  ventasPorMetodoPago: { metodo: string; total: number }[];
  productosVendidos: { nombre: string; cantidad: number; total: number }[];
};

const ETIQUETAS_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata', MIXTO: 'Mixto',
};

export default function CajaHistorialPage() {
  const { aviso } = useNotificar();
  const [cajas, setCajas] = useState<CajaCerrada[]>([]);
  const [reimprimiendo, setReimprimiendo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [montoCorregido, setMontoCorregido] = useState('');
  const [motivoCorreccion, setMotivoCorreccion] = useState('');
  const [enviandoCorreccion, setEnviandoCorreccion] = useState(false);
  const [errorCorreccion, setErrorCorreccion] = useState('');

  useEffect(() => {
    cargarHistorial();
  }, []);

  const cargarHistorial = () => {
    api.get('/caja/historial')
      .then((r) => setCajas(r.data))
      .catch(() => setError('No se pudo cargar el historial de cajas.'))
      .finally(() => setLoading(false));
  };

  const verDetalle = async (id: number) => {
    setCargandoResumen(true); setError(''); setCorrigiendo(false);
    try {
      const { data } = await api.get(`/caja/${id}/resumen`);
      setResumen(data);
    } catch {
      setError('No se pudo cargar el detalle de esa caja.');
    } finally { setCargandoResumen(false); }
  };

  const reimprimirCierre = async () => {
    if (!resumen) return;
    setReimprimiendo(true);
    try {
      const { data } = await api.post(`/caja/${resumen.id}/reimprimir-cierre`);
      aviso(data.impreso ? 'Se mandó la colilla a la impresora de nuevo.' : `No se pudo imprimir: ${data.motivo || 'revisa que el agente de impresión esté conectado'}.`, data.impreso ? 'exito' : 'error');
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo reimprimir el cierre.', 'error');
    } finally {
      setReimprimiendo(false);
    }
  };

  const abrirCorreccion = () => {
    if (!resumen) return;
    setMontoCorregido(resumen.montoFinal !== null ? String(resumen.montoFinal) : '');
    setMotivoCorreccion('');
    setErrorCorreccion('');
    setCorrigiendo(true);
  };

  const enviarCorreccion = async () => {
    if (!resumen) return;
    setEnviandoCorreccion(true); setErrorCorreccion('');
    try {
      await api.patch(`/caja/${resumen.id}/corregir`, { montoFinal: Number(montoCorregido), motivo: motivoCorreccion });
      const { data } = await api.get(`/caja/${resumen.id}/resumen`);
      setResumen(data);
      setCorrigiendo(false);
      cargarHistorial();
    } catch (e: any) {
      setErrorCorreccion(e?.response?.data?.message || 'No se pudo guardar la corrección.');
    } finally { setEnviandoCorreccion(false); }
  };

  return (
    <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex items-center gap-2">
          <Wallet className="text-orange-500" size={22} />
          <div>
            <h1 className="text-2xl font-bold">Historial de caja</h1>
            <p className="text-sm text-gray-400">Cada cierre de turno, con lo que se vendió y en qué medios de pago.</p>
          </div>
        </div>

        {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}

        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-800 text-gray-400">
              <tr>
                <th className="px-4 py-3">Cerrada</th>
                <th className="px-4 py-3">Cajero</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3 text-right">Base inicial</th>
                <th className="px-4 py-3 text-right">Contado</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cajas.map((c) => (
                <tr key={c.id} className="border-b border-gray-800 last:border-0">
                  <td className="px-4 py-3 text-gray-300">{c.cerradaEn ? new Date(c.cerradaEn).toLocaleString('es-CO') : '—'}</td>
                  <td className="px-4 py-3">{c.usuario?.nombre || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{c.sucursal?.nombre || '—'}</td>
                  <td className="px-4 py-3 text-right">{moneda(Number(c.montoInicial))}</td>
                  <td className="px-4 py-3 text-right">{c.montoFinal !== null ? moneda(Number(c.montoFinal)) : '—'}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${c.diferencia && Math.abs(Number(c.diferencia)) > 1000 ? 'text-red-400' : 'text-gray-300'}`}>{c.diferencia !== null ? moneda(Number(c.diferencia)) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => verDetalle(c.id)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-orange-500 hover:text-white">Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !cajas.length && <p className="py-10 text-center text-gray-500">Aún no hay cierres de caja registrados.</p>}
          {loading && <p className="py-10 text-center text-gray-500">Cargando…</p>}
        </div>
      </div>

      {(resumen || cargandoResumen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Detalle del turno</h3>
              <button type="button" onClick={() => setResumen(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {cargandoResumen && <p className="py-10 text-center text-gray-500">Cargando…</p>}
            {resumen && !cargandoResumen && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <div>Cajero: <strong className="text-white">{resumen.cajeroNombre}</strong></div>
                  <div>Sucursal: <strong className="text-white">{resumen.sucursalNombre}</strong></div>
                  <div>Apertura: <strong className="text-white">{new Date(resumen.abiertaEn).toLocaleString('es-CO')}</strong></div>
                  <div>Cierre: <strong className="text-white">{resumen.cerradaEn ? new Date(resumen.cerradaEn).toLocaleString('es-CO') : 'Aún abierta'}</strong></div>
                </div>

                <div className="rounded-xl border border-gray-800 p-3">
                  <div className="flex justify-between text-gray-300"><span>Ventas del turno</span><strong className="text-white">{resumen.cantidadVentas}</strong></div>
                  <div className="flex justify-between text-gray-300"><span>Total vendido</span><strong className="text-orange-400">{moneda(resumen.totalVentas)}</strong></div>
                </div>

                <div>
                  <p className="mb-2 font-semibold text-gray-300">Por medio de pago</p>
                  <div className="space-y-1 rounded-xl border border-gray-800 p-3">
                    {resumen.ventasPorMetodoPago.map((p) => (
                      <div key={p.metodo} className="flex justify-between text-gray-300"><span>{ETIQUETAS_METODO[p.metodo] || p.metodo}</span><strong className="text-white">{moneda(p.total)}</strong></div>
                    ))}
                    {!resumen.ventasPorMetodoPago.length && <p className="text-gray-500">Sin ventas en este turno.</p>}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-800 p-3">
                  <div className="flex justify-between text-gray-300"><span>Base inicial</span><span>{moneda(resumen.montoInicial)}</span></div>
                  <div className="flex justify-between text-gray-300"><span>Efectivo esperado</span><span>{moneda(resumen.montoEsperado)}</span></div>
                  <div className="flex justify-between text-gray-300"><span>Efectivo contado</span><span>{resumen.montoFinal !== null ? moneda(resumen.montoFinal) : '—'}</span></div>
                  {resumen.diferencia !== null && (
                    <div className={`mt-1 flex justify-between rounded-lg px-2 py-1 font-bold ${Math.abs(resumen.diferencia) > 1000 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                      <span>Diferencia</span><span>{moneda(resumen.diferencia)}</span>
                    </div>
                  )}
                  {resumen.estado === 'CERRADA' && !corrigiendo && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={reimprimiendo} onClick={reimprimirCierre} className="flex-1 rounded-lg border border-gray-700 py-1.5 text-xs text-gray-300 hover:border-orange-500 hover:text-white disabled:opacity-50">
                        {reimprimiendo ? 'Enviando...' : 'Reimprimir colilla'}
                      </button>
                      <button type="button" onClick={abrirCorreccion} className="flex-1 rounded-lg border border-gray-700 py-1.5 text-xs text-gray-300 hover:border-orange-500 hover:text-white">
                        Corregir conteo
                      </button>
                    </div>
                  )}
                  {corrigiendo && (
                    <div className="mt-3 space-y-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                      <label className="block text-xs text-gray-400">Efectivo realmente contado
                        <input type="number" min={0} value={montoCorregido} onChange={(e) => setMontoCorregido(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                      </label>
                      <label className="block text-xs text-gray-400">Motivo
                        <input type="text" value={motivoCorreccion} onChange={(e) => setMotivoCorreccion(e.target.value)} placeholder="Ej: se contó mal, faltaba sumar un billete…" className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                      </label>
                      {errorCorreccion && <p className="text-xs text-red-400">{errorCorreccion}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setCorrigiendo(false)} className="flex-1 rounded-lg bg-gray-800 py-2 text-xs text-white hover:bg-gray-700">Cancelar</button>
                        <button type="button" onClick={enviarCorreccion} disabled={enviandoCorreccion || montoCorregido === '' || !motivoCorreccion.trim()} className="flex-1 rounded-lg bg-orange-500 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                          {enviandoCorreccion ? 'Guardando…' : 'Guardar corrección'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {resumen.productosVendidos.length > 0 && (
                  <div>
                    <p className="mb-2 font-semibold text-gray-300">Productos vendidos</p>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-gray-800 p-3">
                      {resumen.productosVendidos.map((p) => (
                        <div key={p.nombre} className="flex justify-between text-gray-300"><span>{p.cantidad}x {p.nombre}</span><strong className="text-white">{moneda(p.total)}</strong></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main></AuthGuard>
  );
}
