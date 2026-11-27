'use client';

import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { exportarCsv } from '@/lib/csv';
import TarifasIva from '@/components/contabilidad/TarifasIva';
import ReporteIva from '@/components/contabilidad/ReporteIva';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const inicioMes = () => `${hoy().slice(0, 8)}01`;
const input = 'mt-1 block rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-white';

export default function ContabilidadPage() {
  const [pestana, setPestana] = useState<'libro' | 'iva' | 'tarifas'>('libro');
  const [rango, setRango] = useState({ desde: inicioMes(), hasta: hoy() });
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const [cargando, setCargando] = useState(false);
  const generar = async () => {
    setCargando(true); setFalla('');
    try {
      setDatos((await api.get('/contabilidad/libro-diario', { params: rango })).data);
    } catch (e: any) {
      setFalla(e?.response?.data?.message || 'No se pudo generar el libro diario');
    } finally { setCargando(false); }
  };
  const exportar = () => exportarCsv(
    `libro-diario-${rango.desde}-a-${rango.hasta}.csv`,
    ['Comprobante', 'Fecha', 'Tipo', 'Cuenta', 'Nombre de la cuenta', 'Detalle', 'Débito', 'Crédito', 'NIT empresa', 'Por verificar'],
    datos.comprobantes.flatMap((c: any) => c.lineas.map((l: any) => [c.numero, c.fecha, c.tipo, l.cuenta, l.nombre, l.detalle, l.debito, l.credito, datos.empresa?.nit || '', c.verificar || ''])),
  );
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
          <div>
            <h1 className="text-2xl font-bold">Contabilidad</h1>
            <p className="text-sm text-gray-400">Asientos de partida doble por día con las cuentas del PUC, a partir de lo registrado en esta sede. Tu contador los importa en Siigo, World Office u otro programa, o los ajusta a su plantilla.</p>
          </div>
          <div role="tablist" className="flex flex-wrap gap-2">
            {([['libro', 'Libro diario'], ['iva', 'Reporte de IVA'], ['tarifas', 'Tarifas de IVA']] as const).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={pestana === k} type="button" onClick={() => setPestana(k)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${pestana === k ? 'bg-orange-500' : 'bg-gray-800 text-gray-300'}`}>{t}</button>
            ))}
          </div>
          {pestana === 'iva' && <ReporteIva />}
          {pestana === 'tarifas' && <TarifasIva />}
          {pestana === 'libro' && <>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label>Desde<input type="date" className={input} value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></label>
            <label>Hasta<input type="date" className={input} value={rango.hasta} min={rango.desde} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></label>
            <button type="button" disabled={cargando} onClick={() => void generar()} className="rounded-lg bg-orange-500 px-3 py-2 font-bold disabled:opacity-50">{cargando ? 'Generando…' : 'Generar'}</button>
            {datos?.comprobantes.length > 0 && <button type="button" onClick={exportar} className="rounded-lg border border-gray-600 px-3 py-2">Exportar para el contador (CSV)</button>}
          </div>
          {falla && <p role="alert" className="text-red-400">{falla}</p>}
          {datos && (
            <>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-gray-800 p-3"><dt className="text-xs text-gray-400">Comprobantes</dt><dd className="text-lg font-bold">{datos.comprobantes.length}</dd></div>
                <div className="rounded-lg border border-gray-800 p-3"><dt className="text-xs text-gray-400">Total débitos</dt><dd className="text-lg font-bold">{moneda(datos.totales.debitos)}</dd></div>
                <div className="rounded-lg border border-gray-800 p-3"><dt className="text-xs text-gray-400">Total créditos</dt><dd className="text-lg font-bold">{moneda(datos.totales.creditos)}</dd></div>
                <div className="rounded-lg border border-gray-800 p-3"><dt className="text-xs text-gray-400">Por verificar</dt><dd className={`text-lg font-bold ${datos.porVerificar ? 'text-amber-300' : ''}`}>{datos.porVerificar}</dd></div>
              </dl>
              {datos.descuadrados.length > 0
                ? <p role="alert" className="text-red-400">No cuadran: {datos.descuadrados.join(', ')}. Avísale a soporte.</p>
                : datos.comprobantes.length > 0 && <p className="text-sm text-green-400">✓ Todos los comprobantes cuadran (débitos = créditos).</p>}
              <p className="text-xs text-gray-400">
                Es una base para tu contador, no reemplaza su revisión. Si la empresa es responsable de IVA, las ventas separan la base y el IVA generado (240805) y las compras de mercancía el IVA descontable (240810), según las tarifas de cada producto. Los gastos sin cuenta PUC asignada usan una cuenta por categoría; puedes asignarla en Financiero → Plan de cuentas. Las propinas van a una cuenta por pagar al personal, no a ingresos.
              </p>
              <div className="space-y-3">
                {datos.comprobantes.map((c: any) => (
                  <article key={c.numero} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                    <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <strong>{c.numero} · {c.tipo}</strong>
                      <span className="text-gray-400">{c.fecha} · {c.descripcion}</span>
                    </header>
                    <table className="w-full text-sm">
                      <tbody>
                        {c.lineas.map((l: any, i: number) => (
                          <tr key={i} className="border-t border-gray-800">
                            <td className="py-1 pr-2 font-mono text-xs">{l.cuenta}</td>
                            <td className="pr-2">{l.nombre}</td>
                            <td className="w-32 text-right tabular-nums">{l.debito ? moneda(l.debito) : ''}</td>
                            <td className="w-32 text-right tabular-nums">{l.credito ? moneda(l.credito) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {c.verificar && <p className="mt-1 text-xs text-amber-300">Verificar: {c.verificar}</p>}
                  </article>
                ))}
                {!datos.comprobantes.length && <p className="text-gray-400">Sin movimientos en el periodo.</p>}
              </div>
            </>
          )}
          </>}
        </main>
      </div>
    </AuthGuard>
  );
}
