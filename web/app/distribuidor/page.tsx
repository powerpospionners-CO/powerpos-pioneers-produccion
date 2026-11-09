'use client';
import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';
import { useNotificar } from '@/components/Notificaciones';
import api from '@/lib/api';
import { useBorradorVenta, useCampoBorrador } from '@/lib/useBorradorVenta';
import { generarClaveVenta } from '@/lib/colaOfflineVentas';
import { moneda } from '@/lib/formato';
import { Ban, List, Minus, Pencil, Plus, Search, Trash2, Truck, X } from 'lucide-react';

type Presentacion = { id: number; nombre: string; precio: string; factorUnidades: number };
type Producto = {
  id: number; nombre: string; precio: string; codigoBarras?: string | null;
  disponible: boolean; ventaGranel?: boolean;
  categoria: { nombre: string };
  presentaciones?: Presentacion[];
};
type ItemCarrito = { key: string; productoId: number; presentacionId: number | null; nombre: string; precio: number; cantidad: number };
type Pedido = {
  id: number; numero: string; estado: string; total: string; comisionMonto: string; comisionPorcentaje: string;
  modalidad?: string; revision?: number; estadoGestion?: string; saldoPendiente?: number; entregado?: boolean; comisionDisponible?: boolean;
  liquidacionId: number | null; clienteReferencia: string | null; creadoEn: string;
};
type DetallePedido = Pedido & { detalles: { id: number; productoId: number; presentacionId: number | null; cantidad: number; precioUnitario: string; subtotal: string; presentacionNombre: string | null; producto: { nombre: string } }[] };

export default function DistribuidorPage() {
  const { usuario } = useAuthStore();
  const { aviso, confirmar } = useNotificar();
  const permitido = usuario?.rol === 'DISTRIBUIDOR';

  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<{ id: number; nombre: string; documento: string | null }[]>([]);
  const [errorClientes, setErrorClientes] = useState('');
  const [cantidadesEditadas, setCantidadesEditadas] = useState<Record<string, string>>({});
  const [busqueda, setBusqueda] = useState('');
  const borrador = useBorradorVenta('distribuidor', { carrito: [] as ItemCarrito[], clienteReferencia: '', modalidad: 'PAGO_ANTES', solicitud: null as Record<string, any> | null, edicion: null as { id: number; numero: string; revision: number; precios?: Record<string, number>; comisionPorcentaje?: number } | null });
  const [edicion, setEdicion] = useCampoBorrador(borrador, 'edicion');
  const [carrito, setCarrito] = useCampoBorrador(borrador, 'carrito');
  const [modalidad, setModalidad] = useCampoBorrador(borrador, 'modalidad');
  const [compatible, setCompatible] = useState(false);
  const [clienteReferencia, setClienteReferencia] = useCampoBorrador(borrador, 'clienteReferencia');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [detalle, setDetalle] = useState<DetallePedido | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);

  useEffect(() => {
    if (!permitido) return;
    api.get('/productos').then((r) => setProductos(r.data)).catch(() => undefined);
    void cargarClientes();
    api.get('/pedidos-distribuidor/modalidades').then(r=>setCompatible(r.data.flujoCaja===true)).catch(()=>setCompatible(false));
    void cargarPedidos();
    const timer=setInterval(()=>{void cargarPedidos();api.get('/pedidos-distribuidor/modalidades').then(r=>setCompatible(r.data.flujoCaja===true)).catch(()=>setCompatible(false));},5000);
    return ()=>clearInterval(timer);
  }, [permitido]);

  const cargarClientes = async () => {
    setErrorClientes('');
    try {
      const { data } = await api.get('/clientes/para-distribuidor');
      setClientes(data);
    } catch {
      setErrorClientes('No se pudieron cargar los clientes.');
    }
  };

  const cargarPedidos = async () => {
    try {
      const { data } = await api.get('/pedidos-distribuidor');
      setPedidos(data);
    } catch { /* silencioso */ }
  };

  // El catálogo del distribuidor son los mismos productos y precios que
  // cualquier venta normal — no se incluye venta al granel (pesaje) porque
  // este flujo es para pedidos armados por cantidades, no para pesar.
  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    return productos
      .filter((p) => p.disponible && !p.ventaGranel)
      .filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigoBarras || '').includes(q))
      .slice(0, 15);
  }, [productos, busqueda]);

  const agregar = (producto: Producto, presentacion: Presentacion | null) => {
    const key = `${producto.id}:${presentacion?.id ?? 'base'}`;
    setCarrito((actual) => {
      const existe = actual.find((l) => l.key === key);
      if (existe) return actual.map((l) => (l.key === key ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...actual, {
        key, productoId: producto.id, presentacionId: presentacion?.id ?? null,
        nombre: presentacion ? `${producto.nombre} — ${presentacion.nombre}` : producto.nombre,
        precio: edicion?.precios?.[key] ?? Number(presentacion ? presentacion.precio : producto.precio),
        cantidad: 1,
      }];
    });
  };

  const cambiarCantidad = (key: string, cantidad: number) => {
    setCantidadesEditadas(actual => { const nuevo = { ...actual }; delete nuevo[key]; return nuevo; });
    setCarrito((actual) => actual.map((l) => (l.key === key ? { ...l, cantidad: Math.max(1, Math.min(9999, Math.floor(cantidad) || 1)) } : l)));
  };

  const quitar = (key: string) => setCarrito((actual) => actual.filter((l) => l.key !== key));

  const total = carrito.reduce((acc, l) => acc + l.precio * l.cantidad, 0);
  const comisionEstimada = total * (edicion?.comisionPorcentaje ?? usuario?.distribuidorComision ?? 0) / 100;

  const registrarPedido = async () => {
    if (!carrito.length || !compatible || enviando) return;
    setEnviando(true);
    setError('');
    try {
      const datos = borrador.almacen.getSnapshot().datos.solicitud ?? {
        items: carrito.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: l.cantidad })),
        clienteReferencia: clienteReferencia || undefined,
        ...(edicion ? { revision: edicion.revision, pedidoEdicionId: edicion.id } : {}),
        modalidad, clave: generarClaveVenta(),
      };
      borrador.almacen.set('solicitud', datos);
      if(borrador.almacen.getSnapshot().error)throw new Error(borrador.almacen.getSnapshot().error);
      if (datos.pedidoEdicionId) await api.patch(`/pedidos-distribuidor/${datos.pedidoEdicionId}`, datos);
      else await api.post('/pedidos-distribuidor',datos);
      borrador.almacen.reiniciar();
      setCarrito([]);
      setCantidadesEditadas({});
      setClienteReferencia('');
      aviso(datos.pedidoEdicionId ? 'Pedido actualizado. La cajera verá la corrección.' : 'Pedido enviado a la cajera. La mercancía queda pendiente de retiro.', 'exito');
      await cargarPedidos();
    } catch (e: any) {
      if(e?.response?.status>=400 && e?.response?.status<500)borrador.almacen.set('solicitud',null);
      setError(e?.response?.data?.message || e.message || 'No se pudo confirmar el pedido. Reintenta la misma solicitud.');
    } finally {
      setEnviando(false);
    }
  };

  const verDetalle = async (pedido: Pedido) => {
    setCargandoDetalle(true);
    try {
      const { data } = await api.get(`/pedidos-distribuidor/${pedido.id}`);
      setDetalle(data);
    } catch {
      aviso('No se pudo cargar el detalle de ese pedido.', 'error');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const anular = async (pedido: Pedido) => {
    if (!(await confirmar(`¿Cancelar el pedido ${pedido.numero} que está pendiente de retiro?`, { titulo: 'Cancelar pedido', textoConfirmar: 'Cancelar pedido', peligroso: true }))) return;
    setAnulandoId(pedido.id);
    try {
      await api.patch(`/pedidos-distribuidor/${pedido.id}/anular`);
      if (edicion?.id === pedido.id) { borrador.almacen.reiniciar(); setCantidadesEditadas({}); }
      aviso('Pedido cancelado.', 'exito');
      await cargarPedidos();
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo anular el pedido.', 'error');
    } finally {
      setAnulandoId(null);
    }
  };

  const editarPedido = async (pedido: Pedido) => {
    if (enviando || borrador.datos.solicitud) return;
    if (carrito.length && !await confirmar('¿Reemplazar los productos que estás preparando por los de este pedido?', { titulo: 'Editar pedido', textoConfirmar: 'Abrir pedido' })) return;
    setEnviando(true);
    try {
      const { data } = await api.get<DetallePedido>(`/pedidos-distribuidor/${pedido.id}`);
      if (data.estadoGestion !== 'PENDIENTE_RETIRO') { aviso('Este pedido ya no está pendiente de retiro. Actualiza la lista.', 'error'); await cargarPedidos(); return; }
      borrador.almacen.reiniciar();
      setCarrito(data.detalles.map(d => ({ key: `${d.productoId}:${d.presentacionId ?? 'base'}`, productoId: d.productoId, presentacionId: d.presentacionId, cantidad: d.cantidad, precio: Number(d.precioUnitario), nombre: d.producto.nombre + (d.presentacionNombre ? ` — ${d.presentacionNombre}` : '') })));
      setClienteReferencia(data.clienteReferencia || '');
      setModalidad(data.modalidad || 'PAGO_ANTES');
      setEdicion({ id: data.id, numero: data.numero, revision: data.revision ?? 0, precios: Object.fromEntries(data.detalles.map(d => [`${d.productoId}:${d.presentacionId ?? 'base'}`, Number(d.precioUnitario)])), comisionPorcentaje: Number(data.comisionPorcentaje) });
      setCantidadesEditadas({}); setError(''); setBusqueda('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { aviso('No se pudo abrir el pedido para editar.', 'error'); }
    finally { setEnviando(false); }
  };

  if (!permitido) {
    return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar /><div className="p-8 text-center text-gray-400">No tienes acceso a esta sección.</div></main></AuthGuard>;
  }

  const comisionPendiente = pedidos.filter((p) => p.comisionDisponible && !p.liquidacionId).reduce((acc, p) => acc + Number(p.comisionMonto), 0);
  const comisionLiquidada = pedidos.filter((p) => p.liquidacionId).reduce((acc, p) => acc + Number(p.comisionMonto), 0);

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">Portal de distribuidor</p>
            <h1 className="mt-1 text-3xl font-bold">Hola, {usuario?.nombre}</h1>
            <p className="mt-1 text-sm text-gray-400">Código {usuario?.distribuidorCodigo} · Comisión {usuario?.distribuidorComision}% sobre cada pedido</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-sm text-gray-400">Comisión de pedidos pagados pendiente de liquidar</p>
              <p className="mt-1 text-2xl font-bold text-orange-500">{moneda(comisionPendiente)}</p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <p className="text-sm text-gray-400">Comisión ya liquidada</p>
              <p className="mt-1 text-2xl font-bold text-green-400">{moneda(comisionLiquidada)}</p>
            </div>
          </div>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Truck size={18} className="text-orange-500" /> {edicion ? `Editar pedido ${edicion.numero}` : 'Registrar pedido'}</h2>
            {edicion && <div className="mb-3 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-200">
              Puedes corregir productos, cantidades, cliente y modalidad antes del retiro. Los productos existentes conservan su precio; los nuevos usan el precio del catálogo.
              <button type="button" disabled={enviando || !!borrador.datos.solicitud} onClick={() => { borrador.almacen.reiniciar(); setCantidadesEditadas({}); setError(''); }} className="mt-2 block underline">Salir de edición</button>
            </div>}
            {error && <div role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

            {borrador.error && <p role="alert" className="mb-3 text-red-300">{borrador.error}</p>}
            {!compatible && <p className="mb-3 text-amber-200">Esperando conexión con caja. Actualiza la aplicación si el aviso continúa.</p>}
            {!!borrador.datos.solicitud && <div className="mb-3 text-amber-200">Hay un pedido pendiente de confirmar. Reintentarlo conserva la misma clave y evita duplicarlo.<button type="button" disabled={enviando} onClick={registrarPedido} className="ml-3 underline">Reintentar pedido</button></div>}
            <fieldset disabled={enviando || !!borrador.datos.solicitud}>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Busca un producto por nombre o código de barras"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-9 pr-3 text-white"
              />
              {resultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
                  {resultados.map((p) => (
                    <div key={p.id} className="border-b border-gray-700 p-2 last:border-0">
                      {p.presentaciones && p.presentaciones.length > 0 ? (
                        <>
                          <button type="button" onClick={() => { agregar(p, null); setBusqueda(''); }} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-gray-700">
                            <span>{p.nombre}</span><span className="text-orange-400">{moneda(Number(p.precio))}</span>
                          </button>
                          {p.presentaciones.map((pr) => (
                            <button key={pr.id} type="button" onClick={() => { agregar(p, pr); setBusqueda(''); }} className="flex w-full items-center justify-between rounded px-2 py-1.5 pl-5 text-left text-sm text-gray-300 hover:bg-gray-700">
                              <span>— {pr.nombre}</span><span className="text-orange-400">{moneda(Number(pr.precio))}</span>
                            </button>
                          ))}
                        </>
                      ) : (
                        <button type="button" onClick={() => { agregar(p, null); setBusqueda(''); }} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-gray-700">
                          <span>{p.nombre}</span><span className="text-orange-400">{moneda(Number(p.precio))}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {!carrito.length && <p className="py-4 text-center text-sm text-gray-500">Busca productos arriba para armar el pedido.</p>}
              {carrito.map((l) => (
                <div key={l.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{l.nombre}</p>
                    <p className="text-xs text-gray-500">{moneda(l.precio)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Reducir cantidad de ${l.nombre}`} disabled={l.cantidad <= 1} onClick={() => cambiarCantidad(l.key, l.cantidad - 1)} className="h-10 w-10 rounded-lg bg-gray-800 disabled:opacity-40"><Minus size={18} className="mx-auto" /></button>
                    <input aria-label={`Cantidad de ${l.nombre}`} type="number" inputMode="numeric" min={1} max={9999} step={1} value={cantidadesEditadas[l.key] ?? l.cantidad} onFocus={e => e.target.select()} onChange={e => {
                      if (e.target.value === '') { setCantidadesEditadas(actual => ({ ...actual, [l.key]: '' })); return; }
                      cambiarCantidad(l.key, Number(e.target.value));
                    }} onBlur={() => cambiarCantidad(l.key, l.cantidad)} className="h-10 w-16 rounded-lg border border-gray-700 bg-gray-800 text-center text-white" />
                    <button type="button" aria-label={`Aumentar cantidad de ${l.nombre}`} disabled={l.cantidad >= 9999} onClick={() => cambiarCantidad(l.key, l.cantidad + 1)} className="h-10 w-10 rounded-lg bg-gray-800 disabled:opacity-40"><Plus size={18} className="mx-auto" /></button>
                  </div>
                  <span className="w-24 shrink-0 text-right font-semibold text-white">{moneda(l.precio * l.cantidad)}</span>
                  <button type="button" onClick={() => quitar(l.key)} className="text-gray-500 hover:text-red-400"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>

            {carrito.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-gray-800 pt-4">
                <label className="block text-sm text-gray-300">Modalidad de retiro<select aria-label="Modalidad de retiro" value={modalidad} onChange={e=>setModalidad(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-3"><option value="PAGO_ANTES">Pagar antes de retirar la mercancía</option><option value="COBRO_POSTERIOR">Retirar y entregar el dinero después</option></select></label><p className="text-xs text-gray-400">La cajera confirmará la salida de la mercancía. La disponibilidad se verifica al retirar. La comisión se liquida aparte cuando el pedido esté pagado.</p>
                <label className="block text-sm text-gray-300">Cliente registrado
                  <select aria-label="Cliente registrado" value={clientes.find(c => `${c.nombre}${c.documento ? ` · ${c.documento}` : ''}`.slice(0,180) === clienteReferencia)?.id ?? ''} onChange={e => {
                    const cliente = clientes.find(c => c.id === Number(e.target.value));
                    setClienteReferencia(cliente ? `${cliente.nombre}${cliente.documento ? ` · ${cliente.documento}` : ''}`.slice(0,180) : '');
                  }} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-3">
                    <option value="">Seleccionar cliente (opcional)</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.documento ? ` · ${c.documento}` : ''}</option>)}
                  </select>
                </label>
                {errorClientes && <p role="alert" className="text-sm text-red-300">{errorClientes} <button type="button" onClick={() => void cargarClientes()} className="underline">Reintentar</button></p>}
                <input aria-label="Cliente o referencia" maxLength={180} value={clienteReferencia} onChange={(e) => setClienteReferencia(e.target.value)} placeholder="Cliente o referencia (opcional)" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span>Total del pedido</span><span className="text-lg font-bold text-white">{moneda(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span>Tu comisión estimada</span><span className="font-semibold text-orange-400">{moneda(comisionEstimada)}</span>
                </div>
                <button type="button" onClick={registrarPedido} disabled={enviando || !compatible} className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                  <Plus size={18} /> {enviando ? 'Guardando…' : edicion ? 'Guardar cambios del pedido' : 'Enviar pedido a caja'}
                </button>
              </div>
            )}
            </fieldset>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="mb-3 text-lg font-bold">Mis pedidos</h2>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-800 text-gray-400"><tr><th className="pb-2">Pedido</th><th className="pb-2">Fecha</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">Comisión</th><th className="pb-2 text-center">Estado</th><th className="pb-2 text-right">Acciones</th></tr></thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={p.id} className={`border-b border-gray-800 ${p.estado === 'ANULADO' ? 'opacity-40' : ''}`}>
                      <td className="py-2">{p.numero}</td>
                      <td className="py-2 text-gray-400">{new Date(p.creadoEn).toLocaleDateString('es-CO')}</td>
                      <td className="py-2 text-right">{moneda(Number(p.total))}</td>
                      <td className="py-2 text-right text-orange-400">{moneda(Number(p.comisionMonto))}</td>
                      <td className="py-2 text-center text-xs">
                        {p.estadoGestion?.replaceAll('_',' ') || p.estado}{p.saldoPendiente!=null && <p className="mt-1 text-amber-200">Por entregar a caja: {moneda(p.saldoPendiente)}</p>}
                      </td>
                      <td className="py-2 text-right">
                        <span className="inline-flex gap-2">
                          <button type="button" title="Ver productos" onClick={() => verDetalle(p)} className="text-gray-500 hover:text-blue-400"><List size={14} /></button>
                          {p.estadoGestion === 'PENDIENTE_RETIRO' && !p.liquidacionId && (
                            <>
                              <button type="button" title="Editar pedido" aria-label={`Editar pedido ${p.numero}`} disabled={enviando || !!borrador.datos.solicitud || anulandoId !== null} onClick={() => void editarPedido(p)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300 disabled:opacity-40"><Pencil size={17} /></button>
                              <button type="button" title="Cancelar pedido" aria-label={`Cancelar pedido ${p.numero}`} disabled={enviando || !!borrador.datos.solicitud || anulandoId !== null} onClick={() => anular(p)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 disabled:opacity-40"><Ban size={17} /></button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!pedidos.length && <p className="py-6 text-center text-gray-500">Aún no has registrado pedidos.</p>}
            </div>
          </section>
        </div>

        {(detalle || cargandoDetalle) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Productos de {detalle?.numero || ''}</h3>
                <button type="button" onClick={() => setDetalle(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>
              {cargandoDetalle && <p className="py-10 text-center text-gray-500">Cargando…</p>}
              {detalle && !cargandoDetalle && (
                <div className="space-y-2">
                  {detalle.detalles.map((d) => (
                    <div key={d.id} className="rounded-lg border border-gray-800 p-3 text-sm">
                      <div className="flex justify-between text-gray-200">
                        <span>{d.cantidad}x {d.producto.nombre}{d.presentacionNombre ? ` — ${d.presentacionNombre}` : ''}</span>
                        <strong className="text-white">{moneda(Number(d.subtotal))}</strong>
                      </div>
                      <p className="text-xs text-gray-500">{moneda(Number(d.precioUnitario))} c/u</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
