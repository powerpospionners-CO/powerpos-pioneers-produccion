'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '@/lib/api';
import ExcelDownload from './ExcelDownload';

type Datos = { fecha: string; totalCobrar: number; totalPagar: number; vencidoCobrar: number; vencidoPagar: number; filas: { rango: string; cobrar: number; pagar: number; cuentasCobrar: number; cuentasPagar: number }[] };
const cop = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(v);

export default function AntiguedadCuentas() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setCargando(true);
    setError('');
    api.get<Datos>('/administracion/antiguedad', { signal: abort.signal })
      .then(r => { if (!abort.signal.aborted) setDatos(r.data); })
      .catch(() => { if (!abort.signal.aborted) { setDatos(null); setError('No se pudo consultar la antigüedad de las cuentas.'); } })
      .finally(() => { if (!abort.signal.aborted) setCargando(false); });
    return () => abort.abort();
  }, [version]);
  return <section className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Antigüedad de cuentas</h2>
      <div className="flex flex-wrap gap-2">
        <button disabled={cargando} onClick={() => setVersion(v => v + 1)} className="rounded-lg border border-gray-700 px-3 py-2 disabled:opacity-50">Actualizar</button>
        <ExcelDownload url="/administracion/antiguedad/exportar" filename="antiguedad-cuentas.xlsx" disabled={cargando || !datos} />
      </div>
    </div>
    <p className="text-sm text-gray-400">Saldos actuales de todas las cuentas abiertas de la empresa. Las que vencen hoy se consideran al día. No es una reconstrucción de saldos históricos.</p>
    {cargando && <p role="status">Consultando saldos…</p>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {datos && <>
      <p className="text-sm">Fecha de consulta: {datos.fecha} · Colombia</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([['Por cobrar', datos.totalCobrar], ['Por pagar', datos.totalPagar], ['Cobros vencidos', datos.vencidoCobrar], ['Pagos vencidos', datos.vencidoPagar]] as [string, number][]).map(([label, value]) => <div key={label} className="rounded-lg border border-gray-700 p-4"><p className="text-sm text-gray-400">{label}</p><strong>{cop(value)}</strong></div>)}
      </div>
      <div className="h-80" aria-label="Gráfica de saldos por antigüedad">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={datos.filas}>
          <CartesianGrid strokeDasharray="3 3" stroke="#52525b" /><XAxis dataKey="rango" stroke="#a1a1aa" /><YAxis stroke="#a1a1aa" />
          <Tooltip formatter={value => cop(Number(value))} contentStyle={{ background: '#18181b', color: '#fff' }} /><Legend />
          <Bar dataKey="cobrar" name="Por cobrar (COP)" fill="#16a34a" /><Bar dataKey="pagar" name="Por pagar (COP)" fill="#f97316" />
        </BarChart></ResponsiveContainer>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Antigüedad', 'Por cobrar', 'Cuentas', 'Por pagar', 'Cuentas'].map((h, i) => <th key={i} scope="col" className="p-3">{h}</th>)}</tr></thead><tbody>
        {datos.filas.map(f => <tr key={f.rango} className="border-t border-gray-800"><th scope="row" className="p-3">{f.rango}</th><td className="p-3">{cop(f.cobrar)}</td><td className="p-3">{f.cuentasCobrar}</td><td className="p-3">{cop(f.pagar)}</td><td className="p-3">{f.cuentasPagar}</td></tr>)}
      </tbody></table></div>
    </>}
  </section>;
}
