'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowDownCircle, Boxes, ClipboardList, Plus, Save, ShoppingCart, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';

type Categoria =
  | 'COMPRA_MERCANCIA'
  | 'COMPRA_INSUMOS'
  | 'NOMINA'
  | 'SERVICIOS'
  | 'ARRIENDO'
  | 'MANTENIMIENTO'
  | 'IMPUESTOS'
  | 'COMISION_DISTRIBUIDOR'
  | 'OTROS';

type Presentacion = { id: number; nombre: string; factorUnidades: number };
type Producto = {
  id: number;
  nombre: string;
  costo: number | string | null;
  stockActual: number;
  controlaStock: boolean;
  esCombo: boolean;
  ventaGranel: boolean;
  unidadGranel: string | null;
  presentaciones: Presentacion[];
};
type Linea = { id: number; productoId: string; presentacionId: string; cantidad: string; costoUnitario: string };
type Detalle = {
  id: number;
  productoNombre: string;
  cantidad: number | string;
  unidadCompra: string;
  cantidadInventario: number;
  subtotal: number | string;
};
type Movimiento = {
  condicionPago?: 'CONTADO' | 'CREDITO';
  proveedor?: { nombre: string } | null;
  cuentaAdministrativa?: { saldo: string; vencimiento: string } | null;
  id: number;
  categoria: Categoria;
  descripcion: string;
  monto: number | string;
  fecha: string;
  creadoEn: string;
  usuario: { nombre: string };
  sucursal: { nombre: string };
  detalles: Detalle[];
};
type Saldo = {
  configurado: boolean;
  saldoInicial: number | null;
  desde: string | null;
  saldoDisponible: number | null;
  configuradoPor?: string;
};

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'COMPRA_MERCANCIA', label: 'Compra de mercancía' },
  { value: 'COMPRA_INSUMOS', label: 'Compra de insumos' },
  { value: 'NOMINA', label: 'Pago de nómina' },
  { value: 'ARRIENDO', label: 'Pago de arriendo' },
  { value: 'SERVICIOS', label: 'Pago de servicios' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
  { value: 'IMPUESTOS', label: 'Impuestos' },
  { value: 'COMISION_DISTRIBUIDOR', label: 'Comisión de distribuidor' },
  { value: 'OTROS', label: 'Otro gasto' },
];

const COP = (monto: number | string) => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
}).format(Number(monto) || 0);

const nuevaLinea = (): Linea => ({
  id: Date.now() + Math.random(),
  productoId: '',
  presentacionId: '',
  cantidad: '1',
  costoUnitario: '',
});

function ComprasContenido() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categoria, setCategoria] = useState<Categoria>('COMPRA_MERCANCIA');
  const [descripcion, setDescripcion] = useState('');
  const [proveedores, setProveedores] = useState<{ id: number; nombre: string; activo: boolean }[]>([]);
  const [proveedorId, setProveedorId] = useState('');
  const [condicionPago, setCondicionPago] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [pagadoConRecaudo, setPagadoConRecaudo] = useState(false);
  const [documentoCompra, setDocumentoCompra] = useState('');
  const [vencimientoCompra, setVencimientoCompra] = useState('');
  const administracion = usuario?.permisos?.administracion === true;
  const [monto, setMonto] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea()]);
  const [saldoInicial, setSaldoInicial] = useState('');
  const [mostrarAjusteSaldo, setMostrarAjusteSaldo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [saldoRespuesta, movimientosRespuesta, productosRespuesta] = await Promise.all([
        api.get<Saldo>('/compras/saldo'),
        api.get<Movimiento[]>('/compras'),
        api.get<Producto[]>('/productos'),
      ]);
      setSaldo(saldoRespuesta.data);
      setMovimientos(movimientosRespuesta.data);
      setProductos(productosRespuesta.data.filter((producto) => producto.controlaStock && !producto.esCombo));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No fue posible cargar Compras.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargarDatos(); }, [cargarDatos]);
  useEffect(() => {
    if (!administracion) return;
    api.get('/administracion/proveedores').then((r) => setProveedores(r.data)).catch(() => setProveedores([]));
  }, [administracion]);
  useEffect(() => {
    if (usuario && !['ADMIN_EMPRESA', 'GERENTE'].includes(usuario.rol)) router.replace('/pos');
  }, [usuario, router]);

  const totalCompra = useMemo(() => lineas.reduce((total, linea) => {
    const cantidad = Number(linea.cantidad);
    const costo = Number(linea.costoUnitario);
    return total + (Number.isFinite(cantidad) && Number.isFinite(costo) ? cantidad * costo : 0);
  }, 0), [lineas]);

  const esMercancia = categoria === 'COMPRA_MERCANCIA';
  const actualizarLinea = (id: number, cambios: Partial<Linea>) => {
    setLineas((actuales) => actuales.map((linea) => linea.id === id ? { ...linea, ...cambios } : linea));
  };

  const configurarSaldo = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setError('');
    setExito('');
    setGuardando(true);
    try {
      const { data } = await api.post<Saldo>('/compras/saldo-inicial', { monto: Number(saldoInicial) });
      setSaldo(data);
      setSaldoInicial('');
      setMostrarAjusteSaldo(false);
      setExito('Saldo inicial guardado y registrado en auditoría.');
      await cargarDatos();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo guardar el saldo inicial.');
    } finally {
      setGuardando(false);
    }
  };

  const registrarMovimiento = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setError('');
    setExito('');
    if (!descripcion.trim()) {
      setError('Escribe el motivo o destinatario del pago.');
      return;
    }
    if (esMercancia && lineas.some((linea) => !linea.productoId || !linea.cantidad || !linea.costoUnitario)) {
      setError('Completa producto, cantidad y costo unitario de cada línea.');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/compras', {
        pagadoConRecaudo: (!administracion || condicionPago === 'CONTADO') && pagadoConRecaudo,
        categoria,
        descripcion: descripcion.trim(),
        ...(administracion ? {
          condicionPago,
          ...(proveedorId ? { proveedorId: Number(proveedorId) } : {}),
          ...(condicionPago === 'CREDITO' ? { documento: documentoCompra, vencimiento: vencimientoCompra } : {}),
        } : {}),
        ...(esMercancia
          ? {
              items: lineas.map((linea) => ({
                productoId: Number(linea.productoId),
                presentacionId: linea.presentacionId ? Number(linea.presentacionId) : null,
                cantidad: Number(linea.cantidad),
                costoUnitario: Number(linea.costoUnitario),
              })),
            }
          : { monto: Number(monto) }),
      });
      setDescripcion('');
      setPagadoConRecaudo(false);
      setMonto('');
      setLineas([nuevaLinea()]);
      setExito(condicionPago === 'CREDITO' && administracion
        ? 'Compra a crédito registrada. La obligación está en Administración; el saldo de dinero se descuenta al registrar abonos.'
        : esMercancia
        ? 'Compra registrada: se actualizó el inventario, el costo del producto y el saldo de la cuenta.'
        : 'Egreso registrado y descontado del saldo de la cuenta.');
      await cargarDatos();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo registrar el movimiento.');
    } finally {
      setGuardando(false);
    }
  };

  const etiquetaCategoria = (valor: Categoria) => CATEGORIAS.find((item) => item.value === valor)?.label || valor;
  const esAdmin = usuario?.rol === 'ADMIN_EMPRESA';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
          <header>
            <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">Control de egresos e inventario</p>
            <h1 className="mt-1 text-3xl font-bold">Compras y gastos</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-400">
              Registra las compras de mercancía y los pagos del negocio. Las operaciones de contado generan un egreso; las compras a crédito se pagan mediante abonos desde Administración.
            </p>
          </header>

          {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200"><AlertCircle size={18} />{error}</div>}
          {exito && <p role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/50 p-3 text-sm text-emerald-200">{exito}</p>}

          {saldo?.configurado ? (
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <p className="text-sm text-gray-400">Saldo disponible estimado</p>
                <p className={`mt-2 text-3xl font-bold ${Number(saldo.saldoDisponible) < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{COP(saldo.saldoDisponible || 0)}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <p className="text-sm text-gray-400">Saldo inicial registrado</p>
                <p className="mt-2 text-2xl font-semibold">{COP(saldo.saldoInicial || 0)}</p>
                <p className="mt-1 text-xs text-gray-500">Desde {new Date(saldo.desde!).toLocaleString('es-CO')}</p>
              </div>
              <div className="rounded-xl border border-blue-900 bg-blue-950/30 p-5 text-sm text-blue-100">
                <p className="font-semibold">Consignaciones semanales</p>
                <p className="mt-2 text-blue-200/80">El efectivo consignado no se resta de nuevo: la venta ya fue contabilizada como ingreso y la consignación solo lo transfiere a la cuenta.</p>
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-amber-700 bg-amber-950/30 p-5">
              <h2 className="font-semibold text-amber-200">Configura el saldo real de la cuenta para comenzar</h2>
              <p className="mt-1 text-sm text-amber-100/80">Este será el saldo inicial en la fecha de activación. No sumaremos ingresos históricos, porque pueden incluir dinero ya gastado antes de empezar a registrar estos pagos.</p>
              {esAdmin ? (
                <form onSubmit={configurarSaldo} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <label className="flex-1 text-sm">
                    Saldo real en la cuenta
                    <input
                      required
                      min="0"
                      step="0.01"
                      type="number"
                      value={saldoInicial}
                      onChange={(e) => setSaldoInicial(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                      placeholder="Ej. 5000000"
                    />
                  </label>
                  <button disabled={guardando} className="self-end rounded-lg bg-orange-600 px-4 py-2 font-semibold hover:bg-orange-500 disabled:opacity-50">
                    Registrar saldo inicial
                  </button>
                </form>
              ) : <p className="mt-3 text-sm text-amber-200">Solicita al administrador de la empresa que registre el saldo inicial.</p>}
            </section>
          )}

          {saldo?.configurado && esAdmin && (
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              {!mostrarAjusteSaldo ? (
                <button type="button" onClick={() => { setSaldoInicial(String(saldo.saldoInicial ?? 0)); setMostrarAjusteSaldo(true); }} className="text-sm text-blue-300 hover:text-blue-200">
                  Ajustar saldo inicial (el cambio quedará auditado)
                </button>
              ) : (
                <form onSubmit={configurarSaldo} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="flex-1 text-sm">
                    Saldo inicial real
                    <input required min="0" step="0.01" type="number" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white" />
                  </label>
                  <button disabled={guardando} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold hover:bg-blue-600 disabled:opacity-50">Guardar ajuste</button>
                  <button type="button" onClick={() => setMostrarAjusteSaldo(false)} className="rounded-lg px-4 py-2 text-gray-300 hover:bg-gray-800">Cancelar</button>
                </form>
              )}
            </section>
          )}

          {saldo?.configurado && (
            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <form onSubmit={registrarMovimiento} className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="text-orange-400" />
                  <h2 className="text-xl font-semibold">Registrar compra o gasto</h2>
                </div>
                <label className="block text-sm">
                  ¿Para qué se utilizó el dinero?
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2">
                    {CATEGORIAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  Descripción, proveedor o destinatario
                  <input required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" placeholder="Ej. Compra a Distribuidora Central" />
                </label>

                {administracion && <div className="space-y-3 rounded-lg border border-gray-700 p-3">
                  <label className="block text-sm">Condición de pago<select value={condicionPago} onChange={(e) => setCondicionPago(e.target.value as 'CONTADO' | 'CREDITO')} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2"><option value="CONTADO">Contado (pagado)</option><option value="CREDITO">Crédito (pendiente de pago)</option></select></label>
                  <label className="block text-sm">Proveedor<select required={condicionPago === 'CREDITO'} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2"><option value="">Selecciona un proveedor</option>{proveedores.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
                  {condicionPago === 'CREDITO' && <><label className="block text-sm">Referencia única (NIT y factura)<input required maxLength={100} value={documentoCompra} onChange={(e) => setDocumentoCompra(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" /></label><label className="block text-sm">Fecha de vencimiento<input required type="date" value={vencimientoCompra} onChange={(e) => setVencimientoCompra(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" /></label><p className="text-xs text-amber-200">El inventario se recibe al guardar. El dinero solo se descuenta cuando registres los abonos.</p></>}
                  <a href="/administracion" className="text-sm text-orange-300">Administrar proveedores y obligaciones →</a>
                </div>}
                {esMercancia ? (
                  <div className="space-y-3">
                    {productos.length === 0 && <p className="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">No hay productos activos que controlen inventario. Activa el control de existencias en Productos antes de registrar mercancía.</p>}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-300">Productos comprados</p>
                      <button type="button" onClick={() => setLineas((actuales) => [...actuales, nuevaLinea()])} className="flex items-center gap-1 text-sm text-orange-300 hover:text-orange-200"><Plus size={16} />Agregar producto</button>
                    </div>
                    {lineas.map((linea) => {
                      const producto = productos.find((item) => item.id === Number(linea.productoId));
                      const unidadGranel = producto?.unidadGranel?.toLowerCase() || '';
                      const factorBase = producto?.ventaGranel && ['kg', 'l'].includes(unidadGranel) ? 1000 : 1;
                      const unidadBase = producto?.ventaGranel ? (producto.unidadGranel || 'g') : 'Unidad';
                      return (
                        <div key={linea.id} className="grid gap-2 rounded-lg border border-gray-800 bg-gray-950/70 p-3 sm:grid-cols-2">
                          <label className="text-xs text-gray-400 sm:col-span-2">
                            Producto
                            <select
                              required
                              value={linea.productoId}
                              onChange={(e) => actualizarLinea(linea.id, { productoId: e.target.value, presentacionId: '' })}
                              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white"
                            >
                              <option value="">Selecciona un producto</option>
                              {productos.map((item) => <option key={item.id} value={item.id}>{item.nombre} · stock {item.stockActual}</option>)}
                            </select>
                          </label>
                          {producto && (
                            <label className="text-xs text-gray-400 sm:col-span-2">
                              Presentación de compra
                              <select value={linea.presentacionId} onChange={(e) => actualizarLinea(linea.id, { presentacionId: e.target.value })} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white">
                                <option value="">{unidadBase} (×{factorBase} {producto.ventaGranel ? (['l', 'ml'].includes(unidadGranel) ? 'ml' : 'g') : 'unidades'})</option>
                                {producto.presentaciones.map((presentacion) => <option key={presentacion.id} value={presentacion.id}>{presentacion.nombre} (×{presentacion.factorUnidades} unidades)</option>)}
                              </select>
                            </label>
                          )}
                          <label className="text-xs text-gray-400">
                            Cantidad comprada
                            <input required min="0.001" step="0.001" type="number" value={linea.cantidad} onChange={(e) => actualizarLinea(linea.id, { cantidad: e.target.value })} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white" />
                          </label>
                          <label className="text-xs text-gray-400">
                            Costo por presentación
                            <input required min="0.01" step="0.01" type="number" value={linea.costoUnitario} onChange={(e) => actualizarLinea(linea.id, { costoUnitario: e.target.value })} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white" placeholder="Ej. 25000" />
                          </label>
                          <p className="text-sm text-gray-300 sm:col-span-2">Subtotal: <strong>{COP((Number(linea.cantidad) || 0) * (Number(linea.costoUnitario) || 0))}</strong></p>
                          {lineas.length > 1 && <button type="button" onClick={() => setLineas((actuales) => actuales.filter((item) => item.id !== linea.id))} aria-label="Quitar producto" className="justify-self-end text-red-300 hover:text-red-200"><Trash2 size={17} /></button>}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-3">
                      <span className="font-medium">Total de compra</span><strong className="text-lg text-orange-300">{COP(totalCompra)}</strong>
                    </div>
                    <p className="text-xs text-gray-500">El inventario y el costo promedio de cada producto se actualizarán al guardar.</p>
                  </div>
                ) : (
                  <label className="block text-sm">
                    Valor pagado
                    <input required min="0.01" step="0.01" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" placeholder="Ej. 1200000" />
                  </label>
                )}

                {(!administracion || condicionPago === 'CONTADO') && <label className="block rounded-xl border border-orange-500/25 bg-orange-500/5 p-3 text-sm"><span className="flex items-center gap-2"><input type="checkbox" checked={pagadoConRecaudo} onChange={e => setPagadoConRecaudo(e.target.checked)} />Pagado con dinero del recaudo</span><span className="mt-1 block text-xs text-gray-400">Solo si se usó el efectivo ya retirado de caja. Este gasto se descontará del disponible semanal para consignar.</span></label>}
                <button disabled={guardando || !saldo?.configurado || (esMercancia && (!productos.length || totalCompra <= 0))} className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 font-semibold hover:bg-orange-500 disabled:opacity-50">
                  <Save size={18} />{guardando ? 'Guardando...' : 'Guardar egreso'}
                </button>
              </form>

              <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <ClipboardList className="text-blue-300" />
                  <h2 className="text-xl font-semibold">Historial auditado</h2>
                </div>
                {cargando ? <p className="py-10 text-center text-gray-400">Cargando movimientos...</p> : movimientos.length === 0 ? (
                  <div className="py-10 text-center text-gray-500"><Boxes className="mx-auto mb-2" /><p>Aún no hay compras ni gastos registrados.</p></div>
                ) : (
                  <div className="max-h-[650px] space-y-3 overflow-y-auto pr-1">
                    {movimientos.map((movimiento) => (
                      <article key={movimiento.id} className="rounded-lg border border-gray-800 bg-gray-950/70 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{movimiento.descripcion}</p>
                            {movimiento.condicionPago === 'CREDITO' && <p className="text-sm text-amber-200">Crédito · {movimiento.proveedor?.nombre} · Pendiente: {COP(movimiento.cuentaAdministrativa?.saldo || 0)}</p>}
                            <p className="mt-1 text-xs text-orange-300">{etiquetaCategoria(movimiento.categoria)}</p>
                            <p className="mt-1 text-xs text-gray-500">{new Date(movimiento.fecha).toLocaleString('es-CO')} · {movimiento.usuario.nombre} · {movimiento.sucursal.nombre}</p>
                          </div>
                          <strong className="text-orange-200">{COP(movimiento.monto)}</strong>
                        </div>
                        {movimiento.detalles.length > 0 && (
                          <ul className="mt-3 space-y-1 border-t border-gray-800 pt-2 text-xs text-gray-300">
                            {movimiento.detalles.map((detalle) => <li key={detalle.id} className="flex justify-between gap-2"><span>{detalle.productoNombre}: {detalle.cantidad} {detalle.unidadCompra} (+{detalle.cantidadInventario} unidades de inventario)</span><span>{COP(detalle.subtotal)}</span></li>)}
                          </ul>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>
          )}

          <p className="flex items-start gap-2 text-xs text-gray-500"><ShoppingCart size={15} className="mt-0.5 shrink-0" />El saldo se calcula desde el saldo inicial más los ingresos y egresos registrados desde esa fecha. Los costos de venta no se vuelven a restar porque no son un nuevo pago.</p>
        </main>
      </div>
    </AuthGuard>
  );
}

export default function ComprasPage() {
  return <ComprasContenido />;
}
