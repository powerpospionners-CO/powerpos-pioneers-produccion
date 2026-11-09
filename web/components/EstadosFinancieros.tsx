'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

const cop = (n: number | null) => n === null ? 'Sin saldo inicial' : new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP' }).format(n);
function Filas({ filas, ventasNetas }: { filas: [string, number | null][]; ventasNetas?: number }) {
  if (ventasNetas !== undefined) {
    const porcentaje = new Intl.NumberFormat('es-CO', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return <div className="overflow-x-auto">
      <table className="w-full text-sm sm:text-base">
        <thead className="text-xs text-gray-400">
          <tr><th scope="col" className="py-2 text-left">Concepto</th><th scope="col" className="px-3 py-2 text-right">Valor</th><th scope="col" className="py-2 text-right">% sobre ventas netas</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-800">{filas.map(([nombre, valor]) => (
          <tr key={nombre}>
            <th scope="row" className="py-3 text-left font-normal text-gray-300">{nombre}</th>
            <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${valor !== null && valor < 0 ? 'text-red-300' : 'text-white'}`}>{cop(valor)}</td>
            <td className="whitespace-nowrap py-3 text-right font-semibold tabular-nums text-gray-300">{valor === null || ventasNetas === 0 ? '—' : porcentaje.format(valor / ventasNetas)}</td>
          </tr>
        ))}</tbody>
      </table>
      {ventasNetas === 0 && <p className="mt-2 text-xs text-gray-400">El porcentaje no se puede calcular cuando las ventas netas son cero.</p>}
    </div>;
  }
  return <dl className="divide-y divide-gray-800">{filas.map(([nombre,valor])=><div key={nombre} className="flex justify-between gap-4 py-3"><dt className="text-gray-300">{nombre}</dt><dd className={`text-right font-semibold tabular-nums ${valor!==null&&valor<0?'text-red-300':'text-white'}`}>{cop(valor)}</dd></div>)}</dl>;
}
export default function EstadosFinancieros({ desde, hasta }: { desde?: string; hasta?: string }) {
  const fechaColombia = (valor?: string) => valor ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date(valor)) : '';
  const [fechaInicial, setFechaInicial] = useState(() => fechaColombia(desde));
  const [fechaFinal, setFechaFinal] = useState(() => fechaColombia(hasta));
  const [rangoPropio, setRangoPropio] = useState<{ desde: string; hasta: string } | null>(null);
  const desdeConsulta = rangoPropio?.desde ?? desde;
  const hastaConsulta = rangoPropio?.hasta ?? hasta;
  const [datos,setDatos] = useState<any>(null);
  const [error,setError] = useState('');
  const [actualizando,setActualizando] = useState(true);
  const [vista,setVista] = useState('resultado');
  const [reintento,setReintento] = useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    // El refresco no desmonta el informe: conserva scroll, pestaña y detalles abiertos.
    setActualizando(true);setError('');
    api.get('/financiero/estados',{params:{fechaDesde:desdeConsulta,fechaHasta:hastaConsulta},signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setDatos(r.data);}).catch(e=>{if(!controller.signal.aborted)setError(e?.response?.data?.message||'No se pudieron cargar los estados financieros.');}).finally(()=>{if(!controller.signal.aborted)setActualizando(false);});
    return ()=>controller.abort();
  },[desdeConsulta,hastaConsulta,reintento]);
  const r=datos?.resultado,b=datos?.balance,f=datos?.flujo;
  return <section aria-label="Estados financieros" aria-busy={actualizando} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
    <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Estados financieros</h2>
      <span role="status" className="text-right text-xs text-gray-400">{error&&datos?<button title={error} className="text-amber-300 underline" onClick={()=>setReintento(v=>v+1)}>Datos anteriores · reintentar</button>:actualizando?'Actualizando…':''}</span>
    </div>
    <div className="no-imprimir mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Informes financieros">{[['resultado','Estado de resultados'],['balance','Balance general'],['flujo','Estado de flujo de caja']].map(([id,nombre])=><button key={id} role="tab" aria-selected={vista===id} onClick={()=>setVista(id)} className={`rounded-lg px-4 py-2 text-sm ${vista===id?'bg-orange-500 text-white':'bg-gray-800 text-gray-300'}`}>{nombre}</button>)}</div>
    {vista !== 'flujo' && <Link href={`/financiero/puc?${new URLSearchParams({ vista, ...(desdeConsulta ? { desde: desdeConsulta } : {}), ...(hastaConsulta ? { hasta: hastaConsulta } : {}) })}`} className="no-imprimir mb-4 inline-block text-sm text-orange-300 underline">Ver detalle por cuentas PUC</Link>}
    {vista !== 'balance' && <form className="no-imprimir mb-4 flex flex-wrap items-end gap-3" onSubmit={evento => {
      evento.preventDefault();
      if (!fechaInicial || !fechaFinal || fechaInicial > fechaFinal) return;
      setRangoPropio({
        desde: new Date(`${fechaInicial}T00:00:00.000-05:00`).toISOString(),
        hasta: new Date(`${fechaFinal}T23:59:59.999-05:00`).toISOString(),
      });
    }}>
      <label className="text-sm text-gray-300">Fecha inicial
        <input type="date" required max={fechaFinal || undefined} value={fechaInicial} onChange={e => setFechaInicial(e.target.value)} className="mt-1 block rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" />
      </label>
      <label className="text-sm text-gray-300">Fecha final
        <input type="date" required min={fechaInicial || undefined} value={fechaFinal} onChange={e => setFechaFinal(e.target.value)} className="mt-1 block rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" />
      </label>
      <button type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold">Filtrar por fechas</button>
      {rangoPropio && <button type="button" onClick={() => {
        setRangoPropio(null);
        setFechaInicial(fechaColombia(desde));
        setFechaFinal(fechaColombia(hasta));
      }} className="rounded-lg bg-gray-800 px-4 py-2 text-sm">Usar periodo general</button>}
    </form>}
    {datos && vista !== 'balance' && <p className="mb-3 text-sm text-gray-300">Periodo del informe: {fechaColombia(datos.periodo.desde)} al {fechaColombia(datos.periodo.hasta)}</p>}
    {error&&!datos?<div role="alert" className="text-red-300">{error}<button className="ml-4 underline" onClick={()=>setReintento(v=>v+1)}>Reintentar</button></div>:!datos?<p role="status" className="text-gray-400">Calculando los estados financieros…</p>:<>
      {vista==='resultado'&&<div role="tabpanel">
        <h3 className="mb-2 font-semibold">Estado de resultados · periodo seleccionado</h3>
        {!r.completo&&<div role="alert" className="mb-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">Resultado parcial: {r.ventasSinCosto.length} venta(s) contienen productos sin costo histórico. No se ha estimado su costo; este resultado no es una utilidad definitiva.<details className="mt-2"><summary className="cursor-pointer">Ver ventas pendientes de costo</summary><p className="mt-2">{r.ventasSinCosto.join(', ')}</p></details></div>}
        <Filas ventasNetas={r.ventasNetas} filas={[["Ventas netas",r.ventasNetas],["Costo de ventas registrado",r.costoVentas],["Utilidad bruta registrada",r.utilidadBruta],["Otros ingresos registrados",r.otrosIngresos],["Gastos del periodo",r.gastos],[r.completo?'Resultado neto registrado':'Resultado parcial · faltan costos',r.resultadoNeto]]}/>
        <p className="mt-3 text-xs text-gray-400">Las compras aumentan el inventario; su costo se reconoce al vender. Los cobros de créditos no se cuentan de nuevo como ventas.</p>
      </div>}
      {vista==='balance'&&<div role="tabpanel">
        <h3 className="mb-2 font-semibold">Balance general · {new Date(b.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</h3>
        <p className="mb-3 text-sm text-gray-400">{b.alcance} Muestra la situación actual; el periodo seleccionado se aplica a resultados y flujo de caja.</p>
        {!b.completo&&<p role="alert" className="mb-3 text-sm text-amber-200">Balance parcial. {b.efectivo===null?'Falta configurar el saldo inicial. ':''}{b.productosSinCosto.length} producto(s) con existencias sin costo registrado.</p>}
        <Filas filas={[["Efectivo y saldo de cuenta registrado",b.efectivo],["Inventario con costo registrado",b.inventario],["Cuentas por cobrar",b.cuentasPorCobrar],["Total activos registrados",b.totalActivos],["Pasivos · cuentas por pagar",b.cuentasPorPagar],["Patrimonio · activo neto registrado",b.patrimonioRegistrado]]}/>
        {!!b.productosSinCosto.length&&<details className="mt-3 text-sm text-amber-200"><summary className="cursor-pointer">Productos pendientes de costo</summary><p className="mt-2">{b.productosSinCosto.map((p:any)=>p.nombre).join(', ')}</p></details>}
      </div>}
      {vista==='flujo'&&<div role="tabpanel">
        <h3 className="mb-2 font-semibold">Estado de flujo de caja · periodo seleccionado</h3>
        <p className="mb-3 text-sm text-gray-400">{f.alcance}</p>
        <Filas filas={[["Saldo inicial del periodo",f.saldoInicial],["Entradas de dinero",f.entradas],["Salidas de dinero",f.salidas],["Variación del efectivo",f.neto],["Saldo final del periodo",f.saldoFinal]]}/>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-gray-400"><tr><th>Concepto</th><th className="text-right">Entradas</th><th className="text-right">Salidas</th></tr></thead><tbody>{f.categorias.map((g:any)=><tr className="border-t border-gray-800" key={g.categoria}><td className="py-3">{g.categoria==='OTROS'?'Otros · por clasificar':g.categoria.replaceAll('_',' ')}</td><td className="text-right tabular-nums">{cop(g.entradas)}</td><td className="text-right tabular-nums">{cop(g.salidas)}</td></tr>)}</tbody></table></div>
      </div>}
    </>}
  </section>;
}
