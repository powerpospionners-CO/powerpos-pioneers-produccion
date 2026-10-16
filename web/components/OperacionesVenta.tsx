'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { generarClaveVenta } from '@/lib/colaOfflineVentas';
import { useAuthStore } from '@/store/authStore';

type Venta = { id: number; numero: string; total: string; metodoPago: string; devueltoTotal: boolean; cuentaCredito?: { saldo: string }; detalles: { id: number; cantidad: number; producto: { nombre: string } }[]; operacionesCaja: { detalle: { lineas?: { detalleId: number; cantidad: number }[] } }[] };
type Cuenta = { id: number; pedidoId: number; saldo: string; vencimiento: string; pedido: { numero: string; cliente?: { nombre: string } } };
export default function OperacionesVenta({ onCambio }: { onCambio: () => void }) {
  const usuario = useAuthStore(s=>s.usuario);
  const clavePendiente = usuario ? `pos-operacion-pendiente:${usuario.empresaId}:${usuario.sucursalId}:${usuario.id}` : '';
  const [restaurado, setRestaurado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [id, setId] = useState('');
  const [venta, setVenta] = useState<Venta | null>(null);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [medio, setMedio] = useState('EFECTIVO');
  const [reponer, setReponer] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // Freeze uncertain requests so a retry cannot create a second refund or collection.
  const [pendiente, setPendiente] = useState<{ ruta: string; datos: object } | null>(null);
  useEffect(()=>{
    setRestaurado(false);
    if (!clavePendiente) return;
    try {
      const guardado = window.localStorage.getItem(clavePendiente);
      const solicitud = guardado ? JSON.parse(guardado) : null;
      if (solicitud && (!/^\/pedidos\/\d+\/(cobros-credito|devoluciones)$/.test(solicitud.ruta) || typeof solicitud.datos?.clave !== 'string')) throw new Error('Solicitud inválida');
      setPendiente(solicitud); setRestaurado(true);
    } catch { setMensaje('No se pudo recuperar el estado de las operaciones de este equipo. Verifica los últimos cobros antes de continuar.'); }
  }, [clavePendiente]);
  const error = (e: any) => setMensaje(e?.response?.data?.message || 'No se pudo confirmar. Conserva esta ventana y reintenta la misma operación.');
  const cargar = async () => { try { const { data } = await api.get('/pedidos/creditos'); setCuentas(data); } catch (e) { error(e); } };
  const buscar = async (numero?: number) => {
    if ((!numero && !id.trim()) || pendiente) return;
    setOcupado(true); setMensaje('');
    try { const { data } = numero ? await api.get(`/pedidos/${numero}`) : await api.get('/pedidos/consulta', { params: { numero: id.trim() } }); setVenta(data); setCantidades({}); setMonto(''); setMotivo(''); }
    catch (e) { error(e); } finally { setOcupado(false); }
  };
  const ejecutar = async (ruta: string, datos: object) => {
    if (ocupado || !restaurado) return;
    const solicitud = pendiente ?? { ruta, datos: { ...datos, clave: generarClaveVenta() } };
    try {
      const guardado = window.localStorage.getItem(clavePendiente);
      if (guardado) {
        const anterior = JSON.parse(guardado);
        if (!/^\/pedidos\/\d+\/(cobros-credito|devoluciones)$/.test(anterior.ruta) || typeof anterior.datos?.clave !== 'string') throw new Error('Solicitud inválida');
        if (anterior.datos.clave !== (solicitud.datos as { clave: string }).clave) {
          setPendiente(anterior); setMensaje('Otra ventana dejó una operación pendiente. Confírmala antes de registrar una nueva.'); return;
        }
      }
      window.localStorage.setItem(clavePendiente, JSON.stringify(solicitud));
    }
    catch { setMensaje('No se pudo respaldar la operación en este equipo. No se envió el cobro ni la devolución.'); return; }
    setPendiente(solicitud); setOcupado(true); setMensaje('');
    try {
      await api.post(solicitud.ruta, solicitud.datos);
      window.localStorage.removeItem(clavePendiente);
      setPendiente(null); setVenta(null); setMensaje('Operación registrada. La caja y los saldos fueron actualizados.');
      await cargar(); onCambio();
    } catch (e: any) { if (e?.response?.status >= 400 && e?.response?.status < 500) { try { window.localStorage.removeItem(clavePendiente); setPendiente(null); } catch { /* Keep the same key until storage becomes available. */ } } error(e); }
    finally { setOcupado(false); }
  };
  const devuelto = (detalleId: number) => venta?.operacionesCaja.reduce((s,o)=>s+(o.detalle?.lineas || []).filter(l=>l.detalleId===detalleId).reduce((n,l)=>n+l.cantidad,0),0) || 0;
  const estilo = 'rounded-lg border border-gray-700 bg-gray-950 p-2';
  return <section className="my-4 rounded-xl border border-gray-700 bg-gray-900 p-4 text-white">
    <button type="button" onClick={()=>{ setAbierto(!abierto); if (!abierto) void cargar(); }} className="font-semibold text-orange-300">Créditos y devoluciones {abierto ? '▴' : '▾'}</button>
    {abierto && <div className="mt-4 space-y-4">
      {mensaje && <p role="status" className="text-amber-200">{mensaje}</p>}
      {pendiente && <div className="rounded border border-amber-600 p-3"><p>Hay una operación pendiente de confirmar. El reintento conserva los mismos datos.</p><button disabled={ocupado} onClick={()=>ejecutar(pendiente.ruta, pendiente.datos)} className="mt-2 text-orange-300">Reintentar operación</button></div>}
      <fieldset disabled={!restaurado || ocupado || !!pendiente} className="space-y-4 disabled:opacity-50">
        <div className="flex flex-wrap gap-2"><input aria-label="Número de venta" placeholder="Número de venta del recibo" value={id} onChange={e=>setId(e.target.value)} className={estilo} /><button onClick={()=>buscar()} className="rounded bg-orange-600 px-3">Consultar venta</button></div>
        <div className="max-h-52 overflow-auto"><p className="mb-2 text-sm text-gray-400">Créditos pendientes · últimos 200 registros</p>{cuentas.filter(c=>Number(c.saldo)>0).map(c=><button key={c.id} onClick={()=>buscar(c.pedidoId)} className="block w-full border-b border-gray-800 p-2 text-left text-sm">{c.pedido.numero} · {c.pedido.cliente?.nombre} · Saldo {moneda(Number(c.saldo))} · Vence {c.vencimiento.slice(0,10)}</button>)}</div>
        {venta && <div className="space-y-3 border-t border-gray-700 pt-3">
          <p className="font-bold">{venta.numero} · ID {venta.id} · Total {moneda(Number(venta.total))}</p>
          <label>Medio del cobro o reembolso <select value={medio} onChange={e=>setMedio(e.target.value)} className={estilo}>{['EFECTIVO','TARJETA','TRANSFERENCIA','NEQUI','DAVIPLATA'].map(m=><option key={m}>{m}</option>)}</select></label>
          <label className="block">Referencia o motivo<input maxLength={250} value={motivo} onChange={e=>setMotivo(e.target.value)} className={`${estilo} ml-2`} /></label>
          {venta.cuentaCredito && Number(venta.cuentaCredito.saldo)>0 && <div className="flex flex-wrap items-center gap-2"><span>Saldo {moneda(Number(venta.cuentaCredito.saldo))}</span><input type="number" min="0.01" step="0.01" max={venta.cuentaCredito.saldo} aria-label="Monto del abono" value={monto} onChange={e=>setMonto(e.target.value)} className={estilo} /><button disabled={!motivo.trim() || !(Number(monto)>0)} onClick={()=>ejecutar(`/pedidos/${venta.id}/cobros-credito`,{monto:Number(monto),metodoPago:medio,referencia:motivo})} className="rounded bg-green-700 p-2">Registrar abono</button></div>}
          <p className="font-semibold">Devolver productos</p>
          {venta.detalles.map(d=><label key={d.id} className="flex items-center justify-between gap-2 text-sm">{d.producto.nombre} · Pendientes {d.cantidad-devuelto(d.id)}<input type="number" min="0" max={d.cantidad-devuelto(d.id)} aria-label={`Cantidad a devolver de ${d.producto.nombre}`} value={cantidades[d.id] ?? '0'} onChange={e=>setCantidades({...cantidades,[d.id]:e.target.value})} className={`${estilo} w-24`} /></label>)}
          <label className="flex gap-2"><input type="checkbox" checked={reponer} onChange={e=>setReponer(e.target.checked)} /> Reponer al inventario el consumo original de estos productos</label>
          <p className="text-xs text-gray-400">En crédito se reduce primero la deuda; solo se reembolsa el excedente pagado. Revisa cantidades y medio antes de confirmar.</p>
          <button disabled={venta.devueltoTotal || !motivo.trim() || !Object.values(cantidades).some(n=>Number(n)>0)} onClick={()=>ejecutar(`/pedidos/${venta.id}/devoluciones`,{metodoPago:medio,motivo,reponer,items:venta.detalles.filter(d=>Number(cantidades[d.id])>0).map(d=>({detalleId:d.id,cantidad:Number(cantidades[d.id])}))})} className="rounded bg-red-700 p-2">Confirmar devolución y reembolso</button>
        </div>}
      </fieldset>
    </div>}
  </section>;
}
