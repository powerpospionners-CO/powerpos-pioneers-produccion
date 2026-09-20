'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Package, AlertTriangle, Plus, Minus, RefreshCw, History } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';
import RetailInventario from './RetailInventario';

function RestauranteInventario() {
  const [ingredientes, setIngredientes] = useState<any[]>([]);
  const [preparaciones, setPreparaciones] = useState<any[]>([]);
  const [modal, setModal] = useState<any>(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState<any>(null);
  const [modalPreparacion, setModalPreparacion] = useState(false);
  const [historialModal, setHistorialModal] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tipo: 'ENTRADA',
    cantidad: '',
    descripcion: '',
    enUnidadCompra: false,
  });
  const [formNuevo, setFormNuevo] = useState({
    nombre: '',
    unidad: 'gramos',
    stock: '',
    stockMinimo: '',
    unidadCompra: '',
    factorConversion: '',
    costoUnitario: '',
  });
  const [formEditar, setFormEditar] = useState({
    nombre: '',
    unidad: '',
    stockMinimo: '',
    unidadCompra: '',
    factorConversion: '',
    costoUnitario: '',
  });
  const [formPreparacion, setFormPreparacion] = useState({
    nombre: '',
    descripcion: '',
    unidad: 'porciones',
    ingredientes: [] as any[],
  });
  const [filtro, setFiltro] = useState('todos');
  const [verInactivos, setVerInactivos] = useState(false);

  useEffect(() => {
    cargarDatos();
    const intervalo = setInterval(cargarDatos, 15000);
    return () => clearInterval(intervalo);
  }, [verInactivos]);

  const cargarDatos = async () => {
    const [inventarioResp, preparacionesResp] = await Promise.all([
      api.get(`/inventario?incluirInactivos=${verInactivos}`),
      api.get('/preparaciones'),
    ]);
    setIngredientes(inventarioResp.data);
    setPreparaciones(preparacionesResp.data);
  };

  const verHistorial = async (ing: any) => {
    setHistorialModal(ing);
    const { data } = await api.get(`/inventario/${ing.id}/historial`);
    setHistorial(data);
  };

  const ajustar = async () => {
    if (!form.cantidad || !modal) return;
    setLoading(true);
    try {
      await api.post(`/inventario/${modal.id}/ajuste`, {
        tipo: form.tipo,
        cantidad: Number(form.cantidad),
        descripcion: form.descripcion,
        enUnidadCompra: form.enUnidadCompra,
      });
      setModal(null);
      setForm({ tipo: 'ENTRADA', cantidad: '', descripcion: '', enUnidadCompra: false });
      cargarDatos();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const crearIngrediente = async () => {
    if (!formNuevo.nombre || !formNuevo.unidad) return;
    setLoading(true);
    try {
      await api.post('/inventario', {
        nombre: formNuevo.nombre,
        unidad: formNuevo.unidad,
        stock: Number(formNuevo.stock) || 0,
        stockMinimo: Number(formNuevo.stockMinimo) || 0,
        unidadCompra: formNuevo.unidadCompra || null,
        factorConversion: formNuevo.factorConversion ? Number(formNuevo.factorConversion) : null,
        costoUnitario: formNuevo.costoUnitario ? Number(formNuevo.costoUnitario) : null,
      });
      setModalNuevo(false);
      setFormNuevo({ nombre: '', unidad: 'gramos', stock: '', stockMinimo: '', unidadCompra: '', factorConversion: '', costoUnitario: '' });
      cargarDatos();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const abrirEdicion = (ing: any) => {
    setModalEditar(ing);
    setFormEditar({
      nombre: ing.nombre,
      unidad: ing.unidad,
      stockMinimo: String(ing.stockMinimo),
      unidadCompra: ing.unidadCompra || '',
      factorConversion: ing.factorConversion ? String(ing.factorConversion) : '',
      costoUnitario: ing.costoUnitario ? String(ing.costoUnitario) : '',
    });
  };

  const guardarEdicion = async () => {
    if (!modalEditar) return;
    setLoading(true);
    try {
      await api.patch(`/inventario/${modalEditar.id}`, {
        nombre: formEditar.nombre,
        unidad: formEditar.unidad,
        stockMinimo: Number(formEditar.stockMinimo),
        unidadCompra: formEditar.unidadCompra || null,
        factorConversion: formEditar.factorConversion ? Number(formEditar.factorConversion) : null,
        costoUnitario: formEditar.costoUnitario ? Number(formEditar.costoUnitario) : null,
      });
      setModalEditar(null);
      cargarDatos();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleActivo = async (ing: any) => {
    try {
      await api.patch(`/inventario/${ing.id}/toggle-activo`);
      cargarDatos();
    } catch (e) {
      console.error(e);
    }
  };

  const crearPreparacion = async () => {
    if (!formPreparacion.nombre) return;
    setLoading(true);
    try {
      await api.post('/preparaciones', {
        nombre: formPreparacion.nombre,
        descripcion: formPreparacion.descripcion,
        unidad: formPreparacion.unidad,
        ingredientes: formPreparacion.ingredientes,
      });
      setModalPreparacion(false);
      setFormPreparacion({ nombre: '', descripcion: '', unidad: 'porciones', ingredientes: [] });
      cargarDatos();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const agregarIngredientePreparacion = () => {
    setFormPreparacion((prev) => ({
      ...prev,
      ingredientes: [...prev.ingredientes, { ingredienteId: '', cantidad: '', unidad: 'gramos', observacion: '' }],
    }));
  };

  const actualizarIngredientePreparacion = (index: number, campo: string, valor: string) => {
    setFormPreparacion((prev) => ({
      ...prev,
      ingredientes: prev.ingredientes.map((ing, i) => i === index ? { ...ing, [campo]: valor } : ing),
    }));
  };

  const ingredientesFiltrados = ingredientes.filter(ing => {
    if (filtro === 'bajo') return ing.stockBajo;
    if (filtro === 'critico') return ing.stockCritico;
    return true;
  });

  const totalBajoStock = ingredientes.filter(i => i.stockBajo).length;
  const totalCritico = ingredientes.filter(i => i.stockCritico).length;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar />

        <div className="flex-1 p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-500/10 p-2 rounded-lg"><Package size={18} className="text-blue-400" /></div>
                <span className="text-gray-400 text-sm">Total ingredientes</span>
              </div>
              <div className="text-2xl font-bold text-white">{ingredientes.length}</div>
            </div>
            <div className="bg-gray-900 border border-yellow-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-yellow-500/10 p-2 rounded-lg"><AlertTriangle size={18} className="text-yellow-400" /></div>
                <span className="text-gray-400 text-sm">Stock bajo</span>
              </div>
              <div className="text-2xl font-bold text-yellow-400">{totalBajoStock}</div>
            </div>
            <div className="bg-gray-900 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-red-500/10 p-2 rounded-lg"><AlertTriangle size={18} className="text-red-400" /></div>
                <span className="text-gray-400 text-sm">Stock crítico</span>
              </div>
              <div className="text-2xl font-bold text-red-400">{totalCritico}</div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-semibold">Ingredientes e insumos</h2>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {['todos', 'bajo', 'critico'].map(f => (
                    <button key={f} onClick={() => setFiltro(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filtro === f ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      {f === 'todos' ? 'Todos' : f === 'bajo' ? 'Stock bajo' : 'Crítico'}
                    </button>
                  ))}
                  <button
                    onClick={() => setVerInactivos(!verInactivos)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${verInactivos ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {verInactivos ? '👁 Viendo inactivos' : 'Ver inactivos'}
                  </button>
                </div>
                <button
                  onClick={() => setModalPreparacion(true)}
                  className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-sm font-medium rounded-lg px-3 py-2 transition-colors"
                >
                  <Plus size={16} />
                  Nueva preparación
                </button>
                <button
                  onClick={() => setModalNuevo(true)}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
                >
                  <Plus size={16} />
                  Nuevo ingrediente
                </button>
                <button onClick={cargarDatos} className="text-gray-500 hover:text-white transition-colors">
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-500 text-sm font-medium px-4 py-3">Ingrediente</th>
                  <th className="text-left text-gray-500 text-sm font-medium px-4 py-3">Stock anterior</th>
                  <th className="text-left text-gray-500 text-sm font-medium px-4 py-3">Stock actual</th>
                  <th className="text-left text-gray-500 text-sm font-medium px-4 py-3">Mínimo</th>
                  <th className="text-left text-gray-500 text-sm font-medium px-4 py-3">Costo unit.</th>
                  <th className="text-left text-gray-500 text-sm font-medium px-4 py-3">Estado</th>
                  <th className="text-right text-gray-500 text-sm font-medium px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {ingredientesFiltrados.map((ing) => {
                  const ultimoMov = ing.movimientos?.[0];
                  return (
                    <tr key={ing.id} className={`hover:bg-gray-800/50 transition-colors ${!ing.activo ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="text-white font-medium text-sm flex items-center gap-2">
                          {ing.nombre}
                          {!ing.activo && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Inactivo</span>
                          )}
                        </div>
                        <div className="text-gray-500 text-xs">
                          {ing.unidad}
                          {ing.unidadCompra && (
                            <span className="ml-2 text-blue-400">· Compra: {ing.unidadCompra} (×{Number(ing.factorConversion).toLocaleString()})</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {ultimoMov ? (
                          <span className="text-gray-400 text-sm">{Number(ultimoMov.stockAnterior).toLocaleString()} {ing.unidad}</span>
                        ) : (
                          <span className="text-gray-600 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${ing.stockCritico ? 'text-red-400' : ing.stockBajo ? 'text-yellow-400' : 'text-white'}`}>
                          {Number(ing.stock).toLocaleString()} {ing.unidad}
                        </span>
                        {ultimoMov && (
                          <div className="text-xs mt-0.5">
                            {Number(ultimoMov.stockNuevo) > Number(ultimoMov.stockAnterior)
                              ? <span className="text-green-400">↑ +{(Number(ultimoMov.stockNuevo) - Number(ultimoMov.stockAnterior)).toLocaleString()}</span>
                              : <span className="text-red-400">↓ -{(Number(ultimoMov.stockAnterior) - Number(ultimoMov.stockNuevo)).toLocaleString()}</span>
                            }
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-400 text-sm">{Number(ing.stockMinimo).toLocaleString()} {ing.unidad}</span>
                      </td>
                      <td className="px-4 py-3">
                        {ing.costoUnitario ? (
                          <span className="text-emerald-400 text-sm">${Number(ing.costoUnitario).toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-600 text-xs">Sin definir</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ing.stockCritico ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">🚨 Crítico</span>
                        ) : ing.stockBajo ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">⚠️ Bajo</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">✓ Normal</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end flex-wrap">
                          <button onClick={() => { setModal(ing); setForm({ tipo: 'ENTRADA', cantidad: '', descripcion: '', enUnidadCompra: false }); }}
                            className="flex items-center gap-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-lg transition-colors">
                            <Plus size={12} />Entrada
                          </button>
                          <button onClick={() => { setModal(ing); setForm({ tipo: 'SALIDA', cantidad: '', descripcion: '', enUnidadCompra: false }); }}
                            className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-lg transition-colors">
                            <Minus size={12} />Salida
                          </button>
                          <button onClick={() => { setModal(ing); setForm({ tipo: 'AJUSTE', cantidad: String(ing.stock), descripcion: '', enUnidadCompra: false }); }}
                            className="flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-lg transition-colors">
                            Ajuste
                          </button>
                          <button onClick={() => verHistorial(ing)}
                            className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded-lg transition-colors">
                            <History size={12} />
                          </button>
                          <button onClick={() => abrirEdicion(ing)}
                            className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded-lg transition-colors">
                            Editar
                          </button>
                          <button onClick={() => toggleActivo(ing)}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                              ing.activo ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
                            }`}>
                            {ing.activo ? 'Inactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Preparaciones y lotes</h3>
              <button
                onClick={() => setModalPreparacion(true)}
                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-sm font-medium rounded-lg px-3 py-2 transition-colors"
              >
                Crear preparación
              </button>
            </div>
            {preparaciones.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay preparaciones creadas aún.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {preparaciones.map((prep) => (
                  <div key={prep.id} className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{prep.nombre}</span>
                      <span className="text-xs text-blue-400">{prep.unidad}</span>
                    </div>
                    <div className="text-gray-400 text-xs mb-2">{prep.descripcion || 'Sin descripción'}</div>
                    <div className="text-xs text-gray-500">
                      Ingredientes: {prep.ingredientes?.length || 0} · Lotes: {prep.lotes?.length || 0} · Disponibles: {prep.porcionesDisponibles ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal creación de preparación */}
        {modalPreparacion && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-800 max-h-[85vh] overflow-y-auto">
              <h3 className="text-white font-bold text-lg mb-4">Nueva preparación</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={formPreparacion.nombre}
                    onChange={(e) => setFormPreparacion({ ...formPreparacion, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                  <input
                    type="text"
                    value={formPreparacion.descripcion}
                    onChange={(e) => setFormPreparacion({ ...formPreparacion, descripcion: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Unidad de salida</label>
                  <select
                    value={formPreparacion.unidad}
                    onChange={(e) => setFormPreparacion({ ...formPreparacion, unidad: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="porciones">Porciones</option>
                    <option value="unidades">Unidades</option>
                    <option value="gramos">Gramos</option>
                  </select>
                </div>
                <div className="border-t border-gray-800 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Ingredientes de la preparación</span>
                    <button
                      type="button"
                      onClick={agregarIngredientePreparacion}
                      className="text-orange-500 text-xs font-medium"
                    >
                      + Agregar
                    </button>
                  </div>

                  {formPreparacion.ingredientes.length === 0 ? (
                    <p className="text-gray-500 text-xs">Aún no hay ingredientes vinculados.</p>
                  ) : (
                    <div className="space-y-2">
                      {formPreparacion.ingredientes.map((ing, index) => (
                        <div key={index} className="bg-gray-800 rounded-lg p-2 space-y-2">
                          <select
                            value={ing.ingredienteId}
                            onChange={(e) => actualizarIngredientePreparacion(index, 'ingredienteId', e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs"
                          >
                            <option value="">Seleccione ingrediente</option>
                            {ingredientes.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.nombre} ({opt.unidad})</option>
                            ))}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              value={ing.cantidad}
                              onChange={(e) => actualizarIngredientePreparacion(index, 'cantidad', e.target.value)}
                              placeholder="Cantidad"
                              className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs"
                            />
                            <input
                              type="text"
                              value={ing.unidad}
                              onChange={(e) => actualizarIngredientePreparacion(index, 'unidad', e.target.value)}
                              placeholder="Unidad"
                              className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs"
                            />
                          </div>
                          <input
                            type="text"
                            value={ing.observacion}
                            onChange={(e) => actualizarIngredientePreparacion(index, 'observacion', e.target.value)}
                            placeholder="Observación opcional"
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalPreparacion(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={crearPreparacion} disabled={loading || !formPreparacion.nombre} className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/40 text-white font-bold rounded-lg py-3 transition-colors">
                  {loading ? 'Guardando...' : 'Guardar preparación'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal ajuste */}
        {modal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-1">{modal.nombre}</h3>
              <p className="text-gray-400 text-sm mb-4">
                Stock actual: <span className="text-white font-medium">{Number(modal.stock).toLocaleString()} {modal.unidad}</span>
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                    <option value="ENTRADA">Entrada — agregar stock</option>
                    <option value="SALIDA">Salida — retirar stock</option>
                    <option value="AJUSTE">Ajuste — cantidad exacta</option>
                  </select>
                </div>
                {modal.unidadCompra && modal.factorConversion && form.tipo === 'ENTRADA' && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.enUnidadCompra}
                        onChange={(e) => setForm({ ...form, enUnidadCompra: e.target.checked })}
                        className="accent-orange-500" />
                      <span className="text-blue-400 text-sm">
                        Ingresar en {modal.unidadCompra} (1 {modal.unidadCompra} = {Number(modal.factorConversion).toLocaleString()} {modal.unidad})
                      </span>
                    </label>
                    {form.enUnidadCompra && form.cantidad && (
                      <p className="text-gray-400 text-xs mt-2">
                        = {(Number(form.cantidad) * Number(modal.factorConversion)).toLocaleString()} {modal.unidad} en inventario
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {form.enUnidadCompra ? `Cantidad en ${modal.unidadCompra}` : `Cantidad en ${modal.unidad}`}
                  </label>
                  <input type="number" value={form.cantidad}
                    onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                  <input type="text" value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Ej: Compra proveedor, merma, conteo físico..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModal(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={ajustar} disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loading ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal nuevo ingrediente */}
        {modalNuevo && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-4">Nuevo ingrediente</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input type="text" value={formNuevo.nombre}
                    onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Ej: Queso, Salchicha, Gaseosa..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Unidad de uso</label>
                    <select value={formNuevo.unidad}
                      onChange={(e) => setFormNuevo({ ...formNuevo, unidad: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                      <option value="gramos">Gramos</option>
                      <option value="unidad">Unidad</option>
                      <option value="mililitros">Mililitros</option>
                      <option value="lonchas">Lonchas</option>
                      <option value="porciones">Porciones</option>
                      <option value="litros">Litros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Stock inicial</label>
                    <input type="number" value={formNuevo.stock}
                      onChange={(e) => setFormNuevo({ ...formNuevo, stock: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Stock mínimo (alerta)</label>
                    <input type="number" value={formNuevo.stockMinimo}
                      onChange={(e) => setFormNuevo({ ...formNuevo, stockMinimo: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Costo por {formNuevo.unidad}</label>
                    <input type="number" step="0.01" value={formNuevo.costoUnitario}
                      onChange={(e) => setFormNuevo({ ...formNuevo, costoUnitario: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                      placeholder="Ej: 25" />
                  </div>
                </div>
                <div className="border-t border-gray-800 pt-4">
                  <p className="text-gray-400 text-xs mb-3">Conversión de unidades (opcional) — Ej: queso viene en libras pero se usa en lonchas</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Unidad de compra</label>
                      <input type="text" value={formNuevo.unidadCompra}
                        onChange={(e) => setFormNuevo({ ...formNuevo, unidadCompra: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        placeholder="Ej: libra, caja..." />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Factor (unidades por compra)</label>
                      <input type="number" value={formNuevo.factorConversion}
                        onChange={(e) => setFormNuevo({ ...formNuevo, factorConversion: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        placeholder="Ej: 16" />
                    </div>
                  </div>
                  {formNuevo.unidadCompra && formNuevo.factorConversion && (
                    <p className="text-blue-400 text-xs mt-2">
                      1 {formNuevo.unidadCompra} = {formNuevo.factorConversion} {formNuevo.unidad}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalNuevo(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={crearIngrediente} disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loading ? 'Creando...' : 'Crear ingrediente'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal editar */}
        {modalEditar && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-4">Editar ingrediente</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input type="text" value={formEditar.nombre}
                    onChange={(e) => setFormEditar({ ...formEditar, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Unidad de uso</label>
                    <select value={formEditar.unidad}
                      onChange={(e) => setFormEditar({ ...formEditar, unidad: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                      <option value="gramos">Gramos</option>
                      <option value="unidad">Unidad</option>
                      <option value="mililitros">Mililitros</option>
                      <option value="lonchas">Lonchas</option>
                      <option value="porciones">Porciones</option>
                      <option value="litros">Litros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Stock mínimo</label>
                    <input type="number" value={formEditar.stockMinimo}
                      onChange={(e) => setFormEditar({ ...formEditar, stockMinimo: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Costo por {formEditar.unidad}</label>
                  <input type="number" step="0.01" value={formEditar.costoUnitario}
                    onChange={(e) => setFormEditar({ ...formEditar, costoUnitario: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Ej: 25" />
                </div>
                <div className="border-t border-gray-800 pt-4">
                  <p className="text-gray-400 text-xs mb-3">Conversión de unidades (opcional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Unidad de compra</label>
                      <input type="text" value={formEditar.unidadCompra}
                        onChange={(e) => setFormEditar({ ...formEditar, unidadCompra: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        placeholder="Ej: libra, caja..." />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Factor</label>
                      <input type="number" value={formEditar.factorConversion}
                        onChange={(e) => setFormEditar({ ...formEditar, factorConversion: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        placeholder="Ej: 16" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalEditar(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={guardarEdicion} disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loading ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal historial */}
        {historialModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-800 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-lg">{historialModal.nombre}</h3>
                  <p className="text-gray-400 text-sm">Historial de movimientos</p>
                </div>
                <button onClick={() => setHistorialModal(null)} className="text-gray-500 hover:text-white transition-colors text-xl">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {historial.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No hay movimientos registrados</p>
                ) : (
                  historial.map((mov) => (
                    <div key={mov.id} className="bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            mov.tipo === 'ENTRADA' ? 'bg-green-500/20 text-green-400' :
                            mov.tipo === 'SALIDA' ? 'bg-red-500/20 text-red-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>{mov.tipo}</span>
                          <span className="text-white text-sm font-medium">
                            {mov.tipo === 'ENTRADA' ? '+' : mov.tipo === 'SALIDA' ? '-' : '='}
                            {Number(mov.cantidadMovida).toLocaleString()} {historialModal.unidad}
                          </span>
                          {mov.unidadCompra && (
                            <span className="text-blue-400 text-xs">({Number(mov.cantidadMovida) / Number(mov.factorAplicado)} {mov.unidadCompra})</span>
                          )}
                        </div>
                        <span className="text-gray-500 text-xs">{new Date(mov.creadoEn).toLocaleString('es-CO')}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Antes: <span className="text-gray-300">{Number(mov.stockAnterior).toLocaleString()}</span></span>
                        <span>→</span>
                        <span>Después: <span className="text-gray-300">{Number(mov.stockNuevo).toLocaleString()}</span></span>
                        <span>· {mov.usuario?.nombre}</span>
                      </div>
                      {mov.descripcion && (
                        <p className="text-gray-400 text-xs mt-1">📝 {mov.descripcion}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

export default function InventarioPage() {
  const tipoNegocio = useAuthStore((state) => state.usuario?.tipoNegocio);
  return tipoNegocio && tipoNegocio !== 'RESTAURANTE' ? <RetailInventario /> : <RestauranteInventario />;
}