'use client';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';

interface Pedido {
  cliente?: { nombre: string } | null;
  id: number;
  numero: string;
  estado: string;
  creadoEn: string;
  observacion: string;
  detalles: {
    id: number;
    cantidad: number;
    exclusiones: string[];
    adicionales: { nombre: string; cantidad: number }[];
    observacion: string;
    producto: { nombre: string };
  }[];
}

export default function CocinaPage() {
  const { usuario, token } = useAuthStore();
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const canalLlamado = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    canalLlamado.current = new BroadcastChannel('powerpos-llamado-cliente');
    return () => canalLlamado.current?.close();
  }, []);

  const emitirLlamadoCliente = async (pedido: Pedido | undefined, estado: string) => {
    if (!pedido || !['LISTO', 'ENTREGADO'].includes(estado)) return;

    const nombreCliente = pedido.cliente?.nombre || null;
    const payload = {
      empresa: usuario?.empresa || 'PowerPOS',
      pedido: estado === 'LISTO' ? pedido.numero : null,
      clienteNombre: estado === 'LISTO' ? nombreCliente : null,
      mensaje: estado === 'LISTO' && nombreCliente ? `Pedido listo para ${nombreCliente}` : null,
      logoUrl: null,
      estado,
    };

    try {
      const { data: empresa } = await api.get('/empresa');
      payload.empresa = empresa?.nombre || payload.empresa;
      payload.logoUrl = empresa?.logo || null;
    } catch {
      // mantiene los valores por defecto
    }

    canalLlamado.current?.postMessage(payload);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('powerpos-llamado-cliente-event', JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('powerpos-llamado-cliente-event', { detail: payload }));
    }
  };

  useEffect(() => {
    if (!usuario) { router.push('/login'); return; }
    if (usuario.tipoNegocio && usuario.tipoNegocio !== 'RESTAURANTE') return;
    if (usuario.modoPreparacion === 'COMANDAS') { router.replace('/pos'); return; }
    cargarPedidos();
    const intervalo = setInterval(cargarPedidos, 5000);
    const stream = token ? new EventSource(`${api.defaults.baseURL}/pedidos/stream?token=${encodeURIComponent(token)}`) : null;
    if (stream) stream.onmessage = () => cargarPedidos();
    return () => {
      clearInterval(intervalo);
      stream?.close();
    };
  }, [token, usuario, router]);

  const cargarPedidos = async () => {
    try {
      const { data } = await api.get('/pedidos');
      setPedidos(data.filter((p: Pedido) => ['PENDIENTE', 'EN_COCINA'].includes(p.estado)));
    } catch (e) {
      console.error(e);
    }
  };

  const actualizarEstado = async (id: number, estado: string) => {
    const pedidoSeleccionado = pedidos.find((pedido) => pedido.id === id);
    await api.patch(`/pedidos/${id}/estado`, { estado });
    emitirLlamadoCliente(pedidoSeleccionado, estado);
    cargarPedidos();
  };

  const tiempoTranscurrido = (fecha: string) => {
    const minutos = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
    if (minutos < 1) return 'Ahora';
    if (minutos === 1) return '1 min';
    return `${minutos} min`;
  };

  const colorTiempo = (fecha: string) => {
    const minutos = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
    if (minutos < 5) return 'text-green-400';
    if (minutos < 10) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (usuario?.tipoNegocio && usuario.tipoNegocio !== 'RESTAURANTE') {
    return <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white"><div className="max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6"><h1 className="text-xl font-bold">Cocina no disponible</h1><p className="mt-3 text-gray-400">Esta empresa usa el POS comercial. Solicita al administrador un rol de caja o administración para continuar.</p></div></main>;
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Power<span className="text-orange-500">POS</span></h1>
          <span className="text-gray-500">|</span>
          <span className="text-orange-500 font-semibold">Cocina</span>
        </div>
        <div className="flex items-center gap-4">
          {usuario?.rol !== 'COCINERO' && (
            <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
              <LayoutDashboard size={16} />
              Dashboard
            </button>
          )}
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-3 py-1 rounded-full">
            ● En vivo — actualiza cada 5s
          </div>
          <span className="text-gray-400 text-sm">{pedidos.length} pedidos activos</span>
        </div>
      </header>

      {/* Grid de pedidos */}
      <div className="p-6">
        {pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-gray-600">
            <div className="text-6xl mb-4">👨‍🍳</div>
            <p className="text-xl">No hay pedidos pendientes</p>
            <p className="text-sm mt-2">Los nuevos pedidos aparecerán aquí automáticamente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pedidos.map((pedido) => (
              <div
                key={pedido.id}
                className={`rounded-xl border-2 overflow-hidden ${
                  pedido.estado === 'EN_COCINA'
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-yellow-500/50 bg-yellow-500/5'
                }`}
              >
                {/* Header tarjeta */}
                <div className={`px-4 py-3 flex items-center justify-between ${
                  pedido.estado === 'EN_COCINA' ? 'bg-blue-500/10' : 'bg-yellow-500/10'
                }`}>
                  <div>
                    <div className="text-white font-bold">{pedido.numero}</div>
                    <div className={`text-xs font-medium mt-0.5 ${colorTiempo(pedido.creadoEn)}`}>
                      ⏱ {tiempoTranscurrido(pedido.creadoEn)}
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                    pedido.estado === 'EN_COCINA'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {pedido.estado === 'EN_COCINA' ? 'En cocina' : 'Pendiente'}
                  </div>
                </div>

                {/* Items */}
                <div className="p-4 space-y-3">
                  {pedido.detalles.map((detalle, index) => (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <span className="bg-orange-500 text-white text-xs font-bold rounded w-6 h-6 flex items-center justify-center flex-shrink-0">
                          {detalle.cantidad}
                        </span>
                        <div className="flex-1">
                          <div className="text-white font-medium text-sm">{detalle.producto.nombre}</div>
                          {detalle.exclusiones.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {detalle.exclusiones.map((exc) => (
                                <div key={exc} className="flex items-center gap-1 text-red-400 text-xs font-medium">
                                  <span className="bg-red-500/20 border border-red-500/30 rounded px-1.5 py-0.5">
                                    ✕ Sin {exc}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {detalle.adicionales?.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {detalle.adicionales.map((ad, i) => (
                                <div key={i} className="flex items-center gap-1 text-green-400 text-xs font-medium">
                                  <span className="bg-green-500/20 border border-green-500/30 rounded px-1.5 py-0.5">
                                    + Con {ad.nombre}{ad.cantidad > 1 ? ` x${ad.cantidad}` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {detalle.observacion && (
                            <div className="text-yellow-400 text-xs mt-1">
                              📝 {detalle.observacion}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {pedido.observacion && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-yellow-400 text-xs">
                      📝 {pedido.observacion}
                    </div>
                  )}
                </div>

                {/* Botones acción */}
                <div className="px-4 pb-4 flex gap-2">
                  {pedido.estado === 'PENDIENTE' && (
                    <button
                      onClick={() => actualizarEstado(pedido.id, 'EN_COCINA')}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg py-2 transition-colors"
                    >
                      Iniciar preparación
                    </button>
                  )}
                  {pedido.estado === 'EN_COCINA' && (
                    <button
                      onClick={() => actualizarEstado(pedido.id, 'LISTO')}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg py-2 transition-colors"
                    >
                      ✓ Marcar como listo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
