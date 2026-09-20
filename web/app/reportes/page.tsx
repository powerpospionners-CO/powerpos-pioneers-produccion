'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Trophy, Users, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

export default function ReportesPage() {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [mejoresClientes, setMejoresClientes] = useState<any[]>([]);
  const [periodos, setPeriodos] = useState<any>(null);
  const [rentabilidad, setRentabilidad] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [empRes, cliRes, perRes, rentRes] = await Promise.all([
        api.get('/reportes/empleados'),
        api.get('/reportes/clientes'),
        api.get('/reportes/periodos'),
        api.get('/reportes/rentabilidad'),
      ]);
      setEmpleados(empRes.data);
      setMejoresClientes(cliRes.data);
      setPeriodos(perRes.data);
      setRentabilidad(rentRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatoVariacion = (valor: number | null) => {
    if (valor === null) return <span className="text-gray-500">Sin datos previos</span>;
    const positivo = valor >= 0;
    return (
      <span className={`flex items-center gap-1 ${positivo ? 'text-green-400' : 'text-red-400'}`}>
        {positivo ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {Math.abs(valor).toFixed(1)}%
      </span>
    );
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-950 flex flex-col">
          <Navbar />
          <div className="flex-1 flex items-center justify-center text-gray-500">Cargando reportes...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar />

        <div className="flex-1 p-6 space-y-6">
          <h2 className="text-white text-xl font-bold">Reportes avanzados</h2>

          {/* Comparativa por periodo */}
          {periodos && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <span className="text-xl">📅</span> Esta semana vs semana pasada
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-gray-500 text-xs">Esta semana</p>
                    <p className="text-white font-bold text-lg">${periodos.semana.actual.total.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">{periodos.semana.actual.cantidadPedidos} pedidos</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Semana pasada</p>
                    <p className="text-gray-400 font-bold text-lg">${periodos.semana.anterior.total.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">{periodos.semana.anterior.cantidadPedidos} pedidos</p>
                  </div>
                </div>
                <div className="border-t border-gray-800 pt-3">
                  {formatoVariacion(periodos.semana.variacionPorcentual)}
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <span className="text-xl">🗓️</span> Este mes vs mes pasado
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-gray-500 text-xs">Este mes</p>
                    <p className="text-white font-bold text-lg">${periodos.mes.actual.total.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">{periodos.mes.actual.cantidadPedidos} pedidos</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Mes pasado</p>
                    <p className="text-gray-400 font-bold text-lg">${periodos.mes.anterior.total.toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">{periodos.mes.anterior.cantidadPedidos} pedidos</p>
                  </div>
                </div>
                <div className="border-t border-gray-800 pt-3">
                  {formatoVariacion(periodos.mes.variacionPorcentual)}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Rendimiento por empleado */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Trophy size={18} className="text-yellow-400" /> Rendimiento por empleado
              </h3>
              {empleados.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Sin ventas registradas</p>
              ) : (
                <div className="space-y-2">
                  {empleados.map((emp, index) => (
                    <div key={emp.nombre} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                          index === 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-400'
                        }`}>{index + 1}</span>
                        <div>
                          <p className="text-white text-sm font-medium">{emp.nombre}</p>
                          <p className="text-gray-500 text-xs">{emp.cantidadPedidos} pedidos · ticket prom. ${Math.round(emp.ticketPromedio).toLocaleString()}</p>
                        </div>
                      </div>
                      <span className="text-orange-500 font-bold text-sm">${emp.totalVentas.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mejores clientes */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Users size={18} className="text-blue-400" /> Mejores clientes
              </h3>
              {mejoresClientes.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Sin clientes con compras registradas</p>
              ) : (
                <div className="space-y-2">
                  {mejoresClientes.map((cli, index) => (
                    <div key={cli.id} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                          index === 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-400'
                        }`}>{index + 1}</span>
                        <div>
                          <p className="text-white text-sm font-medium">{cli.nombre}</p>
                          <p className="text-gray-500 text-xs">{cli.cantidadPedidos} pedidos · ⭐ {cli.puntos} puntos</p>
                        </div>
                      </div>
                      <span className="text-orange-500 font-bold text-sm">${cli.totalGastado.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rentabilidad por producto */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Percent size={18} className="text-emerald-400" /> Rentabilidad por producto
            </h3>
            {rentabilidad.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Sin productos registrados</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(200, rentabilidad.length * 40)}>
                  <BarChart data={rentabilidad} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={12} unit="%" />
                    <YAxis dataKey="nombre" type="category" stroke="#71717a" fontSize={12} width={130} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value: any) => [`${value}%`, 'Margen']}
                    />
                    <Bar dataKey="margenPorcentual" radius={[0, 6, 6, 0]}>
                      {rentabilidad.map((r, index) => (
                        <Cell key={index} fill={r.margenPorcentual >= 50 ? '#10b981' : r.margenPorcentual >= 25 ? '#f7931e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-4 divide-y divide-gray-800">
                  {rentabilidad.map((r) => (
                    <div key={r.id} className="py-2 flex items-center justify-between text-sm">
                      <span className="text-white">{r.nombre}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500 text-xs">Costo: ${r.costoReceta.toLocaleString()}</span>
                        <span className="text-gray-500 text-xs">Venta: ${r.precioVenta.toLocaleString()}</span>
                        {!r.tieneCostosDefinidos && (
                          <span className="text-yellow-500 text-xs">⚠️ Costos incompletos</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}