'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Minus, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';

type Producto = {
  id: number; nombre: string; precio: string; codigoBarras?: string | null;
  disponible: boolean; controlaStock: boolean; stockActual: number; stockMinimo: number;
  categoria: { id: number; nombre: string; icono?: string; parentId?: number | null };
};
type Categoria = { id: number; nombre: string; parentId?: number | null };
type Linea = { producto: Producto; cantidad: number };
type Caja = { id: number; usuarioId: number; usuario?: { nombre: string } };

const moneda = (valor: number) => valor.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function RetailPOS() {
  const usuario = useAuthStore((state) => state.usuario);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ultimoRecibo, setUltimoRecibo] = useState<any>(null);
  const buscarRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    const [p, c, cajaRes] = await Promise.allSettled([
      api.get('/productos'), api.get('/categorias'), api.get('/caja/abierta'),
    ]);
    if (p.status === 'fulfilled') setProductos(p.value.data);
    if (c.status === 'fulfilled') setCategorias(c.value.data);
    setCaja(cajaRes.status === 'fulfilled' ? cajaRes.value.data : null);
    if (p.status === 'rejected' || c.status === 'rejected') setError('No se pudo cargar el catálogo de productos.');
  };

  useEffect(() => { void cargar(); }, []);

  const visible = useMemo(() => productos.filter((producto) => {
    if (!producto.disponible) return false;
    if (categoriaId && producto.categoria.id !== categoriaId && producto.categoria.parentId !== categoriaId) return false;
    const termino = busqueda.trim().toLocaleLowerCase('es-CO');
    return !termino || producto.nombre.toLocaleLowerCase('es-CO').includes(termino) || producto.codigoBarras?.includes(termino);
  }), [productos, categoriaId, busqueda]);

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
    if (exacto) { agregar(exacto); setBusqueda(''); }
    else if (codigo) setError('No se encontró un producto con ese código. Puedes buscarlo por nombre.');
  };

  const total = carrito.reduce((suma, linea) => suma + Number(linea.producto.precio) * linea.cantidad, 0);
  const cajaDeOtro = !!caja && !!usuario && caja.usuarioId !== usuario.id && !['ADMIN_EMPRESA', 'GERENTE'].includes(usuario.rol);
  const vender = async () => {
    if (!carrito.length || !caja || cajaDeOtro || procesando) return;
    setProcesando(true); setError(''); setAviso('');
    try {
      const { data } = await api.post('/pedidos', {
        sucursalId: usuario?.sucursalId,
        metodoPago,
        items: carrito.map(({ producto, cantidad }) => ({ productoId: producto.id, cantidad })),
      });
      setCarrito([]);
      setUltimoRecibo(data);
      setAviso(`Venta ${data.numero} registrada · ${moneda(Number(data.total))}`);
      await cargar();
      try {
        const impresion = await api.post('/impresion/ticket', data);
        if (!impresion.data?.impreso) setAviso(`Venta ${data.numero} registrada. Puedes imprimir el recibo desde esta pantalla.`);
        if (metodoPago === 'EFECTIVO') void api.post('/impresion/abrir-cajon').catch(() => undefined);
      } catch { setAviso(`Venta ${data.numero} registrada. Puedes imprimir el recibo desde esta pantalla.`); }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo registrar la venta.');
    } finally { setProcesando(false); buscarRef.current?.focus(); }
  };

  const imprimirRecibo = () => {
    if (!ultimoRecibo) return;
    const ventana = window.open('', '_blank', 'width=420,height=700');
    if (!ventana) { setError('El navegador bloqueó la ventana del recibo. Permite ventanas emergentes para imprimir.'); return; }
    const lineas = [usuario?.empresa || 'PowerPOS', `VENTA ${ultimoRecibo.numero}`, new Date().toLocaleString('es-CO'), '--------------------------------',
      ...(ultimoRecibo.detalles || []).map((d: any) => `${d.cantidad} × ${d.producto?.nombre || 'Producto'}   ${moneda(Number(d.subtotal))}`),
      '--------------------------------', `TOTAL  ${moneda(Number(ultimoRecibo.total))}`, `PAGO  ${ultimoRecibo.metodoPago}`, 'Gracias por su compra'];
    const pre = ventana.document.createElement('pre');
    pre.style.cssText = 'font:14px/1.5 monospace;white-space:pre-wrap;padding:20px;';
    pre.textContent = lineas.join('\n');
    ventana.document.body.appendChild(pre);
    ventana.print();
  };

  const titulo = usuario?.tipoNegocio === 'SUPERMERCADO' ? 'Caja de supermercado' : usuario?.tipoNegocio === 'TIENDA' ? 'Caja de tienda' : 'Punto de venta comercial';
  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar />
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">Venta rápida</p><h1 className="mt-1 text-3xl font-bold">{titulo}</h1><p className="mt-1 text-sm text-gray-400">Busca por nombre o escanea el código de barras. Las cantidades se descuentan al finalizar la venta.</p></div>
        <div className={`rounded-xl border px-4 py-3 text-sm ${caja && !cajaDeOtro ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{!caja ? 'Caja cerrada · abre la caja desde Dashboard' : cajaDeOtro ? `Caja asignada a ${caja.usuario?.nombre || 'otro cajero'}` : 'Caja abierta · lista para vender'}</div>
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}
      {aviso && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-400"><span>{aviso}</span>{ultimoRecibo && <button type="button" onClick={imprimirRecibo} className="rounded-lg border border-green-500/40 px-3 py-1 text-sm">Imprimir último recibo</button>}</div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <form onSubmit={escanear} className="mb-4 flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3"><Barcode className="text-orange-500" size={23} /><input ref={buscarRef} value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setError(''); }} placeholder="Código de barras o nombre del producto" aria-label="Código de barras o nombre del producto" className="min-w-0 flex-1 bg-transparent text-white outline-none" /><button type="submit" aria-label="Buscar código" className="text-gray-400 hover:text-orange-500"><Search size={20} /></button></form>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1"><button onClick={() => setCategoriaId(null)} className={`shrink-0 rounded-full px-3 py-2 text-sm ${categoriaId === null ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300'}`}>Todos</button>{categorias.filter((c) => !c.parentId).map((c) => <button key={c.id} onClick={() => setCategoriaId(c.id)} className={`shrink-0 rounded-full px-3 py-2 text-sm ${categoriaId === c.id ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300'}`}>{c.nombre}</button>)}</div>
          <div className="grid max-h-[68vh] grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3 xl:grid-cols-4">{visible.map((producto) => {
            const agotado = producto.controlaStock && producto.stockActual <= 0;
            return <button key={producto.id} disabled={agotado || !caja || cajaDeOtro} onClick={() => agregar(producto)} className="min-h-36 rounded-xl border border-gray-800 bg-gray-950 p-4 text-left transition hover:border-orange-500/60 disabled:opacity-50"><div className="text-2xl">{producto.categoria?.icono || '📦'}</div><div className="mt-3 line-clamp-2 font-semibold text-white">{producto.nombre}</div><div className="mt-1 text-xs text-gray-500">{producto.codigoBarras || producto.categoria?.nombre}</div><div className="mt-2 font-bold text-orange-500">{moneda(Number(producto.precio))}</div><div className={`mt-1 text-xs ${agotado ? 'text-red-400' : producto.controlaStock && producto.stockActual <= producto.stockMinimo ? 'text-yellow-400' : 'text-gray-400'}`}>{producto.controlaStock ? `Existencias: ${producto.stockActual}` : 'Sin control de existencias'}</div></button>;
          })}</div>
          {!visible.length && <div className="py-14 text-center text-gray-400">No hay productos que coincidan. Regístralos en Productos.</div>}
        </section>
        <aside className="flex h-fit flex-col rounded-2xl border border-gray-800 bg-gray-900 p-4 lg:sticky lg:top-4 lg:min-h-[580px]"><div className="flex items-center justify-between border-b border-gray-800 pb-4"><div className="flex items-center gap-2"><ShoppingBasket className="text-orange-500" size={21} /><h2 className="text-lg font-bold">Venta actual</h2></div><span className="text-sm text-gray-400">{carrito.reduce((s,l) => s+l.cantidad, 0)} artículos</span></div>
          <div className="max-h-[45vh] flex-1 space-y-3 overflow-y-auto py-4">{carrito.length === 0 && <p className="py-16 text-center text-sm text-gray-500">Agrega productos para comenzar la venta.</p>}{carrito.map(({ producto, cantidad }) => <div key={producto.id} className="rounded-xl bg-gray-800 p-3"><div className="flex justify-between gap-3"><div><div className="font-medium text-white">{producto.nombre}</div><div className="text-xs text-gray-400">{moneda(Number(producto.precio))} por unidad</div></div><button aria-label={`Quitar ${producto.nombre}`} onClick={() => setCarrito((actual) => actual.filter((linea) => linea.producto.id !== producto.id))} className="text-gray-400 hover:text-red-400"><Trash2 size={16} /></button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center gap-2"><button aria-label={`Reducir ${producto.nombre}`} onClick={() => cambiarCantidad(producto, -1)} className="rounded bg-gray-700 p-1"><Minus size={15} /></button><span className="w-7 text-center">{cantidad}</span><button aria-label={`Aumentar ${producto.nombre}`} onClick={() => cambiarCantidad(producto, 1)} className="rounded bg-gray-700 p-1"><Plus size={15} /></button></div><strong>{moneda(Number(producto.precio) * cantidad)}</strong></div></div>)}</div>
          <div className="mt-auto space-y-4 border-t border-gray-800 pt-4"><div className="flex items-center justify-between text-xl font-bold"><span>Total</span><span className="text-orange-500">{moneda(total)}</span></div><label className="block text-sm text-gray-400">Medio de pago<select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 text-white"><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option><option value="NEQUI">Nequi</option><option value="DAVIPLATA">Daviplata</option></select></label><button disabled={!carrito.length || !caja || cajaDeOtro || procesando} onClick={vender} className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">{procesando ? 'Registrando…' : 'Cobrar y registrar venta'}</button></div>
        </aside>
      </div>
    </div>
  </main></AuthGuard>;
}
