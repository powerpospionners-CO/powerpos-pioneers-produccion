'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
type Linea = { productoId: string; cantidad: string; costoUnitario: string };
type Orden = { id: number; referencia: string; descripcion: string; estado: string; sucursalId: number; proveedorId: number; detalles: { id: number; nombre: string; cantidad: number; recibida: number; costoUnitario: string }[]; recepciones: { id: number; compraId: number }[] };
const campo = 'block w-full rounded border border-gray-700 bg-gray-950 p-2';
const boton = 'rounded bg-orange-600 px-3 py-2 disabled:opacity-50';
export default function OrdenesCompra() {
  const usuario = useAuthStore(s => s.usuario);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [productos, setProductos] = useState<{ id: number; nombre: string; controlaStock: boolean; esCombo: boolean; activo: boolean }[]>([]);
  const [proveedores, setProveedores] = useState<{ id: number; nombre: string; activo: boolean }[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([{ productoId: '', cantidad: '1', costoUnitario: '' }]);
  const [error, setError] = useState(''); const [aviso, setAviso] = useState(''); const [busy, setBusy] = useState(false);
  const bloqueo = useRef(false); const claves = useRef<Record<number,string>>({});
  const cargar = useCallback(async () => { const [o,p,v] = await Promise.all([api.get<Orden[]>('/administracion/ordenes'), api.get('/productos'), api.get('/administracion/proveedores')]); setOrdenes(o.data); setProductos(p.data.filter((p: {controlaStock: boolean; esCombo: boolean; activo: boolean}) => p.controlaStock && !p.esCombo && p.activo)); setProveedores(v.data.filter((p: {activo: boolean}) => p.activo)); }, []);
  useEffect(() => { cargar().catch(() => setError('No se pudieron cargar las órdenes.')); }, [cargar]);
  async function ejecutar(tarea: () => Promise<unknown>, mensaje: string) {
    if (bloqueo.current) return; bloqueo.current = true; setBusy(true); setError(''); setAviso('');
    try { await tarea(); setAviso(mensaje); await cargar(); } catch (e) { setError(axios.isAxiosError(e) ? String(e.response?.data?.message || 'No se pudo completar. Actualiza la lista antes de repetir si perdiste la conexión.') : 'No se pudo completar.'); }
    finally { bloqueo.current = false; setBusy(false); }
  }
  function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    void ejecutar(async () => { await api.post('/administracion/ordenes', { referencia: f.get('referencia'), descripcion: f.get('descripcion'), proveedorId: Number(f.get('proveedorId')), sucursalId: usuario?.sucursalId, items: lineas.map(l => ({ productoId: Number(l.productoId), cantidad: Number(l.cantidad), costoUnitario: Number(l.costoUnitario) })) }); form.reset(); setLineas([{ productoId: '', cantidad: '1', costoUnitario: '' }]); }, 'Orden registrada, pendiente de aprobación.');
  }
  function recibir(e: FormEvent<HTMLFormElement>, o: Orden) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const items = o.detalles.map(d => ({ detalleId: d.id, cantidad: Number(f.get(`cantidad-${d.id}`)) })).filter(i => i.cantidad > 0);
    if (!items.length) { setError('Indica las cantidades recibidas.'); return; }
    const clave = claves.current[o.id] ||= crypto.randomUUID();
    void ejecutar(async () => { await api.post(`/administracion/ordenes/${o.id}/recibir`, { clave, items, condicionPago: f.get('condicionPago'), documento: f.get('documento'), vencimiento: f.get('vencimiento') || undefined }); delete claves.current[o.id]; form.reset(); }, 'Recepción registrada: inventario y compra actualizados.');
  }
  return <section className="space-y-4">
    <h2 className="text-lg font-semibold">Órdenes de compra</h2>
    <p className="text-sm text-gray-400">Crear y aprobar no mueve inventario ni dinero. Solo la recepción registra la compra y las existencias recibidas. Cantidades y costos por unidad base del inventario (gramos/ml para granel). Últimas 100 órdenes.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}{aviso && <p role="status" className="text-green-400">{aviso}</p>}
    <button type="button" disabled={busy} className={boton} onClick={() => void ejecutar(cargar, 'Lista actualizada.')}>Actualizar</button>
    <form onSubmit={crear} className="space-y-3 rounded-xl border border-gray-800 p-4">
      <fieldset disabled={busy} className="space-y-3">
        <legend className="font-semibold">Nueva orden para la sucursal principal</legend>
        <label>Referencia única<input name="referencia" required maxLength={100} className={campo} /></label>
        <label>Descripción<input name="descripcion" required maxLength={250} className={campo} /></label>
        <label>Proveedor<select name="proveedorId" required className={campo}><option value="">Selecciona</option>{proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
        {lineas.map((l,i) => <div key={i} className="grid gap-2 md:grid-cols-4">
          <label>Producto<select required className={campo} value={l.productoId} onChange={e => setLineas(ls => ls.map((x,j) => j === i ? {...x, productoId: e.target.value} : x))}><option value="">Selecciona</option>{productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label>Cantidad base<input required type="number" min="1" step="1" max="1000000" className={campo} value={l.cantidad} onChange={e => setLineas(ls => ls.map((x,j) => j === i ? {...x, cantidad: e.target.value} : x))} /></label>
          <label>Costo por unidad base<input required type="number" min="0.01" step="0.01" className={campo} value={l.costoUnitario} onChange={e => setLineas(ls => ls.map((x,j) => j === i ? {...x, costoUnitario: e.target.value} : x))} /></label>
          <button type="button" disabled={lineas.length === 1} onClick={() => setLineas(ls => ls.filter((_,j) => j !== i))}>Quitar</button>
        </div>)}
        <button type="button" disabled={lineas.length >= 100} onClick={() => setLineas(ls => [...ls, { productoId: '', cantidad: '1', costoUnitario: '' }])}>Agregar producto</button>
        <button className={`${boton} ml-3`}>Crear orden</button>
      </fieldset>
    </form>
    {ordenes.map(o => <article key={o.id} className="space-y-3 rounded-xl border border-gray-800 p-4">
      <h3 className="font-semibold">{o.referencia} · {o.estado}</h3><p>{o.descripcion}</p>
      {o.detalles.map(d => <p key={d.id}>{d.nombre}: {d.recibida} de {d.cantidad} recibidas · costo base ${Number(d.costoUnitario).toLocaleString('es-CO')}</p>)}
      {usuario?.rol === 'ADMIN_EMPRESA' && ['PENDIENTE','APROBADA','PARCIAL'].includes(o.estado) && <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const aprobar = f.get('decision') === 'aprobar'; void ejecutar(() => api.post(`/administracion/ordenes/${o.id}/resolver`, { aprobar, motivo: f.get('motivo') }), aprobar ? 'Orden aprobada.' : 'Pendiente cerrado; lo recibido se conserva.'); }} className="flex flex-wrap gap-2">
        <select name="decision" className="rounded bg-gray-800 p-2">{o.estado === 'PENDIENTE' && <option value="aprobar">Aprobar</option>}<option value="cerrar">Cerrar pendiente</option></select>
        <input required name="motivo" maxLength={250} placeholder="Motivo de la decisión" className="rounded bg-gray-800 p-2" aria-label="Motivo de la decisión" /><button disabled={busy} className={boton}>Confirmar decisión</button>
      </form>}
      {['APROBADA','PARCIAL'].includes(o.estado) && <form onSubmit={e => recibir(e,o)}><fieldset disabled={busy} className="space-y-3"><legend>Registrar recepción parcial o total</legend>
        {o.detalles.filter(d => d.recibida < d.cantidad).map(d => <label key={d.id} className="block">{d.nombre} · pendientes {d.cantidad - d.recibida}<input name={`cantidad-${d.id}`} type="number" min="0" max={d.cantidad - d.recibida} step="1" defaultValue="0" className={campo} /></label>)}
        <label>Condición de pago<select name="condicionPago" className={campo}><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></select></label>
        <label>Referencia del proveedor y factura (obligatoria a crédito)<input name="documento" maxLength={100} className={campo} /></label>
        <label>Vencimiento (obligatorio a crédito)<input name="vencimiento" type="date" className={campo} /></label><button className={boton}>Registrar lo recibido</button>
      </fieldset></form>}
      {!!o.recepciones.length && <p className="text-sm text-gray-400">Compras registradas: {o.recepciones.map(r => `#${r.compraId}`).join(', ')}. Consultar su detalle en Compras.</p>}
    </article>)}
    {!ordenes.length && <p>No hay órdenes registradas.</p>}
  </section>;
}
