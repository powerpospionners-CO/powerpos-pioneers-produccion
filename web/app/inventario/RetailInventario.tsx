'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, History, Package, Search, X } from 'lucide-react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';

type Producto = {
  id: number;
  nombre: string;
  precio: string;
  codigoBarras?: string | null;
  controlaStock: boolean;
  stockActual: number;
  stockMinimo: number;
  categoria?: { nombre: string; icono?: string };
};

type Movimiento = {
  id: number;
  tipo: string;
  cantidadMovida: string;
  stockAnterior: string;
  stockNuevo: string;
  descripcion?: string | null;
  creadoEn: string;
  usuario?: { nombre: string };
};

export default function RetailInventario() {
  const usuario = useAuthStore((state) => state.usuario);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [modalAjuste, setModalAjuste] = useState<Producto | null>(null);
  const [formAjuste, setFormAjuste] = useState({ tipo: 'ENTRADA', cantidad: '', descripcion: '' });
  const [guardando, setGuardando] = useState(false);

  const [modalHistorial, setModalHistorial] = useState<Producto | null>(null);
  const [historial, setHistorial] = useState<Movimiento[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/productos');
      setProductos(data);
    } catch {
      setError('No fue posible cargar el catálogo de productos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const controlados = useMemo(() => productos.filter((p) => p.controlaStock), [productos]);
  const sinControl = useMemo(() => productos.filter((p) => !p.controlaStock), [productos]);
  const bajoMinimo = useMemo(() => controlados.filter((p) => p.stockActual <= p.stockMinimo), [controlados]);

  const termino = busqueda.trim().toLocaleLowerCase('es-CO');
  const filtrar = (lista: Producto[]) => !termino
    ? lista
    : lista.filter((p) => p.nombre.toLocaleLowerCase('es-CO').includes(termino) || p.codigoBarras?.includes(termino));

  const abrirAjuste = (producto: Producto) => {
    setModalAjuste(producto);
    setFormAjuste({ tipo: 'ENTRADA', cantidad: '', descripcion: '' });
  };

  const guardarAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalAjuste) return;
    setGuardando(true);
    setError('');
    try {
      await api.post(`/productos/${modalAjuste.id}/ajuste-stock`, {
        tipo: formAjuste.tipo,
        cantidad: Number(formAjuste.cantidad),
        descripcion: formAjuste.descripcion || undefined,
      });
      setAviso(`Existencias de ${modalAjuste.nombre} actualizadas.`);
      setModalAjuste(null);
      await cargar();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No fue posible ajustar las existencias.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirHistorial = async (producto: Producto) => {
    setModalHistorial(producto);
    setCargandoHistorial(true);
    try {
      const { data } = await api.get(`/productos/${producto.id}/historial-stock`);
      setHistorial(data);
    } catch {
      setHistorial([]);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const titulo = usuario?.tipoNegocio === 'SUPERMERCADO' ? 'Existencias del supermercado'
    : usuario?.tipoNegocio === 'TIENDA' ? 'Existencias de la tienda'
    : 'Existencias del comercio';

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">Inventario</p>
              <h1 className="mt-1 text-3xl font-bold">{titulo}</h1>
              <p className="mt-1 text-sm text-gray-400">Controla las existencias por producto y registra entradas, salidas y ajustes.</p>
            </div>
            <div className="relative w-full max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto o código..."
                className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}
          {aviso && <div role="status" className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-400">{aviso}</div>}

          {bajoMinimo.length > 0 && (
            <div className="mb-5 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="flex items-center gap-2 text-yellow-400 font-semibold">
                <AlertTriangle size={17} />
                {bajoMinimo.length} producto(s) con existencias bajas
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {bajoMinimo.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => abrirAjuste(p)}
                    className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-300 hover:bg-yellow-500/20"
                  >
                    {p.nombre} · {p.stockActual} u.
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-gray-500">Cargando inventario...</div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
                  <Boxes size={17} className="text-orange-500" />
                  <h2 className="font-bold">Productos con control de existencias</h2>
                  <span className="ml-auto text-sm text-gray-500">{filtrar(controlados).length}</span>
                </div>
                {filtrar(controlados).length === 0 ? (
                  <div className="py-10 text-center text-gray-500 text-sm">Ningún producto coincide con la búsqueda.</div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {filtrar(controlados).map((producto) => {
                      const agotado = producto.stockActual <= 0;
                      const bajo = producto.stockActual <= producto.stockMinimo;
                      return (
                        <div key={producto.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <div className="font-medium text-white">{producto.categoria?.icono} {producto.nombre}</div>
                            <div className="text-xs text-gray-500">{producto.codigoBarras || 'Sin código de barras'} · Mínimo: {producto.stockMinimo}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${agotado ? 'bg-red-500/10 text-red-400' : bajo ? 'bg-yellow-500/10 text-yellow-400' : 'bg-gray-800 text-gray-300'}`}>
                              {producto.stockActual} unidades
                            </span>
                            <button
                              onClick={() => abrirHistorial(producto)}
                              title="Historial de movimientos"
                              className="rounded-lg border border-gray-700 p-2 text-gray-400 hover:text-white hover:border-gray-600"
                            >
                              <History size={15} />
                            </button>
                            <button
                              onClick={() => abrirAjuste(producto)}
                              className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                            >
                              Ajustar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {sinControl.length > 0 && (
                <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
                    <Package size={17} className="text-gray-500" />
                    <h2 className="font-bold text-gray-300">Productos sin control de existencias</h2>
                    <span className="ml-auto text-sm text-gray-500">{filtrar(sinControl).length}</span>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {filtrar(sinControl).map((producto) => (
                      <div key={producto.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="text-gray-300">{producto.categoria?.icono} {producto.nombre}</span>
                        <span className="text-gray-500">Actívalo desde Productos → editar producto</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {modalAjuste && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <form onSubmit={guardarAjuste} className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Ajustar existencias</h3>
                <button type="button" onClick={() => setModalAjuste(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
              </div>
              <p className="mb-4 text-sm text-gray-400">{modalAjuste.nombre} · actualmente {modalAjuste.stockActual} unidades</p>

              <label className="mb-3 block text-sm text-gray-400">
                Tipo de movimiento
                <select
                  value={formAjuste.tipo}
                  onChange={(e) => setFormAjuste({ ...formAjuste, tipo: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                >
                  <option value="ENTRADA">Entrada (recibí mercancía)</option>
                  <option value="SALIDA">Salida (pérdida, daño, ajuste manual)</option>
                  <option value="AJUSTE">Ajuste (dejar en esta cantidad exacta)</option>
                </select>
              </label>

              <label className="mb-3 block text-sm text-gray-400">
                {formAjuste.tipo === 'AJUSTE' ? 'Cantidad final' : 'Cantidad'}
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={formAjuste.cantidad}
                  onChange={(e) => setFormAjuste({ ...formAjuste, cantidad: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                />
              </label>

              <label className="mb-5 block text-sm text-gray-400">
                Descripción (opcional)
                <input
                  value={formAjuste.descripcion}
                  onChange={(e) => setFormAjuste({ ...formAjuste, descripcion: e.target.value })}
                  placeholder="Ej: compra a proveedor, producto vencido..."
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                />
              </label>

              <button
                type="submit"
                disabled={guardando}
                className="w-full rounded-lg bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Guardar ajuste'}
              </button>
            </form>
          </div>
        )}

        {modalHistorial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Historial · {modalHistorial.nombre}</h3>
                <button type="button" onClick={() => setModalHistorial(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
              </div>
              {cargandoHistorial ? (
                <div className="py-8 text-center text-gray-500">Cargando...</div>
              ) : historial.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-sm">Sin movimientos registrados todavía.</div>
              ) : (
                <div className="space-y-2">
                  {historial.map((m) => (
                    <div key={m.id} className="rounded-lg bg-gray-800 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${m.tipo === 'ENTRADA' ? 'text-green-400' : m.tipo === 'SALIDA' ? 'text-red-400' : 'text-blue-400'}`}>{m.tipo}</span>
                        <span className="text-gray-500 text-xs">{new Date(m.creadoEn).toLocaleString('es-CO')}</span>
                      </div>
                      <div className="mt-1 text-gray-300">{Number(m.stockAnterior)} → {Number(m.stockNuevo)} unidades</div>
                      {m.descripcion && <div className="mt-1 text-gray-500 text-xs">{m.descripcion}</div>}
                      <div className="mt-1 text-gray-600 text-xs">Por {m.usuario?.nombre || 'Usuario'}</div>
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
