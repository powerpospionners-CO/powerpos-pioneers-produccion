'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Plus, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Download, Printer, Wallet, CreditCard, Smartphone } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';

type Periodo = 'hoy' | 'mes' | 'anio' | 'personalizado';

const ETIQUETAS_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata',
};
const ICONOS_METODO: Record<string, any> = {
  EFECTIVO: Wallet, TARJETA: CreditCard, TRANSFERENCIA: Smartphone, NEQUI: Smartphone, DAVIPLATA: Smartphone,
};

function calcularRango(periodo: Periodo, desdePersonalizado: string, hastaPersonalizado: string): { desde?: string; hasta?: string } {
  const ahora = new Date();
  if (periodo === 'hoy') {
    const inicio = new Date(ahora);
    inicio.setHours(0, 0, 0, 0);
    return { desde: inicio.toISOString(), hasta: ahora.toISOString() };
  }
  if (periodo === 'mes') {
    return { desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString(), hasta: ahora.toISOString() };
  }
  if (periodo === 'anio') {
    return { desde: new Date(ahora.getFullYear(), 0, 1).toISOString(), hasta: ahora.toISOString() };
  }
  return {
    desde: desdePersonalizado ? new Date(`${desdePersonalizado}T00:00:00`).toISOString() : undefined,
    hasta: hastaPersonalizado ? new Date(`${hastaPersonalizado}T23:59:59`).toISOString() : undefined,
  };
}

export default function FinancieroPage() {
  const [resumen, setResumen] = useState<any>(null);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desdePersonalizado, setDesdePersonalizado] = useState('');
  const [hastaPersonalizado, setHastaPersonalizado] = useState('');
  const [form, setForm] = useState({
    tipo: 'EGRESO',
    categoria: 'OTROS',
    descripcion: '',
    monto: '',
  });

  const rango = calcularRango(periodo, desdePersonalizado, hastaPersonalizado);

  useEffect(() => {
    cargarDatos();
    const intervalo = setInterval(cargarDatos, 10000);
    return () => clearInterval(intervalo);
  }, [periodo, desdePersonalizado, hastaPersonalizado]);

  const cargarDatos = async () => {
    const params: any = {};
    if (rango.desde) params.fechaDesde = rango.desde;
    if (rango.hasta) params.fechaHasta = rango.hasta;
    const [res, movs] = await Promise.all([
      api.get('/financiero/resumen', { params }),
      api.get('/financiero/movimientos', { params }),
    ]);
    setResumen(res.data);
    setMovimientos(movs.data);
  };

  const descargarExcel = async () => {
    setDescargando(true);
    try {
      const params: any = {};
      if (rango.desde) params.fechaDesde = rango.desde;
      if (rango.hasta) params.fechaHasta = rango.hasta;
      const respuesta = await api.get('/financiero/exportar', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([respuesta.data]));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `reporte-financiero-${periodo}.xlsx`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDescargando(false);
    }
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
        <div className="no-imprimir">
          <Navbar />
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Filtro de periodo + descargar/imprimir */}
          <div className="no-imprimir flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {([
                ['hoy', 'Hoy'],
                ['mes', 'Este mes'],
                ['anio', 'Este año'],
                ['personalizado', 'Personalizado'],
              ] as [Periodo, string][]).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  onClick={() => setPeriodo(valor)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    periodo === valor ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
              {periodo === 'personalizado' && (
                <div className="flex items-center gap-2 ml-1">
                  <input
                    type="date"
                    value={desdePersonalizado}
                    onChange={(e) => setDesdePersonalizado(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                  <span className="text-gray-500 text-sm">a</span>
                  <input
                    type="date"
                    value={hastaPersonalizado}
                    onChange={(e) => setHastaPersonalizado(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
              >
                <Printer size={16} />
                Imprimir
              </button>
              <button
                onClick={descargarExcel}
                disabled={descargando}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
              >
                <Download size={16} />
                {descargando ? 'Descargando...' : 'Descargar Excel'}
              </button>
            </div>
          </div>

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

          {/* Ventas por forma de pago */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Ventas por forma de pago</h2>
              <span className="text-gray-500 text-sm">Total del periodo: ${(resumen?.totalVentasRango || 0).toLocaleString()} · {resumen?.cantidadPedidosRango || 0} pedidos</span>
            </div>
            {!resumen?.ventasPorMetodoPago?.length ? (
              <p className="text-gray-500 text-sm text-center py-6">Sin ventas registradas en este periodo</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {resumen.ventasPorMetodoPago.map((v: any) => {
                  const Icono = ICONOS_METODO[v.metodo] || Wallet;
                  const porcentaje = resumen.totalVentasRango > 0 ? Math.round((v.total / resumen.totalVentasRango) * 100) : 0;
                  return (
                    <div key={v.metodo} className="bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Icono size={15} className="text-orange-400" />
                        <span className="text-gray-400 text-xs">{ETIQUETAS_METODO[v.metodo] || v.metodo}</span>
                      </div>
                      <div className="text-white font-bold text-sm">${Number(v.total).toLocaleString()}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{porcentaje}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Movimientos */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-semibold">Movimientos financieros</h2>
              <button
                onClick={() => setModal(true)}
                className="no-imprimir flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
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
          <div className="no-imprimir fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
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