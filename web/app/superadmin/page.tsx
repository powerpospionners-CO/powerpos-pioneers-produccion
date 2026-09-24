'use client';

import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Clock3, LogOut, Moon, Pencil, Plus, RefreshCw, Save, ShieldCheck, Sun, Trash2, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useTema } from '@/components/ThemeProvider';
import { irALoginGenerico } from '@/lib/navegacion';

const MODULOS = [
  { id: 'pos', label: 'POS y caja' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'productos', label: 'Productos y recetas' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'financiero', label: 'Financiero' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'cocina', label: 'Cocina / KDS' },
  { id: 'configuracion', label: 'Configuracion' },
];

type Plan = 'BASICO' | 'MEDIUM' | 'PREMIUM';
type TipoNegocio = 'RESTAURANTE' | 'SUPERMERCADO' | 'TIENDA' | 'COMERCIO';
const TIPOS_NEGOCIO: { value: TipoNegocio; label: string }[] = [
  { value: 'RESTAURANTE', label: 'Restaurante o bar' },
  { value: 'SUPERMERCADO', label: 'Supermercado' },
  { value: 'TIENDA', label: 'Tienda' },
  { value: 'COMERCIO', label: 'Otro comercio o empresa' },
];

interface Empresa {
  id: number;
  nombre: string;
  nit: string;
  email: string;
  telefono?: string;
  direccion?: string;
  activo: boolean;
  plan: Plan;
  tipoNegocio: TipoNegocio;
  permisos: Record<string, boolean>;
  modoPreparacion: 'KDS' | 'COMANDAS';
  facturacionElectronicaHabilitada: boolean;
  consumoEmpleadosHabilitado: boolean;
  catalogoHabilitado: boolean;
  _count: { usuarios: number; sucursales: number };
}

interface Resumen {
  empresas: number;
  empresasActivas: number;
  usuariosActivos: number;
}

interface RegistroAuditoria {
  id: number;
  accion: string;
  entidad: string;
  creadoEn: string;
  usuario?: { nombre: string; email: string };
  empresa?: { nombre: string };
}

const permisosPorPlan: Record<Plan, string[]> = {
  BASICO: ['pos', 'productos'],
  MEDIUM: ['pos', 'dashboard', 'productos', 'inventario', 'clientes', 'cocina', 'configuracion'],
  PREMIUM: MODULOS.map((modulo) => modulo.id),
};

export default function SuperadminPage() {
  const router = useRouter();
  const { usuario, logout } = useAuthStore();
  const { tema, cambiarTema } = useTema();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [seleccionada, setSeleccionada] = useState<Empresa | null>(null);
  const [plan, setPlan] = useState<Plan>('BASICO');
  const [tipoNegocio, setTipoNegocio] = useState<TipoNegocio>('RESTAURANTE');
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});
  const [modoPreparacion, setModoPreparacion] = useState<'KDS' | 'COMANDAS'>('KDS');
  const [facturacionHabilitada, setFacturacionHabilitada] = useState(false);
  const [consumoEmpleadosHabilitado, setConsumoEmpleadosHabilitado] = useState(false);
  const [catalogoHabilitado, setCatalogoHabilitado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [creando, setCreando] = useState(false);
  const [mostrarEditar, setMostrarEditar] = useState(false);
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [datosEdicion, setDatosEdicion] = useState({ nombre: '', nit: '', email: '', telefono: '', direccion: '' });
  const [planNuevo, setPlanNuevo] = useState<Plan>('BASICO');
  const [tipoNegocioNuevo, setTipoNegocioNuevo] = useState<TipoNegocio>('RESTAURANTE');
  const [administradores, setAdministradores] = useState<Array<{ nombre: string; email: string; password: string }>>([
    { nombre: '', email: '', password: '' },
  ]);
  const [nuevaEmpresa, setNuevaEmpresa] = useState({ nombre: '', nit: '', email: '', telefono: '', direccion: '' });

  const seleccionarEmpresa = (empresa: Empresa) => {
    setSeleccionada(empresa);
    setPlan(empresa.plan);
    setTipoNegocio(empresa.tipoNegocio || 'RESTAURANTE');
    setPermisos(empresa.permisos || {});
    setModoPreparacion(empresa.modoPreparacion || 'KDS');
    setFacturacionHabilitada(Boolean(empresa.facturacionElectronicaHabilitada));
    setConsumoEmpleadosHabilitado(Boolean(empresa.consumoEmpleadosHabilitado));
    setCatalogoHabilitado(Boolean(empresa.catalogoHabilitado));
  };

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      const [resumenRes, empresasRes, auditoriaRes] = await Promise.all([
        api.get('/superadmin/resumen'),
        api.get('/superadmin/empresas'),
        api.get('/superadmin/auditoria'),
      ]);
      setResumen(resumenRes.data);
      setEmpresas(empresasRes.data);
      setAuditoria(auditoriaRes.data);
      if (seleccionada) {
        const actualizada = empresasRes.data.find((empresa: Empresa) => empresa.id === seleccionada.id);
        if (actualizada) seleccionarEmpresa(actualizada);
        else setSeleccionada(null);
      }
    } catch {
      setError('No fue posible cargar la administracion de empresas.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!usuario) {
      irALoginGenerico(router);
      return;
    }
    if (usuario.rol !== 'SUPERADMIN') {
      router.replace('/pos');
      return;
    }
    cargarDatos();
  }, [usuario, router]);

  const aplicarPlan = (nuevoPlan: Plan) => {
    setPlan(nuevoPlan);
    setPermisos(Object.fromEntries(MODULOS.map((modulo) => [modulo.id, permisosPorPlan[nuevoPlan].includes(modulo.id) && (tipoNegocio === 'RESTAURANTE' || modulo.id !== 'cocina')])));
  };

  const guardarConfiguracion = async () => {
    if (!seleccionada) return;
    setGuardando(true);
    try {
      await api.patch(`/superadmin/empresas/${seleccionada.id}/configuracion`, { plan, tipoNegocio, permisos, modoPreparacion, facturacionElectronicaHabilitada: facturacionHabilitada, consumoEmpleadosHabilitado, catalogoHabilitado });
      await cargarDatos();
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (empresa: Empresa) => {
    setError('');
    try {
      await api.patch(`/superadmin/empresas/${empresa.id}/estado`, { activo: !empresa.activo });
      await cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No fue posible cambiar el estado.');
    }
  };

  const abrirEdicion = () => {
    if (!seleccionada) return;
    setDatosEdicion({ nombre: seleccionada.nombre, nit: seleccionada.nit, email: seleccionada.email, telefono: seleccionada.telefono || '', direccion: seleccionada.direccion || '' });
    setMostrarEditar(true);
  };

  const guardarEmpresa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!seleccionada) return;
    setEditando(true);
    setError('');
    try {
      await api.patch(`/superadmin/empresas/${seleccionada.id}`, datosEdicion);
      setMostrarEditar(false);
      await cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No fue posible editar la empresa.');
    } finally {
      setEditando(false);
    }
  };

  const eliminarEmpresa = async () => {
    if (!seleccionada) return;
    setEliminando(true);
    setError('');
    try {
      await api.delete(`/superadmin/empresas/${seleccionada.id}`);
      setConfirmarEliminar(false);
      setSeleccionada(null);
      await cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No fue posible eliminar la empresa.');
      setConfirmarEliminar(false);
    } finally {
      setEliminando(false);
    }
  };

  const agregarAdministrador = () => {
    setAdministradores((actuales) => {
      if (actuales.length >= 3) return actuales;
      return [...actuales, { nombre: '', email: '', password: '' }];
    });
  };

  const actualizarAdministrador = (index: number, campo: 'nombre' | 'email' | 'password', valor: string) => {
    setAdministradores((actuales) => actuales.map((admin, i) => i === index ? { ...admin, [campo]: valor } : admin));
  };

  const quitarAdministrador = (index: number) => {
    setAdministradores((actuales) => {
      if (actuales.length === 1) return actuales;
      return actuales.filter((_, i) => i !== index);
    });
  };

  const crearEmpresa = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreando(true);
    setError('');

    const administradoresValidos = administradores
      .map((admin) => ({ ...admin, nombre: admin.nombre.trim(), email: admin.email.trim(), password: admin.password.trim() }))
      .filter((admin) => admin.nombre || admin.email || admin.password);

    if (administradoresValidos.length === 0) {
      setError('Debe ingresar al menos un administrador para la empresa.');
      setCreando(false);
      return;
    }

    if (administradoresValidos.length > 3) {
      setError('La empresa puede tener máximo 3 administradores.');
      setCreando(false);
      return;
    }

    const tieneCamposIncompletos = administradoresValidos.some((admin) => !admin.nombre || !admin.email || !admin.password);
    if (tieneCamposIncompletos) {
      setError('Cada administrador debe incluir nombre, email y contraseña.');
      setCreando(false);
      return;
    }

    try {
      await api.post('/superadmin/empresas', {
        empresa: { nombre: nuevaEmpresa.nombre, nit: nuevaEmpresa.nit, email: nuevaEmpresa.email, telefono: nuevaEmpresa.telefono, direccion: nuevaEmpresa.direccion, tipoNegocio: tipoNegocioNuevo },
        admin: administradoresValidos[0],
        administradores: administradoresValidos,
        plan: planNuevo,
        permisos: permisosPorPlan[planNuevo].reduce((acceso, modulo) => ({ ...acceso, [modulo]: tipoNegocioNuevo === 'RESTAURANTE' || modulo !== 'cocina' }), {} as Record<string, boolean>),
      });
      setMostrarCrear(false);
      setNuevaEmpresa({ nombre: '', nit: '', email: '', telefono: '', direccion: '' });
      setAdministradores([{ nombre: '', email: '', password: '' }]);
      setPlanNuevo('BASICO');
      setTipoNegocioNuevo('RESTAURANTE');
      await cargarDatos();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No fue posible crear la empresa.');
    } finally {
      setCreando(false);
    }
  };

  if (!usuario || usuario.rol !== 'SUPERADMIN') return null;

  return (
    <main className="min-h-screen bg-[#0b1017] text-white">
      <header className="border-b border-slate-800 bg-slate-950 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-orange-500 flex items-center justify-center text-slate-950"><Building2 size={23} /></div>
          <div><p className="text-orange-400 text-xs uppercase tracking-[0.2em] font-bold">PowerPOS Control</p><h1 className="text-2xl font-black">Administracion de empresas</h1></div>
        </div>
        <div className="flex items-center gap-5"><button type="button" onClick={cambiarTema} aria-label={`Cambiar a tema ${tema === 'oscuro' ? 'claro' : 'oscuro'}`} className="text-slate-400 hover:text-orange-400">{tema === 'oscuro' ? <Sun size={19} /> : <Moon size={19} />}</button><span className="text-slate-400 text-sm">{usuario.nombre}</span><button onClick={() => { logout(); irALoginGenerico(router); }} title="Cerrar sesion" className="text-slate-400 hover:text-white"><LogOut size={19} /></button></div>
      </header>

      <section className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex items-end justify-between"><div><p className="text-slate-400 text-sm">Planes, acceso a modulos y estado de cuentas</p><h2 className="text-3xl font-black mt-1">Control SaaS</h2></div><div className="flex gap-2"><button onClick={() => setMostrarCrear(true)} className="flex items-center gap-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-3 py-2"><Plus size={15} /> Nueva empresa</button><button onClick={cargarDatos} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white border border-slate-700 rounded-lg px-3 py-2"><RefreshCw size={15} /> Actualizar</button></div></div>
        {error && <div className="border border-red-500/30 bg-red-500/10 text-red-300 rounded-xl p-4">{error}</div>}

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5"><Building2 size={19} className="text-orange-400" /><p className="text-slate-400 text-xs mt-4">Empresas registradas</p><p className="text-2xl font-black mt-1">{resumen?.empresas || 0}</p></div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5"><CheckCircle2 size={19} className="text-emerald-400" /><p className="text-slate-400 text-xs mt-4">Empresas activas</p><p className="text-2xl font-black mt-1">{resumen?.empresasActivas || 0}</p></div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5"><Users size={19} className="text-blue-400" /><p className="text-slate-400 text-xs mt-4">Usuarios activos</p><p className="text-2xl font-black mt-1">{resumen?.usuariosActivos || 0}</p></div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between"><h3 className="font-bold">Empresas y planes</h3><span className="text-slate-500 text-sm">{empresas.length} cuentas</span></div>
            {cargando ? <div className="p-10 text-center text-slate-500">Cargando empresas...</div> : <div className="divide-y divide-slate-800">{empresas.map((empresa) => <button key={empresa.id} onClick={() => seleccionarEmpresa(empresa)} className={`w-full text-left px-5 py-4 hover:bg-slate-800/50 ${seleccionada?.id === empresa.id ? 'bg-orange-500/10 border-l-2 border-orange-500' : ''}`}><div className="flex items-center justify-between gap-4"><div><div className="font-semibold">{empresa.nombre}</div><div className="text-slate-500 text-xs mt-1">NIT {empresa.nit} · {TIPOS_NEGOCIO.find((tipo) => tipo.value === empresa.tipoNegocio)?.label || 'Restaurante'} · {empresa._count.usuarios} usuarios · {empresa._count.sucursales} sucursales</div></div><div className="text-right"><span className={`text-xs font-bold ${empresa.plan === 'PREMIUM' ? 'text-violet-300' : empresa.plan === 'MEDIUM' ? 'text-blue-300' : 'text-slate-300'}`}>{empresa.plan}</span><div className={`text-xs mt-2 ${empresa.activo ? 'text-emerald-400' : 'text-red-400'}`}>{empresa.activo ? 'Activa' : 'Inactiva'}</div></div></div></button>)}</div>}
          </div>

          <aside className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-fit">
            {!seleccionada ? <div className="py-8 text-center text-slate-500"><ShieldCheck size={30} className="mx-auto mb-3 text-slate-600" /><p>Selecciona una empresa para administrar su plan y permisos.</p></div> : <>
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500 uppercase tracking-wider">Configuracion</p><h3 className="text-xl font-black mt-1">{seleccionada.nombre}</h3><p className="text-xs text-slate-500 mt-1">NIT {seleccionada.nit}</p></div><button onClick={() => cambiarEstado(seleccionada)} className="text-xs border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 hover:border-orange-500">{seleccionada.activo ? 'Desactivar' : 'Activar'}</button></div>
              <div className="flex gap-2 mt-4"><button type="button" onClick={abrirEdicion} className="flex-1 flex items-center justify-center gap-2 text-sm border border-slate-700 rounded-lg px-3 py-2 hover:border-orange-500"><Pencil size={14} /> Editar datos</button><button type="button" onClick={() => setConfirmarEliminar(true)} className="flex items-center justify-center gap-2 text-sm border border-red-900 text-red-300 rounded-lg px-3 py-2 hover:bg-red-950"><Trash2 size={14} /> Eliminar</button></div>
              <label className="block text-sm text-slate-400 mt-6 mb-2">Tipo de negocio</label>
              <select value={tipoNegocio} onChange={(event) => setTipoNegocio(event.target.value as TipoNegocio)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white">{TIPOS_NEGOCIO.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}</select>
              <p className="text-slate-500 text-xs mt-2">Restaurante conserva cocina, recetas y comandas. Los demás tipos usan el POS comercial y existencias por producto. Si cambias una empresa existente, revisa sus productos y existencias antes de vender.</p>
              <label className="block text-sm text-slate-400 mt-6 mb-2">Plan comercial</label>
              <select value={plan} onChange={(event) => aplicarPlan(event.target.value as Plan)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white"><option value="BASICO">Basico</option><option value="MEDIUM">Medium</option><option value="PREMIUM">Premium</option></select>
              <p className="text-slate-500 text-xs mt-2">El plan sirve como base; puedes ajustar los modulos permitidos.</p>
              {tipoNegocio === 'RESTAURANTE' && <><label className="block text-sm text-slate-400 mt-5 mb-2">Preparacion de pedidos</label>
              <select value={modoPreparacion} onChange={(event) => setModoPreparacion(event.target.value as 'KDS' | 'COMANDAS')} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white">
                <option value="KDS">KDS en pantalla</option>
                <option value="COMANDAS">Comandas impresas</option>
              </select>
              <p className="text-slate-500 text-xs mt-2">KDS es el modo predeterminado para nuevas empresas.</p></>}
              <label className="flex items-center justify-between gap-3 bg-slate-800/60 rounded-lg px-3 py-2.5 text-sm mt-4"><span>Facturacion electronica</span><input type="checkbox" checked={facturacionHabilitada} onChange={(event) => setFacturacionHabilitada(event.target.checked)} className="h-4 w-4 accent-orange-500" /></label>
              <p className="text-slate-500 text-xs mt-2">Requiere un proveedor tecnológico y una integración específica antes de emitir facturas electrónicas.</p>
              {tipoNegocio === 'RESTAURANTE' && <><label className="flex items-center justify-between gap-3 bg-slate-800/60 rounded-lg px-3 py-2.5 text-sm mt-4"><span>Consumo de empleados</span><input type="checkbox" checked={consumoEmpleadosHabilitado} onChange={(event) => setConsumoEmpleadosHabilitado(event.target.checked)} className="h-4 w-4 accent-orange-500" /></label>
              <p className="text-slate-500 text-xs mt-2">Permite registrar la comida que se le da al personal. No se contabiliza como venta, pero sí descuenta inventario.</p></>}
              <label className="flex items-center justify-between gap-3 bg-slate-800/60 rounded-lg px-3 py-2.5 text-sm mt-4"><span>Catálogo de productos</span><input type="checkbox" checked={catalogoHabilitado} onChange={(event) => setCatalogoHabilitado(event.target.checked)} className="h-4 w-4 accent-orange-500" /></label>
              <p className="text-slate-500 text-xs mt-2">Catálogo tipo folleto (independiente del inventario) para compartir con distribuidores. Actívalo solo si la empresa lo pidió.</p>
              <div className="mt-6 space-y-2">{MODULOS.filter((modulo) => tipoNegocio === 'RESTAURANTE' || modulo.id !== 'cocina').map((modulo) => <label key={modulo.id} className="flex items-center justify-between gap-3 bg-slate-800/60 rounded-lg px-3 py-2.5 text-sm"><span>{modulo.label}</span><input type="checkbox" checked={Boolean(permisos[modulo.id])} onChange={(event) => setPermisos((actuales) => ({ ...actuales, [modulo.id]: event.target.checked }))} className="h-4 w-4 accent-orange-500" /></label>)}</div>
              <button onClick={guardarConfiguracion} disabled={guardando} className="w-full mt-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-lg py-2.5 flex items-center justify-center gap-2"><Save size={16} /> {guardando ? 'Guardando...' : 'Guardar configuracion'}</button>
            </>}
          </aside>
        </div>
        <div className="text-slate-500 text-xs">El superadmin administra cuentas y acceso a modulos. Las ventas permanecen dentro del entorno privado de cada empresa.</div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2"><Clock3 size={17} className="text-slate-400" /><h3 className="font-bold">Auditoria administrativa</h3></div>
          <div className="divide-y divide-slate-800">
            {auditoria.length === 0 ? <div className="p-6 text-slate-500 text-sm">Aun no hay acciones registradas.</div> : auditoria.slice(0, 20).map((registro) => <div key={registro.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm"><div><span className="text-orange-300 font-semibold">{registro.accion}</span><span className="text-slate-400"> en {registro.entidad}</span><div className="text-slate-500 text-xs mt-1">{registro.empresa?.nombre || 'Sistema'} · {registro.usuario?.nombre || 'Usuario'}</div></div><time className="text-slate-500 text-xs whitespace-nowrap">{new Date(registro.creadoEn).toLocaleString('es-CO')}</time></div>)}
          </div>
        </div>
      </section>

      {mostrarCrear && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><form onSubmit={crearEmpresa} className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5"><div className="flex items-center justify-between"><div><p className="text-orange-400 text-xs uppercase tracking-wider">Alta de cuenta</p><h2 className="text-2xl font-black">Nueva empresa</h2></div><button type="button" onClick={() => setMostrarCrear(false)} className="text-slate-400 hover:text-white"><X size={20} /></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{([['nombre', 'Nombre de la empresa'], ['nit', 'NIT'], ['email', 'Email de empresa'], ['telefono', 'Telefono'], ['direccion', 'Direccion']] as const).map(([campo, etiqueta]) => <label key={campo} className="text-sm text-slate-300">{etiqueta}<input required={['nombre', 'nit', 'email', 'adminNombre', 'adminEmail', 'adminPassword'].includes(campo)} type={campo.toLowerCase().includes('email') ? 'email' : 'text'} value={nuevaEmpresa[campo]} onChange={(event) => setNuevaEmpresa((actual) => ({ ...actual, [campo]: event.target.value }))} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white" /></label>)}</div><label className="block text-sm text-slate-300">Tipo de negocio<select value={tipoNegocioNuevo} onChange={(event) => setTipoNegocioNuevo(event.target.value as TipoNegocio)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white">{TIPOS_NEGOCIO.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}</select></label><section className="space-y-3"><h3>Administradores de la empresa</h3>{administradores.map((admin,i)=><div key={i} className="grid gap-3 md:grid-cols-3">{(['nombre','email','password'] as const).map(campo=><label key={campo}>{campo==='password'?'Contraseña':campo}<input required type={campo==='password'?'password':campo==='email'?'email':'text'} value={admin[campo]} onChange={e=>setAdministradores(actual=>actual.map((a,j)=>i===j?{...a,[campo]:e.target.value}:a))} className="mt-1 w-full rounded bg-slate-800 p-2"/></label>)}</div>)}{administradores.length<3&&<button type="button" onClick={()=>setAdministradores(a=>[...a,{nombre:'',email:'',password:''}])}>+ Agregar administrador</button>}</section><label className="block text-sm text-slate-300">Plan inicial<select value={planNuevo} onChange={(event) => setPlanNuevo(event.target.value as Plan)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white"><option value="BASICO">Basico</option><option value="MEDIUM">Medium</option><option value="PREMIUM">Premium</option></select></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setMostrarCrear(false)} className="border border-slate-700 text-slate-300 rounded-lg px-4 py-2">Cancelar</button><button disabled={creando} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-lg px-4 py-2">{creando ? 'Creando...' : 'Crear empresa'}</button></div></form></div>}
      {mostrarEditar && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><form onSubmit={guardarEmpresa} className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl p-6 space-y-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Editar empresa</h2><button type="button" onClick={() => setMostrarEditar(false)} aria-label="Cerrar"><X size={20} /></button></div>{error && <p className="text-red-300 text-sm">{error}</p>}<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{([['nombre', 'Nombre'], ['nit', 'NIT'], ['email', 'Correo'], ['telefono', 'Teléfono'], ['direccion', 'Dirección']] as const).map(([campo, etiqueta]) => <label key={campo} className="text-sm text-slate-300">{etiqueta}<input required={['nombre', 'nit', 'email'].includes(campo)} type={campo === 'email' ? 'email' : 'text'} value={datosEdicion[campo]} onChange={(event) => setDatosEdicion((actual) => ({ ...actual, [campo]: event.target.value }))} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white" /></label>)}</div><div className="flex justify-end gap-3"><button type="button" onClick={() => setMostrarEditar(false)} className="px-4 py-2 border border-slate-700 rounded-lg">Cancelar</button><button disabled={editando} className="px-4 py-2 bg-orange-500 rounded-lg font-bold disabled:opacity-50">{editando ? 'Guardando...' : 'Guardar cambios'}</button></div></form></div>}
      {confirmarEliminar && seleccionada && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-labelledby="titulo-eliminar" className="bg-slate-900 border border-red-900 rounded-2xl w-full max-w-md p-6 space-y-4"><h2 id="titulo-eliminar" className="text-xl font-bold">Eliminar {seleccionada.nombre}</h2><p className="text-slate-300 text-sm">Esta acción elimina definitivamente una cuenta sin datos cargados ni actividad. Si ya tiene datos, desactívala para conservar el historial.</p><div className="flex justify-end gap-3"><button type="button" onClick={() => setConfirmarEliminar(false)} className="px-4 py-2 border border-slate-700 rounded-lg">Cancelar</button><button type="button" disabled={eliminando} onClick={eliminarEmpresa} className="px-4 py-2 bg-red-700 rounded-lg font-bold disabled:opacity-50">{eliminando ? 'Eliminando...' : 'Eliminar empresa'}</button></div></div></div>}
    </main>
  );
}
