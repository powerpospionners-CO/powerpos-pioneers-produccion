'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { encolarVentaPendiente, generarClaveVenta, listarVentasFallidas, listarVentasPendientes, quitarVentaFallida, sincronizarVentasPendientes } from '@/lib/colaOfflineVentas';

type Presentacion = { id: number; nombre: string; factorUnidades: number; precio: string; codigoBarras?: string | null };
type Producto = {
  id: number; nombre: string; precio: string; codigoBarras?: string | null;
  disponible: boolean; controlaStock: boolean; stockActual: number; stockMinimo: number; ventaGranel?: boolean;
  categoria: { id: number; nombre: string; icono?: string; parentId?: number | null };
  presentaciones?: Presentacion[];
};
// Una forma concreta de vender un producto: el producto tal cual, una de
// sus presentaciones (ej. "Tarro" vs "Unidad"), o su versión al granel
// (el cajero pesa la cantidad exacta, ej. gelatina o ají sueltos). Todas
// comparten el mismo `stockBase` del producto — factorUnidades es cuántas
// unidades base consume una venta de este ítem. Un producto al granel
// puede además tener presentaciones empacadas: no son excluyentes.
type ItemVendible = {
  key: string; productoId: number; presentacionId: number | null;
  nombre: string; precio: number; codigoBarras: string | null;
  controlaStock: boolean; factorUnidades: number; stockBase: number; porGramo: boolean;
  categoria: { icono?: string; nombre?: string };
};
type Linea = { item: ItemVendible; cantidad: number };
type Caja = { id: number; usuarioId: number; usuario?: { nombre: string }; montoInicial: string; totalVentas?: number; totalEfectivo?: number; totalEsperado?: number };

export default function RetailPOS() {
  const usuario = useAuthStore((state) => state.usuario);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState<Linea[]>([]);
  // Mientras el cajero escribe la cantidad se guarda aquí el texto tal cual
  // (incluyendo vacío, mientras borra el número anterior para escribir uno
  // nuevo) para que el campo no "rebote" al valor viejo en cada tecla.
  const [borradorCantidad, setBorradorCantidad] = useState<Record<string, string>>({});
  const [caja, setCaja] = useState<Caja | null>(null);
  const [modalCobroAbierto, setModalCobroAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ultimoRecibo, setUltimoRecibo] = useState<any>(null);
  const [cambioAMostrar, setCambioAMostrar] = useState<number | null>(null);
  // La última venta no se pudo imprimir sola (agente caído, o la impresora
  // ya no está instalada como USB en Windows). Nunca se abre la ventana de
  // impresión del navegador automáticamente — se ofrece reintentar o
  // imprimir a mano, para no sorprender al cajero con un diálogo sin
  // impresora que elegir.
  const [fallaImpresion, setFallaImpresion] = useState(false);
  const [reintentandoImpresion, setReintentandoImpresion] = useState(false);
  // Ventas guardadas en este dispositivo porque no había conexión al
  // cobrarlas. Se reintentan solas al volver la señal (evento 'online' +
  // reintento periódico, por si ese evento no dispara en algunos navegadores).
  const [pendientesSync, setPendientesSync] = useState(0);
  const [fallidasSync, setFallidasSync] = useState<ReturnType<typeof listarVentasFallidas>>([]);
  const buscarRef = useRef<HTMLInputElement>(null);
  const solicitudProductos = useRef(0);
  const cargarProductos = useCallback(async (signal?: AbortSignal) => {
    const solicitud = ++solicitudProductos.current;
    const { data } = await api.get('/productos', { signal });
    if (!signal?.aborted && solicitud === solicitudProductos.current) setProductos(data);
  }, []);

  const cargar = async () => {
    const [p, cajaRes] = await Promise.allSettled([
      cargarProductos(), api.get('/caja/abierta'),
    ]);
    setCaja(cajaRes.status === 'fulfilled' ? cajaRes.value.data : null);
    if (p.status === 'rejected') setError('No se pudo cargar el catálogo de productos.');
  };

  useEffect(() => { void cargar(); }, []);

  // Las existencias se refrescan solas cada 15s (y al volver a la pestaña),
  // porque otra caja puede vender el mismo producto mientras esta pantalla
  // está abierta.
  useEffect(() => {
    let pendiente = false;
    const controller = new AbortController();
    const actualizar = async () => {
      if (document.visibilityState !== 'visible' || pendiente) return;
      pendiente = true;
      try { await cargarProductos(controller.signal); }
      catch { /* Se conservan las existencias anteriores y se reintenta en el siguiente ciclo. */ }
      finally { pendiente = false; }
    };
    const intervalo = window.setInterval(actualizar, 15000);
    window.addEventListener('focus', actualizar);
    window.addEventListener('online', actualizar);
    document.addEventListener('visibilitychange', actualizar);
    return () => {
      controller.abort();
      window.clearInterval(intervalo);
      window.removeEventListener('focus', actualizar);
      window.removeEventListener('online', actualizar);
      document.removeEventListener('visibilitychange', actualizar);
    };
  }, [cargarProductos]);

  const refrescarContadoresSync = useCallback(() => {
    if (!usuario?.empresaId || !usuario?.sucursalId) return;
    setPendientesSync(listarVentasPendientes(usuario.empresaId, usuario.sucursalId).length);
    setFallidasSync(listarVentasFallidas(usuario.empresaId, usuario.sucursalId));
  }, [usuario?.empresaId, usuario?.sucursalId]);

  // Reintenta las ventas guardadas offline al volver la conexión. También
  // reintenta cada 20s por si el evento 'online' no dispara (pasa en
  // algunos navegadores/redes), y una vez al montar por si ya había
  // ventas pendientes de una sesión anterior.
  useEffect(() => {
    if (!usuario?.empresaId || !usuario?.sucursalId) return;
    const empresaId = usuario.empresaId;
    const sucursalId = usuario.sucursalId;
    let sincronizando = false;
    const sincronizar = async () => {
      if (sincronizando) return;
      sincronizando = true;
      try {
        const { sincronizadas } = await sincronizarVentasPendientes(empresaId, sucursalId);
        if (sincronizadas > 0) {
          setAviso(`${sincronizadas} venta(s) guardada(s) sin conexión ya se sincronizaron.`);
          void cargarProductos();
        }
      } finally {
        sincronizando = false;
        refrescarContadoresSync();
      }
    };
    refrescarContadoresSync();
    void sincronizar();
    const intervalo = window.setInterval(sincronizar, 20000);
    window.addEventListener('online', sincronizar);
    return () => { window.clearInterval(intervalo); window.removeEventListener('online', sincronizar); };
  }, [usuario?.empresaId, usuario?.sucursalId, cargarProductos, refrescarContadoresSync]);

  // Cada producto se convierte en uno o varios ítems vendibles: si vende al
  // granel se agrega un ítem "al granel" (precio por gramo, cantidad =
  // gramos pesados); si tiene presentaciones empacadas, cada una es su
  // propio ítem; y salvo que venda al granel, también se agrega la unidad
  // base (factor 1) — así un producto con presentaciones se puede vender
  // tanto suelto como empacado. Todos comparten el mismo stockBase.
  const itemsVendibles = useMemo<ItemVendible[]>(() => productos.filter((producto) => producto.disponible).flatMap((producto): ItemVendible[] => {
    const items: ItemVendible[] = [];
    const tienePresentaciones = producto.presentaciones && producto.presentaciones.length > 0;

    if (producto.ventaGranel) {
      items.push({
        key: `${producto.id}:granel`,
        productoId: producto.id,
        presentacionId: null,
        nombre: tienePresentaciones ? `${producto.nombre} (al granel)` : producto.nombre,
        precio: Number(producto.precio),
        codigoBarras: producto.codigoBarras || null,
        controlaStock: producto.controlaStock,
        factorUnidades: 1,
        stockBase: producto.stockActual,
        porGramo: true,
        categoria: producto.categoria,
      });
    }

    if (tienePresentaciones) {
      items.push(...producto.presentaciones!.map((p) => ({
        key: `${producto.id}:${p.id}`,
        productoId: producto.id,
        presentacionId: p.id,
        nombre: `${producto.nombre} — ${p.nombre}`,
        precio: Number(p.precio),
        codigoBarras: p.codigoBarras || null,
        controlaStock: producto.controlaStock,
        factorUnidades: p.factorUnidades,
        stockBase: producto.stockActual,
        porGramo: false,
        categoria: producto.categoria,
      })));
    }

    // Un producto con presentaciones (ej. "Paquete x18") también se puede
    // seguir vendiendo suelto por unidad — las presentaciones son variantes
    // adicionales, no reemplazan la venta de la unidad base. Eso no aplica a
    // los que se venden al granel, porque ahí el precio es por gramo, no por
    // unidad completa.
    if (!producto.ventaGranel) {
      items.push({
        key: `${producto.id}`,
        productoId: producto.id,
        presentacionId: null,
        nombre: tienePresentaciones ? `${producto.nombre} (unidad)` : producto.nombre,
        precio: Number(producto.precio),
        codigoBarras: producto.codigoBarras || null,
        controlaStock: producto.controlaStock,
        factorUnidades: 1,
        stockBase: producto.stockActual,
        porGramo: false,
        categoria: producto.categoria,
      });
    }

    return items;
  }), [productos]);

  // Con menos existencias base que las que necesita esta presentación, no
  // debe encontrarse ni por nombre ni por código hasta reponer stock.
  const conStock = useMemo(() => itemsVendibles.filter((item) => !(item.controlaStock && item.stockBase < item.factorUnidades)), [itemsVendibles]);

  const termino = busqueda.trim().toLocaleLowerCase('es-CO');
  const visible = useMemo(() => {
    if (!termino) return conStock;
    return conStock.filter((item) =>
      item.nombre.toLocaleLowerCase('es-CO').includes(termino) || item.codigoBarras?.toLocaleLowerCase('es-CO').includes(termino),
    );
  }, [conStock, termino]);

  // Unidades base del mismo producto ya reservadas en el carrito, sumando
  // todas sus presentaciones (ej. si ya hay 2 unidades sueltas en el
  // carrito, un tarro de 50 debe validarse contra esas 2 ya comprometidas).
  const unidadesBaseEnCarrito = (productoId: number) => carrito.filter((l) => l.item.productoId === productoId).reduce((s, l) => s + l.cantidad * l.item.factorUnidades, 0);

  const agregar = (item: ItemVendible) => {
    setError('');
    // Se revalida contra el estado más reciente de `productos` (que se
    // refresca solo cada 15s) por si otra caja vendió justo antes de este clic.
    const productoActual = productos.find((p) => p.id === item.productoId);
    if (!productoActual?.disponible) { setError(`${item.nombre} no está disponible.`); return; }
    if (item.controlaStock && unidadesBaseEnCarrito(item.productoId) + item.factorUnidades > productoActual.stockActual) {
      setError(`No hay más existencias de ${item.nombre}.`);
      return;
    }
    setCarrito((actual) => {
      const existente = actual.find((linea) => linea.item.key === item.key);
      return existente
        ? actual.map((linea) => linea.item.key === item.key ? { ...linea, cantidad: linea.cantidad + 1 } : linea)
        : [...actual, { item, cantidad: 1 }];
    });
    setBusqueda('');
    buscarRef.current?.focus();
  };
  const cambiarCantidad = (item: ItemVendible, cambio: number) => {
    if (cambio > 0) { agregar(item); return; }
    setCarrito((actual) => actual.map((linea) => linea.item.key === item.key ? { ...linea, cantidad: linea.cantidad - 1 } : linea).filter((linea) => linea.cantidad > 0));
  };
  // Permite digitar la cantidad directamente (ej. venden 500 unidades) en
  // vez de dar clic al + esa cantidad de veces.
  const establecerCantidad = (item: ItemVendible, valor: string) => {
    const cantidad = Math.floor(Number(valor));
    if (!Number.isFinite(cantidad) || cantidad < 1) return;
    const productoActual = productos.find((p) => p.id === item.productoId);
    if (item.controlaStock && productoActual) {
      const otrasLineas = carrito.filter((l) => l.item.productoId === item.productoId && l.item.key !== item.key).reduce((s, l) => s + l.cantidad * l.item.factorUnidades, 0);
      const maxCantidad = Math.floor((productoActual.stockActual - otrasLineas) / item.factorUnidades);
      if (cantidad > maxCantidad) {
        setError(`Solo hay ${Math.max(0, maxCantidad)} disponibles de ${item.nombre}.`);
        setCarrito((actual) => actual.map((linea) => linea.item.key === item.key ? { ...linea, cantidad: Math.max(1, maxCantidad) } : linea));
        return;
      }
    }
    setError('');
    setCarrito((actual) => actual.map((linea) => linea.item.key === item.key ? { ...linea, cantidad } : linea));
  };
  const escanear = (event: React.FormEvent) => {
    event.preventDefault();
    const codigo = busqueda.trim();
    const exacto = itemsVendibles.find((item) => item.codigoBarras === codigo);
    if (exacto) agregar(exacto);
    else if (codigo) setError('No se encontró un producto con ese código. Puedes buscarlo por nombre.');
  };

  const subtotal = carrito.reduce((suma, linea) => suma + linea.item.precio * linea.cantidad, 0);
  // Enchila Market Pereira negocia el descuento como un monto fijo en pesos
  // (ej. "le descuento $15.000"); el resto de empresas lo maneja por
  // porcentaje sobre el subtotal — el backend siempre recibe el resultado
  // ya convertido a pesos, así que no necesita saber cuál de los dos se usó.
  const esEnchilaMarket = usuario?.empresaId === 2;
  const [descuentoInput, setDescuentoInput] = useState('');
  const descuento = esEnchilaMarket
    ? Math.round(Math.min(subtotal, Math.max(0, Number(descuentoInput) || 0)) * 100) / 100
    : Math.round(subtotal * (Math.min(100, Math.max(0, Number(descuentoInput) || 0)) / 100) * 100) / 100;
  const total = subtotal - descuento;
  const cajaDeOtro = !!caja && !!usuario && caja.usuarioId !== usuario.id && !['ADMIN_EMPRESA', 'GERENTE'].includes(usuario.rol);
  const vender = async (pago: PagoConfirmado) => {
    if (!carrito.length || !caja || cajaDeOtro || procesando) return;
    setProcesando(true); setError(''); setAviso('');
    const payload = {
      sucursalId: usuario?.sucursalId,
      metodoPago: pago.metodoPago,
      pagos: pago.pagos,
      items: carrito.map(({ item, cantidad }) => ({ productoId: item.productoId, presentacionId: item.presentacionId, cantidad })),
      descuento,
      cambio: pago.cambio,
      claveIdempotencia: generarClaveVenta(),
    };
    try {
      const { data } = await api.post('/pedidos', payload);
      setCarrito([]);
      setDescuentoInput('');
      setUltimoRecibo(data);
      setModalCobroAbierto(false);
      setFallaImpresion(false);
      await cargar();
      try {
        const impresion = await api.post('/impresion/ticket', data);
        if (!impresion.data?.impreso) {
          // No se abre la ventana del navegador sola: si la impresora ya no
          // está instalada como USB en Windows (ej. ahora es de red), ese
          // diálogo no tiene a quién imprimirle y solo confunde al cajero.
          // Se avisa y se deja reintentar o imprimir a mano, a su criterio.
          setFallaImpresion(true);
          setAviso(`Venta ${data.numero} registrada, pero no se pudo imprimir automáticamente.`);
        } else {
          setAviso(`Venta ${data.numero} registrada · ${moneda(Number(data.total))}`);
        }
        if (pago.metodoPago === 'EFECTIVO' || pago.pagos.some((p) => p.metodoPago === 'EFECTIVO')) void api.post('/impresion/abrir-cajon').catch(() => undefined);
      } catch {
        setFallaImpresion(true);
        setAviso(`Venta ${data.numero} registrada, pero no se pudo conectar para imprimir.`);
      }
      if (pago.cambio > 0) setCambioAMostrar(pago.cambio);
    } catch (e: any) {
      if (!e?.response && usuario?.empresaId && usuario?.sucursalId) {
        // Sin respuesta del servidor: es un corte de conexión, no un rechazo
        // real de la venta (stock, caja cerrada, etc.). Se guarda para
        // reintentar sola y se cierra el cobro como si hubiera salido bien,
        // porque para el cajero la venta ya ocurrió — el cliente ya se fue.
        encolarVentaPendiente(usuario.empresaId, usuario.sucursalId, payload.claveIdempotencia, payload);
        refrescarContadoresSync();
        setCarrito([]);
        setDescuentoInput('');
        setModalCobroAbierto(false);
        setAviso('Sin conexión: la venta quedó guardada en este equipo y se enviará sola cuando vuelva la señal.');
        if (pago.cambio > 0) setCambioAMostrar(pago.cambio);
      } else {
        setError(e?.response?.data?.message || 'No se pudo registrar la venta.');
      }
    } finally { setProcesando(false); buscarRef.current?.focus(); }
  };

  const reintentarImpresion = async () => {
    if (!ultimoRecibo || reintentandoImpresion) return;
    setReintentandoImpresion(true);
    try {
      const impresion = await api.post('/impresion/ticket', ultimoRecibo);
      if (impresion.data?.impreso) {
        setFallaImpresion(false);
        setAviso(`Venta ${ultimoRecibo.numero} impresa correctamente.`);
      } else {
        setAviso('Sigue sin poder imprimir sola. Puedes intentarlo de nuevo en un momento, o imprimir desde el navegador.');
      }
    } catch {
      setAviso('No se pudo conectar para reintentar la impresión.');
    } finally {
      setReintentandoImpresion(false);
    }
  };

  const imprimirRecibo = (recibo?: any) => {
    const pedido = recibo || ultimoRecibo;
    if (!pedido) return;
    const ventana = window.open('', '_blank', 'width=420,height=700');
    if (!ventana) { setError('El navegador bloqueó la ventana del recibo. Permite ventanas emergentes para imprimir.'); return; }
    const pagos = Array.isArray(pedido.pagos) && pedido.pagos.length > 1
      ? pedido.pagos.map((p: any) => `PAGO ${p.metodoPago}  ${moneda(Number(p.monto))}`)
      : [`PAGO  ${pedido.metodoPago}`];
    const lineas = [usuario?.empresa || 'PowerPOS', `VENTA ${pedido.numero}`, new Date().toLocaleString('es-CO'), '--------------------------------',
      ...(pedido.detalles || []).map((d: any) => `${d.cantidad} × ${d.producto?.nombre || 'Producto'}${d.presentacionNombre ? ` (${d.presentacionNombre})` : ''}   ${moneda(Number(d.subtotal))}`),
      '--------------------------------', `TOTAL  ${moneda(Number(pedido.total))}`, ...pagos, 'Gracias por su compra'];
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
      {aviso && (
        <div role="status" className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${fallaImpresion ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' : 'border-green-500/30 bg-green-500/10 text-green-400'}`}>
          <span>{aviso}</span>
          <span className="flex flex-wrap gap-2">
            {fallaImpresion && <button type="button" disabled={reintentandoImpresion} onClick={reintentarImpresion} className="rounded-lg border border-yellow-500/40 px-3 py-1 text-sm disabled:opacity-50">{reintentandoImpresion ? 'Reintentando…' : 'Reintentar impresión'}</button>}
            {ultimoRecibo && <button type="button" onClick={() => imprimirRecibo()} className="rounded-lg border border-gray-600 px-3 py-1 text-sm">Imprimir desde el navegador</button>}
          </span>
        </div>
      )}
      {pendientesSync > 0 && <div role="status" className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">📡 {pendientesSync} venta(s) sin conexión, esperando para sincronizar. No cierres esta pestaña.</div>}
      {fallidasSync.length > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <p className="font-semibold">{fallidasSync.length} venta(s) guardada(s) sin conexión no se pudieron confirmar al sincronizar:</p>
          <ul className="mt-1 space-y-1">
            {fallidasSync.map((v) => (
              <li key={v.clave} className="flex items-center justify-between gap-2">
                <span>{v.motivo}</span>
                <button type="button" onClick={() => { if (usuario?.empresaId && usuario?.sucursalId) { quitarVentaFallida(usuario.empresaId, usuario.sucursalId, v.clave); refrescarContadoresSync(); } }} className="shrink-0 rounded border border-red-500/40 px-2 py-0.5 text-xs">Descartar</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="lg:col-span-2"><VentasPendientes
          clave={usuario ? `pos-pendientes:comercio:${usuario.empresaId}:${usuario.sucursalId}:${usuario.id}` : null}
          datos={{ carrito }} total={total} vacia={!carrito.length} bloqueado={procesando || !caja || cajaDeOtro}
          onGuardar={() => { setCarrito([]); setDescuentoInput(''); setBusqueda(''); setAviso('Venta guardada. Ya puedes atender a otro cliente.'); buscarRef.current?.focus(); }}
          onRestaurar={(venta) => { setCarrito(venta.carrito); setError(''); setAviso('Venta recuperada. Revisa los productos y pulsa Cobrar.'); }}
        /></div>
        <section className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <form onSubmit={escanear} className="mb-4 flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3"><Barcode className="text-orange-500" size={23} /><input ref={buscarRef} value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setError(''); }} placeholder="Código de barras o nombre del producto" aria-label="Código de barras o nombre del producto" className="min-w-0 flex-1 bg-transparent text-white outline-none" /><button type="submit" aria-label="Buscar código" className="text-gray-400 hover:text-orange-500"><Search size={20} /></button></form>
          {termino ? (
            <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              {visible.map((item) => (
                <button
                  key={item.key}
                  disabled={!caja || cajaDeOtro}
                  onClick={() => agregar(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 p-3 text-left transition hover:border-orange-500/60 disabled:opacity-50"
                >
                  <div className="text-2xl">{item.categoria?.icono || '📦'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{item.nombre}</div>
                    <div className="text-xs text-gray-500">{item.codigoBarras || item.categoria?.nombre}{item.controlaStock ? ` · Existencias: ${Math.floor(item.stockBase / item.factorUnidades)}${item.porGramo ? ' g' : ''}` : ''}</div>
                  </div>
                  <div className="font-bold text-orange-500">{moneda(item.precio)}{item.porGramo ? '/g' : ''}</div>
                </button>
              ))}
              {!visible.length && <div className="py-14 text-center text-gray-400">No hay productos con existencias que coincidan.</div>}
            </div>
          ) : (
            <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
              {carrito.length === 0 && <p className="py-16 text-center text-sm text-gray-500">Escanea un código de barras o busca un producto por nombre para comenzar la venta.</p>}
              {carrito.map(({ item, cantidad }) => (
                <div key={item.key} className="rounded-xl bg-gray-800 p-3">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{item.nombre}</div>
                      <div className="text-xs text-gray-400">{moneda(item.precio)} {item.porGramo ? 'por gramo' : 'por unidad'}</div>
                    </div>
                    <button aria-label={`Quitar ${item.nombre}`} onClick={() => setCarrito((actual) => actual.filter((linea) => linea.item.key !== item.key))} className="shrink-0 text-gray-400 hover:text-red-400"><Trash2 size={16} /></button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button aria-label={`Reducir ${item.nombre}`} onClick={() => cambiarCantidad(item, -1)} className="rounded bg-gray-700 p-1"><Minus size={15} /></button>
                      <input
                        aria-label={`Cantidad de ${item.nombre}`}
                        type="number"
                        min={1}
                        value={borradorCantidad[item.key] ?? String(cantidad)}
                        onChange={(e) => {
                          const valor = e.target.value;
                          setBorradorCantidad((actual) => ({ ...actual, [item.key]: valor }));
                          if (valor !== '') establecerCantidad(item, valor);
                        }}
                        onBlur={() => setBorradorCantidad((actual) => { const { [item.key]: _quitado, ...resto } = actual; return resto; })}
                        onFocus={(e) => e.target.select()}
                        className="w-14 rounded bg-gray-900 border border-gray-700 py-1 text-center text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      {item.porGramo && <span className="text-xs text-gray-400">g</span>}
                      <button aria-label={`Aumentar ${item.nombre}`} onClick={() => cambiarCantidad(item, 1)} className="rounded bg-gray-700 p-1"><Plus size={15} /></button>
                    </div>
                    <strong>{moneda(item.precio * cantidad)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="flex h-fit flex-col rounded-2xl border border-gray-800 bg-gray-900 p-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-4"><div className="flex items-center gap-2"><ShoppingBasket className="text-orange-500" size={21} /><h2 className="text-lg font-bold">Venta actual</h2></div><span className="text-sm text-gray-400">{carrito.reduce((s,l) => s+l.cantidad, 0)} artículos</span></div>
          <div className="mt-4 space-y-4">
            {carrito.length > 0 && (
              <div className="space-y-2 rounded-xl border border-gray-800 p-3">
                <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
                  Descuento {esEnchilaMarket ? '($)' : '(%)'}
                  <input
                    type="number" min={0} max={esEnchilaMarket ? subtotal : 100} step={esEnchilaMarket ? 1000 : 1}
                    value={descuentoInput}
                    onChange={(e) => setDescuentoInput(e.target.value)}
                    placeholder="0"
                    className="w-28 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-right text-white"
                  />
                </label>
                {descuento > 0 && (
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>Subtotal</span><span>{moneda(subtotal)}</span>
                  </div>
                )}
                {descuento > 0 && (
                  <div className="flex items-center justify-between text-sm text-red-400">
                    <span>Descuento</span><span>-{moneda(descuento)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between text-xl font-bold"><span>Total</span><span className="text-orange-500">{moneda(total)}</span></div>
            <button disabled={!carrito.length || !caja || cajaDeOtro || procesando} onClick={() => setModalCobroAbierto(true)} className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">Cobrar</button>
          </div>
        </aside>
      </div>
    </div>
    <VentasTurno cajaId={caja?.id ?? null} sucursalId={usuario?.sucursalId} puedeGestionar={!cajaDeOtro} />
    {modalCobroAbierto && (
      <ModalCobro total={total} procesando={procesando} onConfirmar={vender} textoCancelar="Volver a productos" onCancelar={() => setModalCobroAbierto(false)} />
    )}
    {cambioAMostrar !== null && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
        <div role="alertdialog" aria-modal="true" aria-label="Cambio a devolver" className="w-full max-w-sm rounded-2xl border border-green-500/30 bg-gray-900 p-6 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-widest text-gray-400">Devuelve al cliente</p>
          <p className="mt-2 text-5xl font-bold tabular-nums text-green-400">{moneda(cambioAMostrar)}</p>
          <button type="button" autoFocus onClick={() => { setCambioAMostrar(null); buscarRef.current?.focus(); }} className="mt-6 w-full rounded-xl bg-orange-500 py-3 font-bold text-white hover:bg-orange-600">Listo</button>
        </div>
      </div>
    )}
  </main></AuthGuard>;
}
