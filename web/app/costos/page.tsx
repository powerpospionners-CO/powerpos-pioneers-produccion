'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { exportarCsv } from '@/lib/csv';

type Pestana = 'platos' | 'kardex' | 'compra' | 'vencimientos';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const haceDias = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() - n * 86400000));
const input = 'mt-1 block rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-white';
const boton = 'rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40';
const secundario = 'rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:border-gray-400';
const error = (e: any) => e?.response?.data?.message || 'No se pudo consultar';
const num = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : n.toLocaleString('es-CO', { maximumFractionDigits: d }));

export default function CostosPage() {
  const [pestana, setPestana] = useState<Pestana>('platos');
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
          <div>
            <h1 className="text-2xl font-bold">Costos e inventario</h1>
            <p className="text-sm text-gray-400">Cuánto te cuesta cada plato, por dónde se mueve cada producto y qué comprar.</p>
          </div>
          <div role="tablist" className="flex flex-wrap gap-2">
            {([['platos', 'Costo por plato'], ['kardex', 'Kardex'], ['compra', 'Compra sugerida'], ['vencimientos', 'Vencimientos y mermas']] as const).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={pestana === k} type="button" onClick={() => setPestana(k)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${pestana === k ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300'}`}>{t}</button>
            ))}
          </div>
          {pestana === 'platos' && <Platos />}
          {pestana === 'kardex' && <Kardex />}
          {pestana === 'compra' && <Compra />}
          {pestana === 'vencimientos' && <Vencimientos />}
        </main>
      </div>
    </AuthGuard>
  );
}

function Platos() {
  const [dias, setDias] = useState(30);
  const [umbral, setUmbral] = useState(30);
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'alertas'>('todos');
  const consultar = () => api.get('/costos/platos', { params: { dias, umbral } }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(error(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void consultar(); }, []);
  const filas = (datos?.productos || []).filter((p: any) => filtro === 'todos' || p.alerta);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Ventas de<select className={input} value={dias} onChange={(e) => setDias(Number(e.target.value))}><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option></select></label>
        <label>Margen mínimo (%)<input type="number" min={0} max={100} className={`${input} w-24`} value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} /></label>
        <button type="button" className={boton} onClick={() => void consultar()}>Consultar</button>
        <label className="flex items-center gap-2"><input type="checkbox" checked={filtro === 'alertas'} onChange={(e) => setFiltro(e.target.checked ? 'alertas' : 'todos')} /> Solo con alerta</label>
        {datos && <button type="button" className={secundario} onClick={() => exportarCsv('costo-por-plato.csv', ['Producto', 'Categoría', 'Precio', 'Costo', 'Margen %', 'Vendidos', 'Ventas', 'Margen real %', 'Utilidad'], filas.map((p: any) => [p.nombre, p.categoria, p.precio, p.costo ?? '', p.margen ?? '', p.vendidos, p.ventas, p.margenReal ?? '', p.utilidad ?? '']))}>Exportar CSV</button>}
      </div>
      {falla && <p role="alert" className="text-red-400">{falla}</p>}
      <p className="text-xs text-gray-400">El costo sale de la receta (insumos × costo unitario) o del costo cargado en el producto. El margen real usa el costo que guardó cada venta.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-gray-400"><tr><th className="py-2">Producto</th><th className="text-right">Precio</th><th className="text-right">Costo</th><th className="text-right">Margen</th><th className="text-right">Vendidos</th><th className="text-right">Ventas</th><th className="text-right">Margen real</th><th className="text-right">Utilidad</th></tr></thead>
          <tbody>
            {filas.map((p: any) => (
              <tr key={p.id} className="border-t border-gray-800 align-top">
                <td className="py-2">
                  {p.nombre}<span className="block text-xs text-gray-500">{p.categoria}</span>
                  {p.alerta === 'SIN_COSTO' && <span className="text-xs text-amber-300">Falta el costo de la receta o del producto</span>}
                  {p.alerta === 'MARGEN_BAJO' && <span className="text-xs text-red-300">Margen bajo</span>}
                  {p.partes.length > 0 && <span className="block text-xs text-gray-500">{p.partes.map((x: any) => `${x.nombre} ${moneda(x.costo)}`).join(' · ')}</span>}
                </td>
                <td className="text-right tabular-nums">{moneda(p.precio)}</td>
                <td className="text-right tabular-nums">{p.costo === null ? '—' : moneda(p.costo)}</td>
                <td className={`text-right tabular-nums ${p.alerta === 'MARGEN_BAJO' ? 'text-red-300' : ''}`}>{p.margen === null ? '—' : `${p.margen}%`}</td>
                <td className="text-right tabular-nums">{p.vendidos}</td>
                <td className="text-right tabular-nums">{moneda(p.ventas)}</td>
                <td className="text-right tabular-nums">{p.margenReal === null ? '—' : `${p.margenReal}%`}</td>
                <td className="text-right tabular-nums">{p.utilidad === null ? '—' : moneda(p.utilidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Kardex() {
  const [tipo, setTipo] = useState<'PRODUCTO' | 'INGREDIENTE'>('PRODUCTO');
  const [opciones, setOpciones] = useState<{ id: number; nombre: string }[]>([]);
  const [id, setId] = useState('');
  const [rango, setRango] = useState({ desde: haceDias(30), hasta: hoy() });
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  useEffect(() => {
    setId(''); setDatos(null);
    api.get(tipo === 'PRODUCTO' ? '/productos' : '/inventario').then(({ data }) => setOpciones(data.map((x: any) => ({ id: x.id, nombre: x.nombre })))).catch(() => setOpciones([]));
  }, [tipo]);
  const consultar = () => id && api.get('/costos/kardex', { params: { tipo, id, ...rango } }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(error(e)));
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Tipo<select className={input} value={tipo} onChange={(e) => setTipo(e.target.value as any)}><option value="PRODUCTO">Producto</option><option value="INGREDIENTE">Insumo</option></select></label>
        <label>{tipo === 'PRODUCTO' ? 'Producto' : 'Insumo'}<select className={`${input} min-w-56`} value={id} onChange={(e) => setId(e.target.value)}><option value="">Elige…</option>{opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>
        <label>Desde<input type="date" className={input} value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></label>
        <label>Hasta<input type="date" className={input} value={rango.hasta} min={rango.desde} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></label>
        <button type="button" className={boton} disabled={!id} onClick={() => void consultar()}>Consultar</button>
      </div>
      {falla && <p role="alert" className="text-red-400">{falla}</p>}
      {datos && (
        <>
          <dl className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {[['Saldo inicial', num(datos.saldoInicial)], ['Entradas', num(datos.entradas)], ['Salidas', num(datos.salidas)], ['Saldo final', num(datos.saldoFinal)], ['Valor del saldo', moneda(datos.valorSaldoFinal)]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-gray-800 p-3"><dt className="text-xs text-gray-400">{k}</dt><dd className="text-lg font-bold">{v} {k.startsWith('Valor') ? '' : datos.item.unidad}</dd></div>
            ))}
          </dl>
          <p className="text-xs text-gray-400">El saldo se reconstruye desde las existencias actuales con las ventas y los movimientos registrados. Un cambio de existencias hecho por fuera de esos registros aparece como diferencia en el saldo inicial.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-gray-400"><tr><th className="py-2">Fecha</th><th>Concepto</th><th>Referencia</th><th className="text-right">Entrada</th><th className="text-right">Salida</th><th className="text-right">Saldo</th></tr></thead>
              <tbody>
                {datos.filas.map((f: any, i: number) => (
                  <tr key={i} className="border-t border-gray-800">
                    <td className="py-1">{new Date(f.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{f.concepto}{f.usuario && <span className="block text-xs text-gray-500">{f.usuario}</span>}</td>
                    <td className="text-gray-400">{f.referencia}</td>
                    <td className="text-right tabular-nums text-green-300">{f.entrada ? num(f.entrada, 3) : ''}</td>
                    <td className="text-right tabular-nums text-red-300">{f.salida ? num(f.salida, 3) : ''}</td>
                    <td className="text-right tabular-nums">{num(f.saldo, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!datos.filas.length && <p className="text-gray-400">Sin movimientos en el periodo.</p>}
        </>
      )}
    </section>
  );
}

function Compra() {
  const [dias, setDias] = useState(28);
  const [cobertura, setCobertura] = useState(7);
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const consultar = () => api.get('/costos/sugerencia-compra', { params: { dias, cobertura } }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(error(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void consultar(); }, []);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Consumo de los últimos<select className={input} value={dias} onChange={(e) => setDias(Number(e.target.value))}>{[7, 14, 28, 56].map((d) => <option key={d} value={d}>{d} días</option>)}</select></label>
        <label>Comprar para (días)<input type="number" min={1} max={60} className={`${input} w-24`} value={cobertura} onChange={(e) => setCobertura(Number(e.target.value))} /></label>
        <button type="button" className={boton} onClick={() => void consultar()}>Calcular</button>
        {datos?.items.length > 0 && <button type="button" className={secundario} onClick={() => exportarCsv(`compra-sugerida-${datos.fecha}.csv`, ['Tipo', 'Nombre', 'Existencia', 'Mínimo', 'Consumo diario', 'Días que alcanza', 'Comprar', 'Unidad', 'En unidad de compra', 'Costo estimado'], datos.items.map((x: any) => [x.tipo === 'PRODUCTO' ? 'Producto' : 'Insumo', x.nombre, x.stock, x.minimo, x.consumoDiario, x.diasCobertura ?? '', x.sugerido, x.unidad, x.enUnidadCompra ? `${x.enUnidadCompra} ${x.unidadCompra}` : '', x.costoEstimado]))}>Exportar para el proveedor</button>}
      </div>
      {falla && <p role="alert" className="text-red-400">{falla}</p>}
      <p className="text-xs text-gray-400">Sugerencia = consumo diario promedio × días a cubrir + mínimo − existencia. Revísala antes de pedir: no conoce promociones ni temporadas.</p>
      {datos && (datos.items.length === 0 ? <p className="text-gray-400">Con el consumo actual no hace falta comprar nada para {datos.cobertura} días.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="mb-2 text-left text-gray-400">Costo estimado de la compra: <strong className="text-white">{moneda(datos.total)}</strong></caption>
            <thead className="text-gray-400"><tr><th className="py-2">Nombre</th><th className="text-right">Existencia</th><th className="text-right">Consumo/día</th><th className="text-right">Alcanza</th><th className="text-right">Comprar</th><th className="text-right">Costo</th></tr></thead>
            <tbody>
              {datos.items.map((x: any) => (
                <tr key={`${x.tipo}-${x.id}`} className="border-t border-gray-800">
                  <td className="py-1">{x.nombre}<span className="block text-xs text-gray-500">{x.tipo === 'PRODUCTO' ? 'Producto' : 'Insumo'}</span></td>
                  <td className="text-right tabular-nums">{num(x.stock)} {x.unidad}</td>
                  <td className="text-right tabular-nums">{num(x.consumoDiario)}</td>
                  <td className={`text-right tabular-nums ${x.diasCobertura !== null && x.diasCobertura < 3 ? 'text-red-300' : ''}`}>{x.diasCobertura === null ? '—' : `${x.diasCobertura} días`}</td>
                  <td className="text-right font-bold tabular-nums">{num(x.sugerido)} {x.unidad}{x.enUnidadCompra ? <span className="block text-xs font-normal text-gray-400">≈ {x.enUnidadCompra} {x.unidadCompra}</span> : null}</td>
                  <td className="text-right tabular-nums">{moneda(x.costoEstimado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function Vencimientos() {
  const [dias, setDias] = useState(7);
  const [lotes, setLotes] = useState<any[] | null>(null);
  const [rango, setRango] = useState({ desde: haceDias(30), hasta: hoy() });
  const [merma, setMerma] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const cargarLotes = () => api.get('/productos/lotes/por-vencer', { params: { dias } }).then(({ data }) => setLotes(data)).catch((e) => setFalla(error(e)));
  const cargarMerma = () => api.get('/productos/reportes/merma', { params: rango }).then(({ data }) => setMerma(data)).catch((e) => setFalla(error(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void cargarLotes(); void cargarMerma(); }, []);
  const ahora = Date.now();
  return (
    <section className="space-y-6">
      {falla && <p role="alert" className="text-red-400">{falla}</p>}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <h2 className="text-lg font-bold">Por vencer</h2>
          <label>En los próximos<select className={input} value={dias} onChange={(e) => setDias(Number(e.target.value))}>{[3, 7, 15, 30].map((d) => <option key={d} value={d}>{d} días</option>)}</select></label>
          <button type="button" className={boton} onClick={() => void cargarLotes()}>Ver</button>
        </div>
        {lotes && (lotes.length === 0 ? <p className="text-gray-400">No hay lotes por vencer en ese plazo.</p> : (
          <ul className="divide-y divide-gray-800 text-sm">
            {lotes.map((l) => {
              const restan = Math.ceil((new Date(l.fechaVencimiento).getTime() - ahora) / 86400000);
              return (
                <li key={l.id} className="flex justify-between py-2">
                  <span>{l.producto?.nombre}<span className="block text-xs text-gray-500">{l.cantidadRestante} und · {l.producto?.categoria?.nombre}</span></span>
                  <span className={restan < 0 ? 'text-red-400' : restan <= 2 ? 'text-amber-300' : 'text-gray-300'}>{restan < 0 ? `Vencido hace ${-restan} días` : restan === 0 ? 'Vence hoy' : `Vence en ${restan} días`}</span>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <h2 className="text-lg font-bold">Mermas</h2>
          <label>Desde<input type="date" className={input} value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></label>
          <label>Hasta<input type="date" className={input} value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></label>
          <button type="button" className={boton} onClick={() => void cargarMerma()}>Ver</button>
        </div>
        <p className="text-xs text-gray-400">Las mermas se registran en Productos, al dar salida de existencias con un motivo (dañado, donado, consumo propio u otro).</p>
        {merma && (merma.resumenPorProducto.length === 0 ? <p className="text-gray-400">Sin mermas en el periodo.</p> : (
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left text-gray-400">Costo estimado: <strong className="text-white">{moneda(merma.resumenPorProducto.reduce((s: number, p: any) => s + p.costoEstimado, 0))}</strong></caption>
            <thead className="text-gray-400"><tr><th className="py-2">Producto</th><th className="text-right">Cantidad</th><th>Motivos</th><th className="text-right">Costo</th></tr></thead>
            <tbody>
              {merma.resumenPorProducto.map((p: any) => (
                <tr key={p.productoId} className="border-t border-gray-800">
                  <td className="py-1">{p.nombre}</td><td className="text-right">{num(p.cantidad)}</td>
                  <td className="text-xs text-gray-400">{Object.entries(p.motivos).map(([m, c]) => `${m.toLowerCase().replace('_', ' ')}: ${c}`).join(' · ')}</td>
                  <td className="text-right tabular-nums">{moneda(p.costoEstimado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
