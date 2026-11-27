'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { exportarCsv } from '@/lib/csv';

// Bimestres de la declaración de IVA (ene-feb, mar-abr, ...), en fechas de Bogotá.
function bimestres() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [y, m] = hoy.split('-').map(Number);
  const lista: { etiqueta: string; desde: string; hasta: string }[] = [];
  let anio = y, inicio = m % 2 === 0 ? m - 1 : m;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  for (let i = 0; i < 6; i++) {
    const fin = new Date(Date.UTC(anio, inicio + 1, 0)).getUTCDate();
    lista.push({ etiqueta: `${MESES[inicio - 1]}-${MESES[inicio]} ${anio}`, desde: `${anio}-${String(inicio).padStart(2, '0')}-01`, hasta: `${anio}-${String(inicio + 1).padStart(2, '0')}-${fin}` });
    inicio -= 2;
    if (inicio < 1) { inicio += 12; anio--; }
  }
  return lista;
}

export default function ReporteIva() {
  const opciones = bimestres();
  const [periodo, setPeriodo] = useState(opciones[0]);
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const consultar = () => api.get('/iva/reporte', { params: { desde: periodo.desde, hasta: periodo.hasta } }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(e?.response?.data?.message || 'No se pudo consultar'));
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Bimestre<select className="mt-1 block rounded-lg border border-gray-700 bg-gray-800 px-2 py-2" value={periodo.desde} onChange={(e) => setPeriodo(opciones.find((o) => o.desde === e.target.value)!)}>{opciones.map((o) => <option key={o.desde} value={o.desde}>{o.etiqueta}</option>)}</select></label>
        <button type="button" onClick={() => void consultar()} className="rounded-lg bg-orange-500 px-3 py-2 font-bold">Consultar</button>
        {datos?.responsable && <button type="button" className="rounded-lg border border-gray-600 px-3 py-2" onClick={() => exportarCsv(`iva-${periodo.desde}-${periodo.hasta}.csv`, ['Tarifa', 'Base ventas', 'IVA ventas', 'Base devoluciones', 'IVA devoluciones', 'Base neta', 'IVA generado', 'Base compras', 'IVA descontable'], datos.tarifas.map((t: any) => [t.nombre, t.ventas.base, t.ventas.iva, t.devoluciones.base, t.devoluciones.iva, t.neto.base, t.neto.iva, t.compras.base, t.compras.iva]))}>Exportar CSV</button>}
      </div>
      {falla && <p role="alert" className="text-red-400">{falla}</p>}
      {datos && !datos.responsable && <p className="text-gray-400">La empresa no está marcada como responsable de IVA.</p>}
      {datos?.responsable && (
        <>
          {datos.sinConfirmar > 0 && <p className="text-amber-300">Hay {datos.sinConfirmar} productos sin tarifa confirmada; revisa la pestaña Tarifas antes de declarar.</p>}
          <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-gray-800 p-3"><dt className="text-xs text-gray-400">IVA generado (ventas − devoluciones)</dt><dd className="text-xl font-bold">{moneda(datos.ivaGenerado)}</dd></div>
            <div className="rounded-lg border border-gray-800 p-3"><dt className="text-xs text-gray-400">IVA descontable (compras de mercancía)</dt><dd className="text-xl font-bold">{moneda(datos.ivaDescontable)}</dd></div>
            <div className="rounded-lg border border-gray-800 p-3"><dt className="text-xs text-gray-400">{datos.saldo >= 0 ? 'Saldo a pagar estimado' : 'Saldo a favor estimado'}</dt><dd className={`text-xl font-bold ${datos.saldo >= 0 ? 'text-orange-300' : 'text-green-400'}`}>{moneda(Math.abs(datos.saldo))}</dd></div>
          </dl>
          <table className="w-full text-left text-sm">
            <thead className="text-gray-400"><tr><th className="py-2">Tarifa</th><th className="text-right">Base neta</th><th className="text-right">IVA generado</th><th className="text-right">Base compras</th><th className="text-right">IVA descontable</th></tr></thead>
            <tbody>
              {datos.tarifas.map((t: any) => (
                <tr key={t.tarifa} className="border-t border-gray-800">
                  <td className="py-1">{t.nombre}</td><td className="text-right tabular-nums">{moneda(t.neto.base)}</td><td className="text-right tabular-nums">{moneda(t.neto.iva)}</td><td className="text-right tabular-nums">{moneda(t.compras.base)}</td><td className="text-right tabular-nums">{moneda(t.compras.iva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400">Es una estimación con base en las tarifas configuradas y en las compras de mercancía con detalle de productos. Tu contador hace la declaración (formulario 300) con sus propios soportes.</p>
        </>
      )}
    </section>
  );
}
