'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { Upload, Settings, User, Users, Plus, X, Shield, MapPin } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';

const MODULOS = [
  { key: 'pos', label: 'POS' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'productos', label: 'Productos' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'financiero', label: 'Financiero' },
  { key: 'cocina', label: 'Cocina / KDS' },
  { key: 'configuracion', label: 'Configuración' },
];

const ROLES = ['ADMIN_EMPRESA', 'GERENTE', 'CAJERO', 'COCINERO', 'DOMICILIARIO'];

function permisosVacios(todoTrue = false) {
  return MODULOS.reduce((acc, m) => {
    acc[m.key] = { ver: todoTrue, editar: todoTrue };
    return acc;
  }, {} as Record<string, { ver: boolean; editar: boolean }>);
}

export default function ConfiguracionPage() {
  const { usuario } = useAuthStore();
  const [tab, setTab] = useState<'empresa' | 'perfil' | 'usuarios' | 'sucursales'>('empresa');

  // ---- Empresa ----
  const [empresa, setEmpresa] = useState<any>(null);
  const [loadingLogo, setLoadingLogo] = useState(false);
  const [mensajeEmpresa, setMensajeEmpresa] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- Mi perfil ----
  const [perfil, setPerfil] = useState<any>(null);
  const [formPerfil, setFormPerfil] = useState({ nombre: '', email: '', password: '' });
  const [loadingPerfil, setLoadingPerfil] = useState(false);
  const [mensajePerfil, setMensajePerfil] = useState('');

  // ---- Usuarios ----
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [modalNuevoUsuario, setModalNuevoUsuario] = useState(false);
  const [modalPermisos, setModalPermisos] = useState<any>(null);
  const [permisosTemp, setPermisosTemp] = useState<any>(permisosVacios());
  const [loadingUsuario, setLoadingUsuario] = useState(false);
  const [formNuevoUsuario, setFormNuevoUsuario] = useState({
    nombre: '', email: '', password: '', rol: 'CAJERO', sucursalId: '',
  });

  // ---- Sucursales ----
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [modalNuevaSucursal, setModalNuevaSucursal] = useState(false);
  const [sucursalEditando, setSucursalEditando] = useState<any | null>(null);
  const [loadingSucursal, setLoadingSucursal] = useState(false);
  const [formNuevaSucursal, setFormNuevaSucursal] = useState({ nombre: '', direccion: '', telefono: '' });

  useEffect(() => {
    cargarEmpresa();
    cargarPerfil();
    cargarUsuarios();
    cargarSucursales();
  }, []);

  const cargarEmpresa = async () => {
    const { data } = await api.get('/empresa');
    setEmpresa(data);
  };

  const cargarPerfil = async () => {
    const { data } = await api.get('/usuarios/mi-perfil');
    setPerfil(data);
    setFormPerfil({ nombre: data.nombre, email: data.email, password: '' });
  };

  const cargarUsuarios = async () => {
    const { data } = await api.get('/usuarios');
    setUsuarios(data);
  };

  const cargarSucursales = async () => {
    const { data } = await api.get('/sucursales?incluirInactivas=true');
    setSucursales(data);
  };

  const subirLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const { data } = await api.post('/empresa/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setEmpresa({ ...empresa, logo: data.logoUrl });
      setMensajeEmpresa('✅ Logo actualizado correctamente');
      setTimeout(() => setMensajeEmpresa(''), 3000);
    } catch (e) {
      setMensajeEmpresa('❌ Error al subir el logo');
    } finally {
      setLoadingLogo(false);
    }
  };

  const guardarPerfil = async () => {
    setLoadingPerfil(true);
    try {
      const payload: any = { nombre: formPerfil.nombre, email: formPerfil.email };
      if (formPerfil.password) payload.password = formPerfil.password;
      await api.patch('/usuarios/mi-perfil', payload);
      setFormPerfil({ ...formPerfil, password: '' });
      setMensajePerfil('✅ Perfil actualizado correctamente');
      setTimeout(() => setMensajePerfil(''), 3000);
      cargarPerfil();
    } catch (e) {
      setMensajePerfil('❌ Error al actualizar el perfil');
    } finally {
      setLoadingPerfil(false);
    }
  };

  const crearUsuario = async () => {
    if (!formNuevoUsuario.nombre || !formNuevoUsuario.email || !formNuevoUsuario.password) return;
    setLoadingUsuario(true);
    try {
      await api.post('/usuarios', {
        ...formNuevoUsuario,
        sucursalId: formNuevoUsuario.sucursalId ? Number(formNuevoUsuario.sucursalId) : null,
      });
      setModalNuevoUsuario(false);
      setFormNuevoUsuario({ nombre: '', email: '', password: '', rol: 'CAJERO', sucursalId: '' });
      cargarUsuarios();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsuario(false);
    }
  };

  const abrirPermisos = (u: any) => {
    setModalPermisos(u);
    setPermisosTemp(u.permisos || permisosVacios());
  };

  const togglePermiso = (modulo: string, tipo: 'ver' | 'editar') => {
    setPermisosTemp((prev: any) => {
      const actual = prev[modulo] || { ver: false, editar: false };
      const nuevoValor = !actual[tipo];
      const actualizado = { ...actual, [tipo]: nuevoValor };
      if (tipo === 'editar' && nuevoValor) actualizado.ver = true;
      if (tipo === 'ver' && !nuevoValor) actualizado.editar = false;
      return { ...prev, [modulo]: actualizado };
    });
  };

  const guardarPermisos = async () => {
    if (!modalPermisos) return;
    setLoadingUsuario(true);
    try {
      await api.patch(`/usuarios/${modalPermisos.id}/permisos`, { permisos: permisosTemp });
      setModalPermisos(null);
      cargarUsuarios();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsuario(false);
    }
  };

  const toggleActivoUsuario = async (u: any) => {
    try {
      await api.patch(`/usuarios/${u.id}/toggle-activo`);
      cargarUsuarios();
    } catch (e) {
      console.error(e);
    }
  };

  const abrirNuevaSucursal = () => {
    setSucursalEditando(null);
    setFormNuevaSucursal({ nombre: '', direccion: '', telefono: '' });
    setModalNuevaSucursal(true);
  };

  const abrirEditarSucursal = (s: any) => {
    setSucursalEditando(s);
    setFormNuevaSucursal({
      nombre: s.nombre || '',
      direccion: s.direccion || '',
      telefono: s.telefono || '',
    });
    setModalNuevaSucursal(true);
  };

  const guardarSucursal = async () => {
    if (!formNuevaSucursal.nombre.trim()) return;
    setLoadingSucursal(true);
    try {
      if (sucursalEditando) {
        await api.patch(`/sucursales/${sucursalEditando.id}`, formNuevaSucursal);
      } else {
        await api.post('/sucursales', formNuevaSucursal);
      }

      setModalNuevaSucursal(false);
      setSucursalEditando(null);
      setFormNuevaSucursal({ nombre: '', direccion: '', telefono: '' });
      cargarSucursales();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSucursal(false);
    }
  };

  const toggleActivoSucursal = async (s: any) => {
    try {
      await api.patch(`/sucursales/${s.id}/toggle-activo`);
      cargarSucursales();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar />

        <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
          <h2 className="text-white text-xl font-bold mb-6">Configuración</h2>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-800 overflow-x-auto">
            <button
              onClick={() => setTab('empresa')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                tab === 'empresa' ? 'text-orange-500 border-orange-500' : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Settings size={16} /> Empresa
            </button>
            <button
              onClick={() => setTab('perfil')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                tab === 'perfil' ? 'text-orange-500 border-orange-500' : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <User size={16} /> Mi perfil
            </button>
            <button
              onClick={() => setTab('sucursales')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                tab === 'sucursales' ? 'text-orange-500 border-orange-500' : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <MapPin size={16} /> Sucursales
            </button>
            <button
              onClick={() => setTab('usuarios')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                tab === 'usuarios' ? 'text-orange-500 border-orange-500' : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Users size={16} /> Usuarios y permisos
            </button>
          </div>

          {/* TAB: Empresa */}
          {tab === 'empresa' && (
            <div>
              {mensajeEmpresa && (
                <div className={`rounded-lg p-3 mb-4 text-sm ${mensajeEmpresa.includes('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                  {mensajeEmpresa}
                </div>
              )}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
                <div>
                  <h3 className="text-white font-semibold mb-4">Logo de la empresa</h3>
                  <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-800 border border-gray-700 flex items-center justify-center">
                      {empresa?.logo ? (
                        <img src={empresa.logo} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl">🍔</span>
                      )}
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm mb-3">El logo aparece en los tickets de venta</p>
                      <input type="file" ref={fileRef} onChange={subirLogo} accept="image/*" className="hidden" />
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={loadingLogo}
                        className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
                      >
                        <Upload size={16} />
                        {loadingLogo ? 'Subiendo...' : 'Subir logo'}
                      </button>
                      <p className="text-gray-600 text-xs mt-2">PNG, JPG o WebP — máximo 2MB</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-6">
                  <h3 className="text-white font-semibold mb-4">Información de la empresa</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Nombre</span>
                      <span className="text-white">{empresa?.nombre}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Tipo de negocio</span>
                      <span className="text-white">{{ RESTAURANTE: 'Restaurante o bar', SUPERMERCADO: 'Supermercado', TIENDA: 'Tienda', COMERCIO: 'Comercio' }[empresa?.tipoNegocio as 'RESTAURANTE' | 'SUPERMERCADO' | 'TIENDA' | 'COMERCIO'] || 'Restaurante o bar'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">NIT</span>
                      <span className="text-white">{empresa?.nit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Email</span>
                      <span className="text-white">{empresa?.email}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Teléfono</span>
                      <span className="text-white">{empresa?.telefono || 'No registrado'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Mi perfil */}
          {tab === 'perfil' && (
            <div>
              {mensajePerfil && (
                <div className={`rounded-lg p-3 mb-4 text-sm ${mensajePerfil.includes('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                  {mensajePerfil}
                </div>
              )}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <h3 className="text-white font-semibold mb-2">Mis datos</h3>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={formPerfil.nombre}
                    onChange={(e) => setFormPerfil({ ...formPerfil, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={formPerfil.email}
                    onChange={(e) => setFormPerfil({ ...formPerfil, email: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nueva contraseña (opcional)</label>
                  <input
                    type="password"
                    value={formPerfil.password}
                    onChange={(e) => setFormPerfil({ ...formPerfil, password: e.target.value })}
                    placeholder="Dejar en blanco para no cambiarla"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs pt-2">
                  <Shield size={14} />
                  <span>Rol: {perfil?.rol}</span>
                </div>
                <button
                  onClick={guardarPerfil}
                  disabled={loadingPerfil}
                  className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 px-6 transition-colors"
                >
                  {loadingPerfil ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          )}

          {/* TAB: Sucursales */}
          {tab === 'sucursales' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-white font-semibold">Sucursales de la empresa</h3>
                <button
                  onClick={abrirNuevaSucursal}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
                >
                  <Plus size={16} />
                  Nueva sucursal
                </button>
              </div>
              <div className="divide-y divide-gray-800">
                {sucursales.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No hay sucursales registradas</div>
                ) : (
                  sucursales.map((s) => (
                    <div key={s.id} className={`p-4 flex items-center justify-between ${!s.activo ? 'opacity-50' : ''}`}>
                      <div>
                        <div className="text-white text-sm font-medium flex items-center gap-2">
                          {s.nombre}
                          {!s.activo && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Inactiva</span>}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          {s.direccion || 'Sin dirección registrada'} {s.telefono ? `· ${s.telefono}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => abrirEditarSucursal(s)}
                          className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleActivoSucursal(s)}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                            s.activo ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
                          }`}
                        >
                          {s.activo ? 'Inactivar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: Usuarios y permisos */}
          {tab === 'usuarios' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-white font-semibold">Usuarios de la empresa</h3>
                <button
                  onClick={() => setModalNuevoUsuario(true)}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors"
                >
                  <Plus size={16} />
                  Nuevo usuario
                </button>
              </div>
              <div className="divide-y divide-gray-800">
                {usuarios.map((u) => (
                  <div key={u.id} className={`p-4 flex items-center justify-between ${!u.activo ? 'opacity-50' : ''}`}>
                    <div>
                      <div className="text-white text-sm font-medium flex items-center gap-2">
                        {u.nombre}
                        {!u.activo && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Inactivo</span>}
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">
                        {u.email} · {u.rol} {u.sucursal?.nombre ? `· ${u.sucursal.nombre}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => abrirPermisos(u)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Permisos
                      </button>
                      <button
                        onClick={() => toggleActivoUsuario(u)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                          u.activo ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
                        }`}
                      >
                        {u.activo ? 'Inactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal nueva sucursal */}
        {modalNuevaSucursal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-4">{sucursalEditando ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input type="text" value={formNuevaSucursal.nombre}
                    onChange={(e) => setFormNuevaSucursal({ ...formNuevaSucursal, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    placeholder="Ej: Sucursal Norte" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Dirección (opcional)</label>
                  <input type="text" value={formNuevaSucursal.direccion}
                    onChange={(e) => setFormNuevaSucursal({ ...formNuevaSucursal, direccion: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Teléfono (opcional)</label>
                  <input type="text" value={formNuevaSucursal.telefono}
                    onChange={(e) => setFormNuevaSucursal({ ...formNuevaSucursal, telefono: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => {
                    setModalNuevaSucursal(false);
                    setSucursalEditando(null);
                    setFormNuevaSucursal({ nombre: '', direccion: '', telefono: '' });
                  }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={guardarSucursal} disabled={loadingSucursal}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loadingSucursal ? (sucursalEditando ? 'Guardando...' : 'Creando...') : (sucursalEditando ? 'Guardar cambios' : 'Crear sucursal')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal nuevo usuario */}
        {modalNuevoUsuario && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-4">Nuevo usuario</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                  <input type="text" value={formNuevoUsuario.nombre}
                    onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, nombre: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Email</label>
                  <input type="email" value={formNuevoUsuario.email}
                    onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, email: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Contraseña</label>
                  <input type="password" value={formNuevoUsuario.password}
                    onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, password: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Rol</label>
                    <select value={formNuevoUsuario.rol}
                      onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, rol: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Sucursal</label>
                    <select value={formNuevoUsuario.sucursalId}
                      onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, sucursalId: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500">
                      <option value="">Sin asignar</option>
                      {sucursales.filter((s) => s.activo).map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-gray-600 text-xs">Los permisos por módulo se configuran después de crear el usuario</p>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalNuevoUsuario(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={crearUsuario} disabled={loadingUsuario}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loadingUsuario ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal permisos */}
        {modalPermisos && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg border border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-bold text-lg">{modalPermisos.nombre}</h3>
                <button onClick={() => setModalPermisos(null)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-gray-500 text-sm mb-4">{modalPermisos.email} · {modalPermisos.rol}</p>

              <div className="space-y-2">
                <div className="grid grid-cols-[1fr,auto,auto] gap-2 text-xs text-gray-500 font-medium px-2">
                  <span>Módulo</span>
                  <span className="text-center w-14">Ver</span>
                  <span className="text-center w-14">Editar</span>
                </div>
                {MODULOS.map((m) => {
                  const p = permisosTemp[m.key] || { ver: false, editar: false };
                  return (
                    <div key={m.key} className="grid grid-cols-[1fr,auto,auto] gap-2 items-center bg-gray-800 rounded-lg px-3 py-2">
                      <span className="text-white text-sm">{m.label}</span>
                      <button
                        onClick={() => togglePermiso(m.key, 'ver')}
                        className={`w-14 text-xs py-1 rounded-md transition-colors ${
                          p.ver ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-700 text-gray-500 border border-gray-600'
                        }`}
                      >
                        {p.ver ? 'Sí' : 'No'}
                      </button>
                      <button
                        onClick={() => togglePermiso(m.key, 'editar')}
                        className={`w-14 text-xs py-1 rounded-md transition-colors ${
                          p.editar ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-700 text-gray-500 border border-gray-600'
                        }`}
                      >
                        {p.editar ? 'Sí' : 'No'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalPermisos(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors">
                  Cancelar
                </button>
                <button onClick={guardarPermisos} disabled={loadingUsuario}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold rounded-lg py-3 transition-colors">
                  {loadingUsuario ? 'Guardando...' : 'Guardar permisos'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
