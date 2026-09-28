'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Minus, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import CajaControl from '@/components/CajaControl';
import ModalCobro, { PagoConfirmado } from '@/components/ModalCobro';
import VentasTurno from '@/components/VentasTurno';
import VentasPendientes from '@/components/VentasPendientes';
import { moneda } from '@/lib/formato';
import { useAuthStore } from '@/store/authStore';

type Producto = {
  id: number; nombre: string; precio: string; codigoBarras?: string | null;
  disponible: boolean; controlaStock: boolean; stockActual: number; stockMinimo: number;
  categoria: { id: number; nombre: string; icono?: string; parentId?: number | null };
};
type Linea = { producto: Producto; cantidad: number };
type Caja = { id: number; usuarioId: number; usuario?: { nombre: string }; montoInicial: string; totalVentas?: number; totalEfectivo?: number; totalEsperado?: number };

export default function RetailPOS() {
  const usuario = useAuthStore((state) => state.usuario);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [modalCobroAbierto, setModalCobroAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ultimoRecibo, setUltimoRecibo] = useState<any>(null);
  const buscarRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    const [p, cajaRes] = await Promise.allSettled([
      api.get('/productos'), api.get('/caja/abierta'),
    ]);
    if (p.status === 'fulfilled') setProductos(p.value.data);
    setCaja(cajaRes.status === 'fulfilled' ? cajaRes.value.data : null);
    if (p.status === 'rejected') setError('No se pudo cargar el catálogo de productos.');
  };

  useEffect(() => { void cargar(); }, []);

  // Con existencias en 0 el producto no debe encontrarse ni por nombre ni
  // por código: hay que reponer stock en Inventario antes de que vuelva a
  // aparecer aquí.
  const conStock = useMemo(() => productos.filter((producto) => producto.disponible && !(producto.controlaStock && producto.stockActual <= 0)), [productos]);

  const termino = busqueda.trim().toLocaleLowerCase('es-CO');
  const visible = useMemo(() => {
    if (!termino) return conStock;
    return conStock.filter((producto) =>
      producto.nombre.toLocaleLowerCase('es-CO').includes(termino) || producto.codigoBarras?.toLocaleLowerCase('es-CO').includes(termino),
    );
  }, [conStock, termino]);

  const cantidadEnCarrito = (id: number) => carrito.find((linea) => linea.producto.id === id)?.cantidad || 0;
  const agregar = (producto: Producto) => {
    setError('');
    if (producto.controlaStock && cantidadEnCarrito(producto.id) >= producto.stockActual) {
      setError(`No hay más existencias de ${producto.nombre}.`);
      return;
    }
    setCarrito((actual) => {
      const existente = actual.find((linea) => linea.producto.id === producto.id);
      return existente
        ? actual.map((linea) => linea.producto.id === producto.id ? { ...linea, cantidad: linea.cantidad + 1 } : linea)
        : [...actual, { producto, cantidad: 1 }];
    });
    setBusqueda('');
    buscarRef.current?.focus();
  };
  const cambiarCantidad = (producto: Producto, cambio: number) => {
    if (cambio > 0) { agregar(producto); return; }
    setCarrito((actual) => actual.map((linea) => linea.producto.id === producto.id ? { ...linea, cantidad: linea.cantidad - 1 } : linea).filter((linea) => linea.cantidad > 0));
  };
  const escanear = (event: React.FormEvent) => {
    event.preventDefault();
    const codigo = busqueda.trim();
    const exacto = productos.find((producto) => producto.disponible && producto.codigoBarras === codigo);
    if (exacto) agregar(exacto);
    else if (codigo) setError('No se encontró un producto con ese código. Puedes buscarlo por nombre.');
  };

  const total = carrito.reduce((suma, linea) => suma + Number(linea.producto.precio) * linea.cantidad, 0);
  const cajaDeOtro = !!caja && !!usuario && caja.usuarioId !== usuario.id && !['ADMIN_EMPRESA', 'GERENTE'].includes(usuario.rol);
  const vender = async (pago: PagoConfirmado) => {
    if (!carrito.length || !caja || cajaDeOtro || procesando) return;
    setProcesando(true); setError(''); setAviso('');
    try {
      const { data } = await api.post('/pedidos', {
        sucursalId: usuario?.sucursalId,
        metodoPago: pago.metodoPago,
        pagos: pago.pagos,
        items: carrito.map(({ producto, cantidad }) => ({ productoId: producto.id, cantidad })),
      });
      setCarrito([]);
      setUltimoRecibo(data);
      setModalCobroAbierto(false);
      setAviso(`Venta ${data.numero} registrada · ${moneda(Number(data.total))}`);
      await cargar();
      try {
        const impresion = await api.post('/impresion/ticket', data);
        if (!impresion.data?.impreso) setAviso(`Venta ${data.numero} registrada. Puedes imprimir el recibo desde esta pantalla.`);
        if (pago.metodoPago === 'EFECTIVO' || pago.pagos.some((p) => p.metodoPago === 'EFECTIVO')) void api.post('/impresion/abrir-cajon').catch(() => undefined);
      } catch { setAviso(`Venta ${data.numero} registrada. Puedes imprimir el recibo desde esta pantalla.`); }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo registrar la venta.');
    } finally { setProcesando(false); buscarRef.current?.focus(); }
  };

  const imprimirRecibo = () => {
    if (!ultimoRecibo) return;
    const ventana = window.open('', '_blank', 'width=420,height=700');
    if (!ventana) { setError('El navegador bloqueó la ventana del recibo. Permite ventanas emergentes para imprimir.'); return; }
    const pagos = Array.isArray(ultimoRecibo.pagos) && ultimoRecibo.pagos.length > 1
      ? ultimoRecibo.pagos.map((p: any) => `PAGO ${p.metodoPago}  ${moneda(Number(p.monto))}`)
      : [`PAGO  ${ultimoRecibo.metodoPago}`];
    const lineas = [usuario?.empresa || 'PowerPOS', `VENTA ${ultimoRecibo.numero}`, new Date().toLocaleString('es-CO'), '--------------------------------',
      ...(ultimoRecibo.detalles || []).map((d: any) => `${d.cantidad} × ${d.producto?.nombre || 'Producto'}   ${moneda(Number(d.subtotal))}`),
      '--------------------------------', `TOTAL  ${moneda(Number(ultimoRecibo.total))}`, ...pagos, 'Gracias por su compra'];
    const pre = ventana.document.createElement('pre');
    pre.style.cssText = 'font:14px/1.5 monospace;white-space:pre-wrap;padding:20px;';
    pre.textContent = lineas.join('\n');
    ventana.document.body.appendChild(pre);
    ventana.print();
  };

  const titulo = usuario?.tipoNegocio === 'SUPERMERCADO' ? 'Caja de supermercado' : usuario?.tipoNegocio === 'TIENDA' ? 'Caja de tienda' : 'Punto de venta comercial';
  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar />
    <CajaControl caja={caja} cajaBloqueadaPorUsuario={cajaDeOtro} onCambio={cargar} />
    {cajaDeOtro && <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm font-medium text-red-200">Caja asignada a {caja?.usuario?.nombre || 'otro cajero'}. Solo esa persona o un administrador puede vender.</div>}
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">Venta rápida</p><h1 className="mt-1 text-3xl font-bold">{titulo}</h1><p className="mt-1 text-sm text-gray-400">Escanea el código de barras para agregar de una, o escribe el nombre y selecciona el producto.</p></div>
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}
      {aviso && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-400"><span>{aviso}</span>{ultimoRecibo && <button type="button" onClick={imprimirRecibo} className="rounded-lg border border-green-500/40 px-3 py-1 text-sm">Imprimir último recibo</button>}</div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="lg:col-span-2"><VentasPendientes
          clave={usuario ? `pos-pendientes:comercio:${usuario.empresaId}:${usuario.sucursalId}:${usuario.id}` : null}
          datos={{ carrito }} total={total} vacia={!carrito.length} bloqueado={procesando || !caja || cajaDeOtro}
          onGuardar={() => { setCarrito([]); setBusqueda(''); setAviso('Venta guardada. Ya puedes atender a otro cliente.'); buscarRef.current?.focus(); }}
          onRestaurar={(venta) => { setCarrito(venta.carrito); setError(''); setAviso('Venta recuperada. Revisa los productos y pulsa Cobrar.'); }}
        /></div>
        <section className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <form onSubmit={escanear} className="mb-4 flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3"><Barcode className="text-orange-500" size={23} /><input ref={buscarRef} value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setError(''); }} placeholder="Código de barras o nombre del producto" aria-label="Código de barras o nombre del producto" className="min-w-0 flex-1 bg-transparent text-white outline-none" /><button type="submit" aria-label="Buscar código" className="text-gray-400 hover:text-orange-500"><Search size={20} /></button></form>
          {termino ? (
            <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              {visible.map((producto) => (
                <button
                  key={producto.id}
                  disabled={!caja || cajaDeOtro}
                  onClick={() => agregar(producto)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 p-3 text-left transition hover:border-orange-500/60 disabled:opacity-50"
                >
                  <div className="text-2xl">{producto.categoria?.icono || '📦'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{producto.nombre}</div>
                    <div className="text-xs text-gray-500">{producto.codigoBarras || producto.categoria?.nombre}{producto.controlaStock ? ` · Existencias: ${producto.stockActual}` : ''}</div>
                  </div>
                  <div className="font-bold text-orange-500">{moneda(Number(producto.precio))}</div>
                </button>
              ))}
              {!visible.length && <div className="py-14 text-center text-gray-400">No hay productos con existencias que coincidan.</div>}
            </div>
          ) : (
            <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
              {carrito.length === 0 && <p className="py-16 text-center text-sm text-gray-500">Escanea un código de barras o busca un producto por nombre para comenzar la venta.</p>}
              {carrito.map(({ producto, cantidad }) => (
                <div key={producto.id} className="rounded-xl bg-gray-800 p-3">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{producto.nombre}</div>
                      <div className="text-xs text-gray-400">{moneda(Number(producto.precio))} por unidad</div>
                    </div>
                    <button aria-label={`Quitar ${producto.nombre}`} onClick={() => setCarrito((actual) => actual.filter((linea) => linea.producto.id !== producto.id))} className="shrink-0 text-gray-400 hover:text-red-400"><Trash2 size={16} /></button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button aria-label={`Reducir ${producto.nombre}`} onClick={() => cambiarCantidad(producto, -1)} className="rounded bg-gray-700 p-1"><Minus size={15} /></button>
                      <span className="w-7 text-center">{cantidad}</span>
                      <button aria-label={`Aumentar ${producto.nombre}`} onClick={() => cambiarCantidad(producto, 1)} className="rounded bg-gray-700 p-1"><Plus size={15} /></button>
                    </div>
                    <strong>{moneda(Number(producto.precio) * cantidad)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="flex h-fit flex-col rounded-2xl border border-gray-800 bg-gray-900 p-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-4"><div className="flex items-center gap-2"><ShoppingBasket className="text-orange-500" size={21} /><h2 className="text-lg font-bold">Venta actual</h2></div><span className="text-sm text-gray-400">{carrito.reduce((s,l) => s+l.cantidad, 0)} artículos</span></div>
          <div className="mt-4 space-y-4"><div className="flex items-center justify-between text-xl font-bold"><span>Total</span><span className="text-orange-500">{moneda(total)}</span></div><button disabled={!carrito.length || !caja || cajaDeOtro || procesando} onClick={() => setModalCobroAbierto(true)} className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">Cobrar</button></div>
        </aside>
      </div>
    </div>
    <VentasTurno cajaId={caja?.id ?? null} sucursalId={usuario?.sucursalId} puedeGestionar={!cajaDeOtro} />
    {modalCobroAbierto && (
      <ModalCobro total={total} procesando={procesando} onConfirmar={vender} textoCancelar="Volver a productos" onCancelar={() => setModalCobroAbierto(false)} />
    )}
  </main></AuthGuard>;
}
