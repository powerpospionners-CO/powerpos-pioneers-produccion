'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { moneda } from '@/lib/formato';
import { generarClaveVenta } from '@/lib/colaOfflineVentas';
import ModalCobro, { PagoConfirmado } from './ModalCobro';

type Pedido = { id:number;numero:string;total:string;modalidad:string;estadoGestion:string;saldoPendiente:number|null;entregado:boolean;numeroCaja?:string;clienteReferencia?:string;distribuidor:{nombre:string;codigo:string};detalles:{id:number;cantidad:number;presentacionNombre?:string;producto:{nombre:string};subtotal:string}[] };
type Solicitud = { ruta:string;datos:Record<string,any> };
export default function PedidosDistribuidorCaja({onCambio}:{onCambio:()=>void}) {
  const usuario=useAuthStore(s=>s.usuario);
  const clave=usuario?`distribuidor-caja-pendiente:${usuario.empresaId}:${usuario.sucursalId}:${usuario.id}`:'';
  const [habilitado,setHabilitado]=useState(false),[abierto,setAbierto]=useState(false),[todos,setTodos]=useState(false);
  const [pedidos,setPedidos]=useState<Pedido[]>([]),[entrega,setEntrega]=useState<Pedido|null>(null),[cobro,setCobro]=useState<Pedido|null>(null);
  const [monto,setMonto]=useState(''),[medio,setMedio]=useState('EFECTIVO'),[referencia,setReferencia]=useState('');
  const [ocupado,setOcupado]=useState(false),[mensaje,setMensaje]=useState(''),[error,setError]=useState('');
  const [pendiente,setPendiente]=useState<Solicitud|null>(null),[restaurado,setRestaurado]=useState(false),[recibo,setRecibo]=useState<number|null>(null);
  const cargar=useCallback(async()=>{try{const capacidad=await api.get('/pedidos-distribuidor/modalidades');if(!capacidad.data.flujoCaja)return;const r=await api.get('/pedidos-distribuidor');setPedidos(r.data);setError('');}catch(e:any){setError(e?.response?.data?.message||'No se pudieron actualizar los pedidos de distribuidores.');}},[]);
  useEffect(()=>{
    let vivo=true;setHabilitado(false);setPedidos([]);setAbierto(false);
    if(!['CAJERO','ADMIN_EMPRESA','GERENTE'].includes(usuario?.rol||''))return;
    api.get('/empresa').then(r=>{if(vivo)setHabilitado(!!r.data.distribuidoresHabilitado);}).catch(()=>{});
    return()=>{vivo=false;};
  },[usuario?.id,usuario?.empresaId,usuario?.rol]);
  useEffect(()=>{if(!habilitado)return;void cargar();const timer=setInterval(()=>void cargar(),5000);return()=>clearInterval(timer);},[habilitado,cargar]);
  useEffect(()=>{
    setRestaurado(false);setPendiente(null);if(!clave)return;
    try{const texto=localStorage.getItem(clave);const s=texto?JSON.parse(texto):null;if(s&&(!/^\/pedidos-distribuidor\/\d+\/(entregar|cobrar)$/.test(s.ruta)||typeof s.datos?.clave!=='string'))throw Error();setPendiente(s);setRestaurado(true);}catch{setError('No se pudo recuperar la operación pendiente. Revisa los últimos cobros antes de continuar.');}
  },[clave]);
  const ejecutar=async(ruta:string,datos:Record<string,any>)=>{
    if(ocupado||!restaurado)return;
    let solicitud=pendiente??{ruta,datos:{...datos,clave:generarClaveVenta()}};
    try{const texto=localStorage.getItem(clave);if(texto){const anterior=JSON.parse(texto);if(!/^\/pedidos-distribuidor\/\d+\/(entregar|cobrar)$/.test(anterior.ruta)||typeof anterior.datos?.clave!=='string')throw Error();if(anterior.datos.clave!==solicitud.datos.clave){setPendiente(anterior);setEntrega(null);setCobro(null);setError('Otra ventana dejó una operación pendiente. Revísala y reintenta antes de registrar otra.');return;}}localStorage.setItem(clave,JSON.stringify(solicitud));}catch{setError('No se pudo respaldar la operación. No se envió ningún cobro ni entrega.');return;}
    setPendiente(solicitud);setOcupado(true);setError('');setMensaje('');
    try{
      const r=await api.post(solicitud.ruta,solicitud.datos);
      localStorage.removeItem(clave);setPendiente(null);setEntrega(null);setCobro(null);
      if(r.data.pedidoCajaId)setRecibo(r.data.pedidoCajaId);
      setMensaje('Operación confirmada. La caja y el saldo del distribuidor quedaron actualizados.');
      await cargar();onCambio();
    }catch(e:any){if(e?.response?.status>=400&&e?.response?.status<500){try{localStorage.removeItem(clave);setPendiente(null);}catch{}}else{setEntrega(null);setCobro(null);}setError(e?.response?.data?.message||'No se pudo confirmar la operación. Reintenta con los mismos datos.');}finally{setOcupado(false);}
  };
  const imprimir=async()=>{if(!recibo)return;setOcupado(true);try{const p=await api.get(`/pedidos/${recibo}`);const r=await api.post('/impresion/ticket',p.data);setMensaje(r.data.impreso?'Recibo enviado a la impresora.':'La operación está registrada, pero no se pudo imprimir. Revisa la impresora.');}catch{setError('La operación está registrada. No se pudo imprimir el recibo.');}finally{setOcupado(false);}};
  if(!habilitado)return null;
  const porRetirar=pedidos.filter(p=>p.estadoGestion==='PENDIENTE_RETIRO');
  const porPagar=pedidos.filter(p=>p.estadoGestion==='PENDIENTE_PAGO');
  const historicos=pedidos.filter(p=>p.estadoGestion==='HISTORICO');
  const visibles=pedidos.filter(p=>todos||['PENDIENTE_RETIRO','PENDIENTE_PAGO','EN_REVISION','HISTORICO'].includes(p.estadoGestion));
  return <section aria-label="Pedidos de distribuidores en caja" className="my-4 rounded-xl border border-orange-500/40 bg-gray-900 p-4 text-white">
    <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left font-semibold text-orange-300" onClick={()=>setAbierto(v=>!v)}>Pedidos de distribuidores <span aria-live="polite" className="text-sm">{porRetirar.length} por retirar · {porPagar.length} por pagar{historicos.length?` · ${historicos.length} anteriores por revisar`:''} {abierto?'▴':'▾'}</span></button>
    {pendiente&&<div className="mt-3 rounded-lg border border-amber-500 p-3 text-amber-200">Hay una operación pendiente de confirmar.<button disabled={ocupado} className="ml-3 underline" onClick={()=>ejecutar(pendiente.ruta,pendiente.datos)}>Reintentar la misma operación</button></div>}
    {error&&<p role="alert" className="mt-3 text-red-300">{error}</p>}{mensaje&&<p role="status" className="mt-3 text-green-300">{mensaje}</p>}
    {recibo&&<button disabled={ocupado} onClick={imprimir} className="mt-2 text-sm text-orange-300 underline">Imprimir recibo de la última entrega</button>}
    {abierto&&<fieldset disabled={ocupado||!restaurado||!!pendiente} className="mt-4 space-y-3 disabled:opacity-60">
      <label className="flex items-center gap-2 text-sm text-gray-400"><input type="checkbox" checked={todos} onChange={e=>setTodos(e.target.checked)}/>Ver también pagados e históricos · últimos 200 registros</label>
      {!visibles.length&&<p className="text-gray-400">No hay pedidos pendientes de distribuidores.</p>}
      {visibles.map(p=><article key={p.id} className="rounded-lg border border-gray-700 p-3">
        <div className="flex flex-wrap justify-between gap-2"><strong>{p.numero} · {p.distribuidor.nombre}</strong><strong>{moneda(Number(p.total))}</strong></div>
        <p className="mt-1 text-sm text-gray-300">Cliente: {p.clienteReferencia||'Sin referencia'} · {p.modalidad==='PAGO_ANTES'?'Pagar antes de retirar':p.modalidad==='COBRO_POSTERIOR'?'Retirar y pagar después':'Pedido histórico'}</p>
        <p className="mt-1 text-sm text-amber-200">{p.estadoGestion.replaceAll('_',' ')}{p.saldoPendiente!==null?` · Por entregar a caja: ${moneda(p.saldoPendiente)}`:''}{p.numeroCaja?` · Venta ${p.numeroCaja}`:''}</p>
        {p.estadoGestion==='HISTORICO'&&<p className="mt-2 text-sm text-gray-400">Este pedido se registró antes del control de caja. Administración debe confirmar si la mercancía y el dinero ya fueron entregados antes de registrar otro cobro o liquidar su comisión.</p>}
        <details className="mt-2 text-sm"><summary className="cursor-pointer text-orange-300">Ver mercancía del pedido</summary><ul className="mt-2 space-y-1">{p.detalles.map(d=><li key={d.id}>{d.cantidad} × {d.producto.nombre}{d.presentacionNombre?` · ${d.presentacionNombre}`:''} · {moneda(Number(d.subtotal))}</li>)}</ul></details>
        {p.estadoGestion==='PENDIENTE_RETIRO'&&<button className="mt-3 rounded-lg bg-orange-600 px-4 py-2 font-semibold" onClick={()=>{setEntrega(p);setCobro(null);}}>{p.modalidad==='PAGO_ANTES'?'Cobrar y confirmar retiro':'Confirmar retiro y forma de pago'}</button>}
        {p.estadoGestion==='PENDIENTE_PAGO'&&<button className="mt-3 rounded-lg bg-green-700 px-4 py-2" onClick={()=>{setCobro(p);setMonto(String(p.saldoPendiente));setReferencia('Entrega de dinero del distribuidor');}}>Recibir dinero del distribuidor</button>}
      </article>)}
    </fieldset>}
    {entrega&&<ModalCobro opcionesImpresion={error?<p role="alert" className="text-red-300">{error}</p>:undefined} responsable="distribuidor" titulo={`Retiro ${entrega.numero} · ${entrega.distribuidor.nombre}`} total={Number(entrega.total)} permitirCredito={entrega.modalidad==='COBRO_POSTERIOR'} procesando={ocupado||!!pendiente} onCancelar={()=>setEntrega(null)} onConfirmar={(pago:PagoConfirmado)=>ejecutar(`/pedidos-distribuidor/${entrega.id}/entregar`,pago)} textoConfirmar="Cobrar y entregar mercancía" borradorInicial={entrega.modalidad==='COBRO_POSTERIOR'?{credito:true,abonoInicial:false,vencimiento:'',mixto:false,metodoUnico:'EFECTIVO',recibidoUnico:0,bancoTransferencia:'TRANSFERENCIA',lineas:[{metodoPago:'EFECTIVO',monto:String(entrega.total)},{metodoPago:'NEQUI',monto:'0'}],recibidosMixto:{}}:undefined}/>}
    {cobro&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-label="Recibir pago del distribuidor" className="w-full max-w-lg space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-5">
      {error&&<p role="alert" className="text-red-300">{error}</p>}<h3 className="text-lg font-bold">Recibir pago · {cobro.numero}</h3><p>{cobro.distribuidor.nombre} · Saldo {moneda(Number(cobro.saldoPendiente))}</p>
      <label className="block">Medio de pago<select disabled={ocupado||!!pendiente} className="mt-1 w-full rounded bg-gray-800 p-2" value={medio} onChange={e=>setMedio(e.target.value)}>{['EFECTIVO','NEQUI','DAVIPLATA','TRANSFERENCIA','TARJETA'].map(m=><option key={m}>{m}</option>)}</select></label>
      <label className="block">Dinero recibido<input aria-label="Dinero recibido del distribuidor" disabled={ocupado||!!pendiente} type="number" min="0.01" step="0.01" max={cobro.saldoPendiente??undefined} className="mt-1 w-full rounded bg-gray-800 p-2" value={monto} onChange={e=>setMonto(e.target.value)}/></label>
      <label className="block">Referencia<input disabled={ocupado||!!pendiente} maxLength={180} className="mt-1 w-full rounded bg-gray-800 p-2" value={referencia} onChange={e=>setReferencia(e.target.value)}/></label>
      <div className="flex gap-3"><button disabled={ocupado||!!pendiente} onClick={()=>setCobro(null)} className="flex-1 rounded bg-gray-700 p-3">Volver</button><button disabled={ocupado||!!pendiente||!referencia.trim()||!(Number(monto)>0)||Number(monto)>Number(cobro.saldoPendiente)} onClick={()=>ejecutar(`/pedidos-distribuidor/${cobro.id}/cobrar`,{monto:Number(monto),metodoPago:medio,referencia})} className="flex-1 rounded bg-green-700 p-3">Registrar dinero recibido</button></div>
    </div></div>}
  </section>;
}
