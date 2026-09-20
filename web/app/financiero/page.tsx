'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Plus, TrendingUp, TrendingDown, DollarSign, ShoppingCart } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';

export default function FinancieroPage() {
  const [resumen, setResumen] = useState<any>(null);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tipo: 'EGRESO',
    categoria: 'OTROS',
    descripcion: '',
    monto: '',
  });

  useEffect(() => {
    cargarDatos();
    const intervalo = setInterval(cargarDatos, 10000);
    return () => clearInterval(intervalo);
  }, []);

  const cargarDatos = async () => {
    const [res, movs] = await Promise.all([
      api.get('/financiero/resumen'),
      api.get('/financiero/movimientos'),
    ]);
    setResumen(res.data);
    setMovimientos(movs.data);
  };

  const registrar = async () => {
    if (!form.descripcion || !form.monto) return;
    setLoading(true);
    try {
      await api.post('/financiero/movimiento', {
        ...form,
        monto: Number(form.monto),
      });
      setModal(false);
      setForm({ tipo: 'EGRESO', categoria: 'OTROS', descripcion: '', monto: '' });
      cargarDatos();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const categorias = [
    'VENTA', 'COMPRA_INSUMOS', 'NOMINA', 'SERVICIOS',
    'ARRIENDO', 'MANTENIMIENTO', 'IMPUESTOS', 'OTROS'
  ];

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar />

        <div className="flex-1 p-6 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-green-500/10 p-2 rounded-lg">
                  <TrendingUp size={18} className="text-green-400" />
                </div>
                <span className="text-gray-400 text-sm">Total ingresos</span>
              </div>
              <div className="text-2xl font-bold text-white">${resumen?.totalIngresos?.toLocaleString() || 0}</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-red-500/10 p-2 rounded-lg">
                  <TrendingDown size={18} className="text-red-400" />
                </div>
                <span className="text-gray-400 text-sm">Total egresos</span>
              </div>
              <div className="text-2xl font-bold text-white">${resumen?.totalEgresos?.toLocaleString() || 0}</div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-orange-500/10 p-2 rounded-lg">
                  <DollarSign size={18} className="text-orange-500" />
                </div>
                <span className="text-gray-400 text-sm">Utilidad neta</span>
              </div>
              <div className={`text-2xl font-bold ${(resumen?.utilidad || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${resumen?.utilidad?.toLocaleString() || 0}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-500/10 p-2 rounded-lg">
                  <ShoppingCart size={18} className="text-blue-400" />
                </div>
                <span className="text-gray-400 text-sm">Ventas hoy</span>
              </div>
              <div className="text-2xl font-bold text-white">${resumen?.totalVentasHoy?.toLocaleString() || 0}</div>
              <div className="text-gray-500 text-xs mt-1">{resumen?.cantidadPedidosHoy || 0} pedidos</div>
            </div>
          </div>

          {/* Movimientos */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-semibold">Movimientos financieros</h2>
              <button
                onClick={() => setModal(true)}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
              >
                <Plus size={16} />
                Registrar movimiento
              </button>
            </div>

            {movimientos.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay movimientos registrados</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {movimientos.map((mov) => (
                  <div key={mov.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${mov.tipo === 'INGRESO' ? 'bg-green-400' : 'bg-red-400'}`} />
                      <div>
                        <div className="text-white text-sm font-medium">{mov.descripcion}</div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          {mov.categoria} · {mov.usuario?.nombre} · {new Date(mov.fecha).toLocaleString('es-CO')}
                        </div>
                      </div>
                    </div>
                    <div className={`font-bold ${mov.tipo === 'INGRESO' ? 'text-green-400' : 'text-red-400'}`}>
                      {mov.tipo === 'INGRESO' ? '+' : '-'}${Number(mov.monto).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal */}
        {modal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-4">Registrar movimiento</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="INGRESO">Ingreso</option>
                    <option value="EGRESO">Egreso</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Categoría</label>
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    {categorias.map(cat => (
                      <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                  <input
                    type="text"
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Descripción del movimiento"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Monto</label>
                  <input
                    type="number"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setModal(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={registrar}
                  disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors"
                >
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}