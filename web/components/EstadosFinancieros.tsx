'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

const cop = (n: number | null) => n === null ? 'Sin saldo inicial' : new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP' }).format(n);
function Filas({ filas }: { filas: [string, number | null][] }) {
  return <dl className="divide-y divide-gray-800">{filas.map(([nombre,valor])=><div key={nombre} className="flex justify-between gap-4 py-3"><dt className="text-gray-300">{nombre}</dt><dd className={`text-right font-semibold tabular-nums ${valor!==null&&valor<0?'text-red-300':'text-white'}`}>{cop(valor)}</dd></div>)}</dl>;
}
export default function EstadosFinancieros({ desde, hasta }: { desde?: string; hasta?: string }) {
  const [datos,setDatos] = useState<any>(null);
  const [error,setError] = useState('');
  const [actualizando,setActualizando] = useState(true);
  const [vista,setVista] = useState('resultado');
  const [reintento,setReintento] = useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    // El refresco no desmonta el informe: conserva scroll, pestaña y detalles abiertos.
    setActualizando(true);setError('');
    api.get('/financiero/estados',{params:{fechaDesde:desde,fechaHasta:hasta},signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setDatos(r.data);}).catch(e=>{if(!controller.signal.aborted)setError(e?.response?.data?.message||'No se pudieron cargar los estados financieros.');}).finally(()=>{if(!controller.signal.aborted)setActualizando(false);});
    return ()=>controller.abort();
  },[desde,hasta,reintento]);
  const r=datos?.resultado,b=datos?.balance,f=datos?.flujo;
  return <section aria-label="Estados financieros" aria-busy={actualizando} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
    <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Estados financieros</h2>
      <span role="status" className="text-right text-xs text-gray-400">{error&&datos?<button title={error} className="text-amber-300 underline" onClick={()=>setReintento(v=>v+1)}>Datos anteriores · reintentar</button>:actualizando?'Actualizando…':''}</span>
    </div>
    <div className="no-imprimir mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Informes financieros">{[['resultado','Estado de resultados'],['balance','Balance general'],['flujo','Estado de flujo de caja']].map(([id,nombre])=><button key={id} role="tab" aria-selected={vista===id} onClick={()=>setVista(id)} className={`rounded-lg px-4 py-2 text-sm ${vista===id?'bg-orange-500 text-white':'bg-gray-800 text-gray-300'}`}>{nombre}</button>)}</div>
    {error&&!datos?<div role="alert" className="text-red-300">{error}<button className="ml-4 underline" onClick={()=>setReintento(v=>v+1)}>Reintentar</button></div>:!datos?<p role="status" className="text-gray-400">Calculando los estados financieros…</p>:<>
      {vista==='resultado'&&<div role="tabpanel">
        <h3 className="mb-2 font-semibold">Estado de resultados · periodo seleccionado</h3>
        {!r.completo&&<div role="alert" className="mb-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">Resultado parcial: {r.ventasSinCosto.length} venta(s) contienen productos sin costo histórico. No se ha estimado su costo; este resultado no es una utilidad definitiva.<details className="mt-2"><summary className="cursor-pointer">Ver ventas pendientes de costo</summary><p className="mt-2">{r.ventasSinCosto.join(', ')}</p></details></div>}
        <Filas filas={[["Ventas netas",r.ventasNetas],["Costo de ventas registrado",r.costoVentas],["Utilidad bruta registrada",r.utilidadBruta],["Otros ingresos registrados",r.otrosIngresos],["Gastos del periodo",r.gastos],[r.completo?'Resultado neto registrado':'Resultado parcial · faltan costos',r.resultadoNeto]]}/>
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
