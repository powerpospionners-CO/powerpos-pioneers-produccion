'use client';
import { FormEvent, useState } from 'react';
import api from '@/lib/api';
import ExcelDownload from './ExcelDownload';
type Datos = { desde: string; hasta: string; ventasCubiertas: number; costo: number; margenBruto: number; pedidosConCosto: number; pedidosSinCosto: number; ventasSinCosto: number; productos: { nombre: string; cantidad: number; ventas: number; costo: number; margenBruto: number }[] };
const moneda = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(n);
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
export default function RentabilidadHistorica() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function consultar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setOcupado(true); setError('');
    try { const r = await api.get<Datos>('/reportes/rentabilidad-historica', { params: { desde: form.get('desde'), hasta: form.get('hasta') } }); setDatos(r.data); }
    catch { setDatos(null); setError('No se pudo consultar. Selecciona entre 1 y 93 días.'); }
    finally { setOcupado(false); }
  }
  return <section className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-4 text-white">
    <h3 className="font-semibold">Rentabilidad histórica</h3>
    <p className="text-sm text-gray-400">Conserva el costo de las ventas nuevas. El margen bruto descuenta costos y descuentos de productos; no incluye domicilio ni gastos generales. Las ventas anteriores y aquellas sin costos completos se muestran como no cubiertas.</p>
    <form onSubmit={consultar} className="flex flex-wrap items-end gap-3">
      <label>Desde<input name="desde" type="date" required defaultValue={hoy()} className="block rounded bg-gray-800 p-2" /></label>
      <label>Hasta<input name="hasta" type="date" required defaultValue={hoy()} className="block rounded bg-gray-800 p-2" /></label>
      <button disabled={ocupado} className="rounded bg-orange-600 px-4 py-2 disabled:opacity-50">{ocupado ? 'Consultando…' : 'Consultar'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {datos && <>
      <ExcelDownload url="/reportes/rentabilidad-historica/exportar" filename="rentabilidad-historica.xlsx" disabled={ocupado} params={{ desde: datos.desde, hasta: datos.hasta }} />
      <div className="grid gap-3 sm:grid-cols-3">{([['Ventas cubiertas', datos.ventasCubiertas], ['Costo conservado', datos.costo], ['Margen bruto', datos.margenBruto]] as [string,number][]).map(([k,v]) => <div key={k} className="rounded bg-gray-800 p-3"><p>{k}</p><strong>{moneda(v)}</strong></div>)}</div>
      <p className="text-sm text-amber-300">{datos.pedidosConCosto} pedidos con costos completos. {datos.pedidosSinCosto} sin costo histórico completo ({moneda(datos.ventasSinCosto)}); no se incluyen en el margen.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Producto', 'Cantidad', 'Ventas netas', 'Costo', 'Margen bruto'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{datos.productos.map((p,i) => <tr key={i} className="border-t border-gray-700"><td className="p-2">{p.nombre}</td><td>{p.cantidad}</td><td>{moneda(p.ventas)}</td><td>{moneda(p.costo)}</td><td>{moneda(p.margenBruto)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
