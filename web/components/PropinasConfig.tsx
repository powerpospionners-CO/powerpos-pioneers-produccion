'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';

type Reporte = { total: number; cierres: number; personas: { usuarioId: number; nombre: string; monto: number; turnos: number }[] };
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const inicioMes = () => `${hoy().slice(0, 8)}01`;

// Propina voluntaria (Ley 1935 de 2018): se sugiere como máximo el 10 % y se reparte en partes iguales al cerrar la caja.
export default function PropinasConfig() {
  const [config, setConfig] = useState<{ habilitado: boolean; porcentaje: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [periodo, setPeriodo] = useState({ desde: inicioMes(), hasta: hoy() });
  const [reporte, setReporte] = useState<Reporte | null>(null);

  useEffect(() => {
    api.get('/propinas/config').then(({ data }) => setConfig(data)).catch(() => setMensaje('No se pudo cargar la configuración de propinas'));
  }, []);

  const guardar = async () => {
    if (!config) return;
    setGuardando(true); setMensaje('');
    try {
      setConfig((await api.patch('/propinas/config', config)).data);
      setMensaje('✅ Propinas guardadas');
    } catch (e: any) {
      setMensaje(e?.response?.data?.message || 'No se pudo guardar');
    } finally { setGuardando(false); }
  };
  const consultar = async () => {
    setMensaje('');
    try {
      setReporte((await api.get('/propinas/reporte', { params: periodo })).data);
    } catch (e: any) {
      setMensaje(e?.response?.data?.message || 'No se pudo consultar el reparto');
    }
  };

  if (!config) return mensaje ? <p className="mt-4 text-sm text-red-400">{mensaje}</p> : null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-4 space-y-4">
      <div>
        <h3 className="text-white font-semibold mb-1">Propinas</h3>
        <p className="text-gray-500 text-xs">
          Al cobrar, la caja pregunta si el cliente quiere dejar la propina voluntaria. No es un ingreso del negocio: va aparte de la venta y en el cierre de caja se reparte en partes iguales entre quienes trabajaron el turno.
        </p>
      </div>
      <label className="flex items-center gap-3 text-sm text-gray-200">
        <input type="checkbox" checked={config.habilitado} onChange={(e) => setConfig({ ...config, habilitado: e.target.checked })} />
        Preguntar la propina al cobrar
      </label>
      <label className="block text-sm text-gray-300">Propina sugerida (%)
        <input type="number" min={0} max={10} step={0.5} value={config.porcentaje} onChange={(e) => setConfig({ ...config, porcentaje: Number(e.target.value) })} className="mt-1 block w-28 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
        <span className="mt-1 block text-xs text-gray-500">Por ley se sugiere como máximo el 10 %. El cliente siempre puede cambiarla o no dejarla.</span>
      </label>
      <button type="button" onClick={guardar} disabled={guardando} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
        {guardando ? 'Guardando…' : 'Guardar propinas'}
      </button>
      {mensaje && <p className={`text-sm ${mensaje.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>{mensaje}</p>}

      <div className="border-t border-gray-800 pt-4 space-y-3">
        <h4 className="text-white font-semibold">Reparto por persona</h4>
        <div className="flex flex-wrap items-end gap-3 text-sm text-gray-300">
          <label>Desde<input type="date" value={periodo.desde} max={periodo.hasta} onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })} className="mt-1 block rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-white" /></label>
          <label>Hasta<input type="date" value={periodo.hasta} min={periodo.desde} onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })} className="mt-1 block rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-white" /></label>
          <button type="button" onClick={consultar} className="rounded-lg bg-gray-800 px-3 py-2 text-white hover:bg-gray-700">Consultar</button>
        </div>
        {reporte && (
          reporte.cierres === 0 ? <p className="text-sm text-gray-400">No hubo propinas en ese periodo.</p> : (
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left text-gray-400">{moneda(reporte.total)} en {reporte.cierres} cierres de caja</caption>
              <thead className="text-gray-400"><tr><th className="py-1">Persona</th><th>Turnos</th><th className="text-right">Le corresponde</th></tr></thead>
              <tbody>
                {reporte.personas.map((p) => (
                  <tr key={p.usuarioId} className="border-t border-gray-800 text-gray-200">
                    <td className="py-1">{p.nombre}</td><td>{p.turnos}</td><td className="text-right tabular-nums">{moneda(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
