'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { UtensilsCrossed, Search, Plus, Minus, Trash2, Keyboard } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import TouchKeyboard from '@/components/TouchKeyboard';
import { useAuthStore } from '@/store/authStore';

interface Producto {
  id: number;
  nombre: string;
  precio: string;
  categoria?: { nombre: string; icono?: string };
}

interface ItemTemp {
  productoId: number;
  nombre: string;
  precio: number;
  cantidad: number;
}

export default function ConsumoEmpleadosPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [resumen, setResumen] = useState<{ totalRegistros: number; costoEstimadoMes: number } | null>(null);

  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [empleadoNombre, setEmpleadoNombre] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [items, setItems] = useState<ItemTemp[]>([]);
  const [observacion, setObservacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const [tecladoCampo, setTecladoCampo] = useState<'empleado' | 'observacion' | 'producto' | null>(null);

  useEffect(() => {
    if (!usuario) {
      router.replace('/login');
      return;
    }
    if (usuario.rol !== 'ADMIN_EMPRESA' && usuario.rol !== 'GERENTE') {
      router.replace('/pos');
      return;
    }
    if (!usuario.consumoEmpleadosHabilitado) {
      return;
    }
    cargarDatos();
  }, [usuario]);

  const cargarDatos = async () => {
    const [productosRes, sucursalesRes, historialRes, resumenRes] = await Promise.all([
      api.get('/productos'),
      api.get('/sucursales'),
      api.get('/consumo-empleados'),
      api.get('/consumo-empleados/resumen'),
    ]);
    setProductos(productosRes.data);
    setSucursales(sucursalesRes.data);
    setHistorial(historialRes.data);
    setResumen(resumenRes.data);
    if (!sucursalId && sucursalesRes.data.length > 0) {
      setSucursalId(usuario?.sucursalId && sucursalesRes.data.some((s: any) => s.id === usuario.sucursalId) ? usuario.sucursalId : sucursalesRes.data[0].id);
    }
  };

  const agregarProducto = (producto: Producto) => {
    setItems((prev) => {
      const existe = prev.find((item) => item.productoId === producto.id);
      if (existe) {
        return prev.map((item) => item.productoId === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, { productoId: producto.id, nombre: producto.nombre, precio: Number(producto.precio), cantidad: 1 }];
    });
  };

  const cambiarCantidad = (productoId: number, delta: number) => {
    setItems((prev) => prev
      .map((item) => item.productoId === productoId ? { ...item, cantidad: item.cantidad + delta } : item)
      .filter((item) => item.cantidad > 0));
  };

  const registrarConsumo = async () => {
    setError('');
    setMensaje('');
    if (!empleadoNombre.trim()) {
      setError('Ingresa el nombre del empleado');
      return;
    }
    if (items.length === 0) {
      setError('Agrega al menos un producto consumido');
      return;
    }
    if (!sucursalId) {
      setError('Selecciona una sucursal');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/consumo-empleados', {
        sucursalId,
        empleadoNombre: empleadoNombre.trim(),
        observacion: observacion.trim() || undefined,
        items: items.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad })),
      });
      setMensaje(`Consumo registrado para ${empleadoNombre.trim()}. Se descontó del inventario.`);
      setEmpleadoNombre('');
      setItems([]);
      setObservacion('');
      await cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No fue posible registrar el consumo.');
    } finally {
      setGuardando(false);
    }
  };

  const productosFiltrados = productos.filter((producto) =>
    producto.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()),
  );

  const totalTemp = items.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

  if (!usuario) return null;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar />

        <div className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
              <UtensilsCrossed size={20} className="text-orange-500" />
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">Consumo de empleados</h1>
              <p className="text-gray-500 text-sm">Comida que se le da al personal. No se contabiliza como venta, pero sí descuenta del inventario.</p>
            </div>
          </div>

          {!usuario.consumoEmpleadosHabilitado ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
              Esta función no está habilitada para tu empresa. Solicita al superadmin que la active desde el panel de control.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 max-w-lg">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-gray-500 text-xs">Registros este mes</p>
                  <p className="text-white text-2xl font-black mt-1">{resumen?.totalRegistros ?? 0}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-gray-500 text-xs">Costo estimado del mes</p>
                  <p className="text-white text-2xl font-black mt-1">${(resumen?.costoEstimadoMes ?? 0).toLocaleString()}</p>
                </div>
              </div>

              {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 text-sm max-w-2xl">{error}</div>}
              {mensaje && <div className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg p-3 text-sm max-w-2xl">{mensaje}</div>}

              <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={busquedaProducto}
                      onChange={(e) => setBusquedaProducto(e.target.value)}
                      onFocus={() => setTecladoCampo('producto')}
                      placeholder="Buscar producto..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-9 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setTecladoCampo((prev) => prev === 'producto' ? null : 'producto')}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${tecladoCampo === 'producto' ? 'text-orange-500' : 'text-gray-500 hover:text-white'}`}
                    >
                      <Keyboard size={15} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                    {productosFiltrados.map((producto) => (
                      <button
                        key={producto.id}
                        onClick={() => agregarProducto(producto)}
                        className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-left hover:border-orange-500/50 hover:bg-gray-700 transition-colors"
                      >
                        <div className="text-white text-sm font-medium truncate">{producto.nombre}</div>
                        <div className="text-orange-500 text-xs font-bold">${Number(producto.precio).toLocaleString()}</div>
                      </button>
                    ))}
                    {productosFiltrados.length === 0 && (
                      <div className="col-span-full text-center text-gray-600 text-sm py-6">Sin resultados</div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4 h-fit">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Empleado</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={empleadoNombre}
                        onChange={(e) => setEmpleadoNombre(e.target.value)}
                        onFocus={() => setTecladoCampo('empleado')}
                        placeholder="Nombre del empleado"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-9 text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => setTecladoCampo((prev) => prev === 'empleado' ? null : 'empleado')}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${tecladoCampo === 'empleado' ? 'text-orange-500' : 'text-gray-500 hover:text-white'}`}
                      >
                        <Keyboard size={15} />
                      </button>
                    </div>
                  </div>

                  {sucursales.length > 1 && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Sucursal</label>
                      <select
                        value={sucursalId ?? ''}
                        onChange={(e) => setSucursalId(Number(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      >
                        {sucursales.map((sucursal) => (
                          <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    {items.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Agrega productos desde la lista</p>}
                    {items.map((item) => (
                      <div key={item.productoId} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-white text-sm truncate">{item.nombre}</div>
                          <div className="text-gray-500 text-xs">${(item.precio * item.cantidad).toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => cambiarCantidad(item.productoId, -1)} className="bg-gray-700 hover:bg-gray-600 text-white rounded w-6 h-6 flex items-center justify-center">
                            <Minus size={12} />
                          </button>
                          <span className="text-white text-sm w-4 text-center">{item.cantidad}</span>
                          <button onClick={() => cambiarCantidad(item.productoId, 1)} className="bg-gray-700 hover:bg-gray-600 text-white rounded w-6 h-6 flex items-center justify-center">
                            <Plus size={12} />
                          </button>
                          <button onClick={() => setItems((prev) => prev.filter((i) => i.productoId !== item.productoId))} className="text-gray-600 hover:text-red-400">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {items.length > 0 && (
                    <div className="flex justify-between text-white text-sm font-bold">
                      <span>Valor referencial</span>
                      <span className="text-orange-500">${totalTemp.toLocaleString()}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Observación (opcional)</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={observacion}
                        onChange={(e) => setObservacion(e.target.value)}
                        onFocus={() => setTecladoCampo('observacion')}
                        placeholder="Ej: almuerzo de turno"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-9 text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => setTecladoCampo((prev) => prev === 'observacion' ? null : 'observacion')}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${tecladoCampo === 'observacion' ? 'text-orange-500' : 'text-gray-500 hover:text-white'}`}
                      >
                        <Keyboard size={15} />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={registrarConsumo}
                    disabled={guardando}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-lg py-3 transition-colors"
                  >
                    {guardando ? 'Registrando...' : 'Registrar consumo'}
                  </button>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800">
                  <h3 className="text-white font-bold text-sm">Historial reciente</h3>
                </div>
                {historial.length === 0 ? (
                  <div className="p-6 text-center text-gray-600 text-sm">Aún no hay consumos registrados</div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {historial.map((registro) => (
                      <div key={registro.id} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                        <div className="min-w-0">
                          <div className="text-white font-medium">{registro.empleadoNombre}</div>
                          <div className="text-gray-500 text-xs mt-1 truncate">
                            {registro.items.map((item: any) => `${item.cantidad}x ${item.producto.nombre}`).join(', ')}
                            {registro.observacion ? ` · ${registro.observacion}` : ''}
                          </div>
                          <div className="text-gray-600 text-xs mt-1">{registro.sucursal?.nombre} · Registrado por {registro.usuario?.nombre}</div>
                        </div>
                        <time className="text-gray-500 text-xs whitespace-nowrap">{new Date(registro.creadoEn).toLocaleString('es-CO')}</time>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {tecladoCampo === 'empleado' && (
          <TouchKeyboard titulo="Nombre del empleado" value={empleadoNombre} onChange={setEmpleadoNombre} onClose={() => setTecladoCampo(null)} />
        )}
        {tecladoCampo === 'observacion' && (
          <TouchKeyboard titulo="Observación" value={observacion} onChange={setObservacion} onClose={() => setTecladoCampo(null)} />
        )}
        {tecladoCampo === 'producto' && (
          <TouchKeyboard titulo="Buscar producto" value={busquedaProducto} onChange={setBusquedaProducto} onClose={() => setTecladoCampo(null)} />
        )}
      </div>
    </AuthGuard>
  );
}
