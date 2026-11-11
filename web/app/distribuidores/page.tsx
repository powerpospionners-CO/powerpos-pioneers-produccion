'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useNotificar } from '@/components/Notificaciones';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { Banknote, ChevronLeft, ChevronRight, Eye, Pencil, Plus, Power, RefreshCw, Truck, X } from 'lucide-react';

type Distribuidor = {
  id: number; codigo: string; nombre: string; zona: string | null; porcentajeComision: string; activo: boolean; sucursalId: number;
  sucursal: { nombre: string }; usuario: { email: string; activo: boolean } | null;
};
type ResumenVentas = { distribuidorId: number; ventasEntregadas: number; cantidadVentas: number; pendienteRetiro: number; cantidadRetiro: number; comisionPendiente: number; ventasPorLiquidar: number; cantidadLiquidable: number; cantidadRevision: number; primeraVentaLiquidable: string | null };
type VentaDistribuidor = { id: number; numero: string; total: string; comisionMonto: string; creadoEn: string; clienteReferencia: string | null; liquidacionId: number | null; estadoGestion: string; saldoPendiente: number | null; comisionDisponible: boolean };
type PaginaVentas = { pedidos: VentaDistribuidor[]; pagina: number; paginas: number; total: number };
const resumenVacio = { ventasEntregadas: 0, cantidadVentas: 0, pendienteRetiro: 0, cantidadRetiro: 0, comisionPendiente: 0, ventasPorLiquidar: 0, cantidadLiquidable: 0, cantidadRevision: 0, primeraVentaLiquidable: null };
const estadoVenta = (estado: string) => ({ PENDIENTE_RETIRO: 'Pendiente de retiro', PENDIENTE_PAGO: 'Pendiente de pago', PAGADO: 'Pagado', ANULADO: 'Anulado', EN_REVISION: 'Por revisar', HISTORICO: 'Histórico' }[estado] || estado);

type Sucursal = { id: number; nombre: string };
type Pendientes = { pedidos: any[]; cantidadPedidos: number; totalVentas: number; totalComision: number; periodoDesde: string; periodoHasta: string };
type Liquidacion = { id: number; periodoDesde: string; periodoHasta: string; cantidadPedidos: number; totalComision: number; creadoEn: string; distribuidor: { codigo: string; nombre: string }; usuario: { nombre: string } };

const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const inicioMesISO = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

export default function DistribuidoresPage() {
  const { aviso, confirmar } = useNotificar();
  const [distribuidores, setDistribuidores] = useState<Distribuidor[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [modalCrear, setModalCrear] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [alta, setAlta] = useState<{ siguienteCodigo: string; dominioCorreo: string } | null>(null);
  const [cargandoAlta, setCargandoAlta] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ codigo: '', nombre: '', zona: '', sucursalId: '', email: '', password: '', porcentajeComision: '' });

  const [seleccionado, setSeleccionado] = useState<Distribuidor | null>(null);
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [pendientes, setPendientes] = useState<Pendientes | null>(null);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [liquidando, setLiquidando] = useState(false);
  const [resumenes, setResumenes] = useState<ResumenVentas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [datosCargados, setDatosCargados] = useState(false);
  const versionCarga = useRef(0);
  const versionPendientes = useRef(0);
  const versionVentas = useRef(0);
  const [verVentas, setVerVentas] = useState<Distribuidor | null>(null);
  const [ventas, setVentas] = useState<PaginaVentas | null>(null);
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const [errorVentas, setErrorVentas] = useState('');


  const cargar = useCallback(async () => {
    const version = ++versionCarga.current;
    setCargando(true);
    try {
      const [perfiles, resumen] = await Promise.all([api.get('/distribuidores'), api.get('/distribuidores/resumen-ventas')]);
      if (version !== versionCarga.current) return;
      setDistribuidores(perfiles.data); setResumenes(resumen.data); setErrorCarga(''); setDatosCargados(true);
    } catch (e: any) { if (version === versionCarga.current) setErrorCarga(e?.response?.data?.message || 'No se pudieron actualizar las ventas y comisiones.'); }
    finally { if (version === versionCarga.current) setCargando(false); }
  }, []);

  useEffect(() => {
    void cargar();
    api.get('/sucursales').then((r) => setSucursales(r.data)).catch(() => undefined);
    const actualizar = () => { if (document.visibilityState === 'visible') void cargar(); };
    const timer = setInterval(actualizar, 15000);
    window.addEventListener('focus', actualizar);
    return () => { clearInterval(timer); window.removeEventListener('focus', actualizar); };
  }, [cargar]);

  const resumenDe = (id: number) => resumenes.find(r => r.distribuidorId === id) ?? resumenVacio;
  const totales = resumenes.reduce((t, r) => ({ ventas: t.ventas + r.ventasEntregadas, retiro: t.retiro + r.pendienteRetiro, comision: t.comision + r.comisionPendiente }), { ventas: 0, retiro: 0, comision: 0 });
  const cargarVentas = async (distribuidor: Distribuidor, pagina = 1) => {
    const version = ++versionVentas.current;
    setVerVentas(distribuidor); setCargandoVentas(true); setErrorVentas(''); setVentas(null);
    try {
      const { data } = await api.get(`/distribuidores/${distribuidor.id}/ventas`, { params: { pagina } });
      if (version === versionVentas.current) setVentas(data);
    } catch (e: any) { if (version === versionVentas.current) setErrorVentas(e?.response?.data?.message || 'No se pudieron consultar las ventas.'); }
    finally { if (version === versionVentas.current) setCargandoVentas(false); }
  };

  const abrirNuevo = async () => {
    setEditando(null); setError(''); setAlta(null);
    setForm({ codigo: '', nombre: '', zona: '', sucursalId: '', email: '', password: '', porcentajeComision: '' });
    setModalCrear(true); setCargandoAlta(true);
    try {
      const { data } = await api.get('/distribuidores/configuracion-alta');
      setAlta(data);
      setForm(actual => ({ ...actual, codigo: data.siguienteCodigo }));
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo preparar el código y correo. Cierra y vuelve a abrir el formulario.'); }
    finally { setCargandoAlta(false); }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || (!editando && (!alta || cargandoAlta))) return;
    setGuardando(true);
    setError('');
    try {
      if (editando) await api.patch(`/distribuidores/${editando}`, { codigo: form.codigo, nombre: form.nombre, zona: form.zona, email: form.email, porcentajeComision: Number(form.porcentajeComision) });
      else await api.post('/distribuidores', { nombre: form.nombre, zona: form.zona, sucursalId: form.sucursalId, usuarioEmail: form.email, password: form.password, porcentajeComision: Number(form.porcentajeComision) });
      setModalCrear(false);
      setForm({ codigo: '', nombre: '', zona: '', sucursalId: '', email: '', password: '', porcentajeComision: '' });
      await cargar();
      aviso(editando ? 'Distribuidor actualizado.' : 'Distribuidor creado.', 'exito');
      setEditando(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo crear el distribuidor.');
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async (d: Distribuidor) => {
    if (guardando) return;
    if (d.activo && !await confirmar(`¿Desactivar el acceso de ${d.nombre}?`, { titulo: 'Desactivar distribuidor', textoConfirmar: 'Desactivar', peligroso: true })) return;
    setGuardando(true);
    try {
      await api.patch(`/distribuidores/${d.id}`, { activo: !d.activo });
      await cargar();
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo actualizar.', 'error');
    } finally { setGuardando(false); }
  };

  const editarPerfil = (d: Distribuidor) => {
    setEditando(d.id); setError('');
    setForm({ codigo: d.codigo, nombre: d.nombre, zona: d.zona || '', sucursalId: String(d.sucursalId), email: d.usuario?.email || '', password: '', porcentajeComision: String(d.porcentajeComision) });
    setModalCrear(true);
  };

  const abrirLiquidacion = async (d: Distribuidor) => {
    const primera = resumenDe(d.id).primeraVentaLiquidable;
    const inicio = primera ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(primera)) : inicioMesISO();
    const fin = hoyISO();
    setDesde(inicio); setHasta(fin);
    setSeleccionado(d); setPendientes(null); setLiquidaciones([]);
    await cargarPendientes(d.id, inicio, fin);
    try {
      const { data } = await api.get(`/distribuidores/${d.id}/liquidaciones`);
      setLiquidaciones(data);
    } catch { setLiquidaciones([]); }
  };

  const cargarPendientes = async (distribuidorId: number, d: string, h: string) => {
    const version = ++versionPendientes.current;
    setPendientes(null);
    try {
      const { data } = await api.get(`/distribuidores/${distribuidorId}/pendientes-liquidar`, { params: { desde: d, hasta: h } });
      if (version === versionPendientes.current) setPendientes(data);
    } catch (e: any) {
      if (version === versionPendientes.current) aviso(e?.response?.data?.message || 'No se pudo calcular lo pendiente.', 'error');
    }
  };

  const liquidar = async () => {
    if (!seleccionado || !pendientes?.cantidadPedidos || liquidando) return;
    if (!(await confirmar(`Se va a liquidar ${moneda(pendientes?.totalComision || 0)} a ${seleccionado.nombre} (${pendientes?.cantidadPedidos} pedido(s)) y se registra como egreso en Financiero.`, { titulo: 'Liquidar comisión', textoConfirmar: 'Sí, liquidar' }))) return;
    setLiquidando(true);
    try {
      await api.post(`/distribuidores/${seleccionado.id}/liquidar`, { desde, hasta });
      aviso('Liquidación registrada.', 'exito');
      await cargar();
      await abrirLiquidacion(seleccionado);
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo liquidar.', 'error');
    } finally {
      setLiquidando(false);
    }
  };

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">Zonas y comisiones</p>
              <h1 className="mt-1 text-3xl font-bold">Distribuidores</h1>
              <p className="mt-1 text-sm text-gray-400">Consulta lo vendido, lo pendiente de retiro y las comisiones de cada distribuidor.</p>
            </div>
            <div className="flex items-center gap-2"><button type="button" title="Actualizar ventas" aria-label="Actualizar ventas de distribuidores" disabled={cargando} onClick={() => void cargar()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50"><RefreshCw size={18} className={cargando ? 'animate-spin' : ''} /></button><button type="button" disabled={guardando} onClick={() => void abrirNuevo()} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600">
              <Plus size={18} /> Nuevo distribuidor
            </button></div>
          </div>

          {errorCarga && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{errorCarga} Los datos anteriores pueden estar desactualizados.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4"><p className="text-sm text-gray-400">Ventas entregadas · acumulado</p><p className="mt-1 text-xl font-bold">{!datosCargados ? (cargando ? '…' : '—') : moneda(totales.ventas)}</p></div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="text-sm text-gray-400">Pedidos pendientes de retiro</p><p className="mt-1 text-xl font-bold text-amber-300">{!datosCargados ? (cargando ? '…' : '—') : moneda(totales.retiro)}</p></div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-sm text-gray-400">Comisión pendiente por liquidar</p><p className="mt-1 text-xl font-bold text-emerald-300">{!datosCargados ? (cargando ? '…' : '—') : moneda(totales.comision)}</p></div>
          </div>
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <p className="mb-4 text-xs text-gray-400">Acumulado de todos los períodos. La comisión pendiente solo incluye pedidos entregados y pagados, sin liquidación. Los pedidos anulados y en revisión no suman ventas entregadas.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-gray-800 text-gray-400"><tr><th className="pb-2">Código</th><th className="pb-2">Distribuidor</th><th className="pb-2">Zona / Sucursal</th><th className="pb-2 text-right">Ventas entregadas</th><th className="pb-2 text-right">Por retirar</th><th className="pb-2 text-right">Comisión pendiente</th><th className="pb-2 text-center">Estado</th><th className="pb-2 text-right">Acciones</th></tr></thead>
              <tbody>
                {distribuidores.map((d) => { const r = resumenDe(d.id); return (
                  <tr key={d.id} className={`border-b border-gray-800 ${!d.activo ? 'opacity-60' : ''}`}>
                    <td className="py-3 pr-3 font-semibold">{d.codigo}</td>
                    <td className="py-3 pr-3">{d.nombre}<p className="text-xs text-gray-500">{d.usuario?.email}</p></td>
                    <td className="py-3 pr-3 text-gray-400">{d.zona || '—'}<p className="text-xs text-gray-500">{d.sucursal?.nombre}</p></td>
                    <td className="py-3 pr-3 text-right"><strong className="whitespace-nowrap">{moneda(r.ventasEntregadas)}</strong><p className="text-xs text-gray-500">{r.cantidadVentas} venta(s)</p></td>
                    <td className="py-3 pr-3 text-right text-amber-300"><span className="whitespace-nowrap">{moneda(r.pendienteRetiro)}</span><p className="text-xs text-gray-500">{r.cantidadRetiro} pedido(s)</p></td>
                    <td className="py-3 pr-3 text-right"><strong className="whitespace-nowrap text-emerald-300">{moneda(r.comisionPendiente)}</strong><p className="text-xs text-gray-500">{r.cantidadLiquidable} venta(s) · {Number(d.porcentajeComision)}% actual</p>{r.cantidadRevision > 0 && <p className="text-xs text-amber-300">{r.cantidadRevision} por revisar</p>}</td>
                    <td className="py-3 text-center text-xs">{d.activo ? 'Activo' : 'Inactivo'}</td>
                    <td className="py-3 text-right">
                      <span className="inline-flex gap-2">
                        <button type="button" title="Ver ventas y pedidos" aria-label={`Ver ventas de ${d.nombre}`} onClick={() => void cargarVentas(d)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"><Eye size={18} /></button>
                        <button type="button" title="Liquidar comisión" aria-label={`Liquidar comisión de ${d.nombre}`} disabled={guardando || !!errorCarga} onClick={() => abrirLiquidacion(d)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"><Banknote size={18} /></button>
                        <button type="button" title="Editar distribuidor" aria-label={`Editar distribuidor ${d.nombre}`} disabled={guardando} onClick={() => editarPerfil(d)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"><Pencil size={18} /></button>
                        <button type="button" title={d.activo ? 'Desactivar distribuidor' : 'Activar distribuidor'} aria-label={`${d.activo ? 'Desactivar' : 'Activar'} distribuidor ${d.nombre}`} disabled={guardando} onClick={() => toggleActivo(d)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700"><Power size={18} /></button>
                      </span>
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table></div>
            {!cargando && !errorCarga && !distribuidores.length && <p className="py-8 text-center text-gray-400">Aún no has creado distribuidores.</p>}
          </section>
        </div>

        {verVentas && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="titulo-ventas-distribuidor" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <header className="mb-4 flex items-start justify-between gap-3"><div><h2 id="titulo-ventas-distribuidor" className="text-lg font-bold">Ventas y pedidos · {verVentas.codigo}</h2><p className="text-sm text-gray-400">{verVentas.nombre} · Historial completo</p></div><button type="button" title="Cerrar" aria-label="Cerrar ventas del distribuidor" onClick={() => { versionVentas.current++; setVerVentas(null); }} className="text-gray-400 hover:text-white"><X size={20} /></button></header>
            {errorVentas && <p role="alert" className="mb-3 text-sm text-red-300">{errorVentas}</p>}
            {cargandoVentas ? <p className="py-8 text-center text-gray-400">Cargando ventas…</p> : ventas && <>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-gray-800 text-gray-400"><tr><th className="p-2">Pedido / Fecha</th><th className="p-2">Cliente</th><th className="p-2">Estado</th><th className="p-2 text-right">Valor</th><th className="p-2 text-right">Comisión</th></tr></thead><tbody>{ventas.pedidos.map(v => <tr key={v.id} className="border-b border-gray-800"><td className="p-2 font-medium">{v.numero}<p className="text-xs font-normal text-gray-500">{new Date(v.creadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p></td><td className="p-2 text-gray-400">{v.clienteReferencia || '—'}</td><td className="p-2">{estadoVenta(v.estadoGestion)}{v.saldoPendiente !== null && v.saldoPendiente > 0 && <p className="text-xs text-amber-300">Saldo: {moneda(v.saldoPendiente)}</p>}</td><td className="whitespace-nowrap p-2 text-right">{moneda(Number(v.total))}</td><td className="whitespace-nowrap p-2 text-right">{moneda(Number(v.comisionMonto))}<p className={`text-xs ${v.liquidacionId ? 'text-gray-500' : v.comisionDisponible ? 'text-emerald-300' : 'text-amber-300'}`}>{v.liquidacionId ? 'Liquidada' : v.comisionDisponible ? 'Por liquidar' : 'No liquidable'}</p></td></tr>)}</tbody></table></div>
              {!ventas.total && <p className="py-6 text-center text-gray-400">Este distribuidor aún no tiene pedidos.</p>}
              <div className="mt-4 flex items-center justify-between text-sm text-gray-400"><span>{ventas.total} pedido(s) · Página {ventas.pagina} de {ventas.paginas}</span><div className="flex gap-2"><button aria-label="Página anterior de ventas" disabled={ventas.pagina <= 1} onClick={() => void cargarVentas(verVentas, ventas.pagina - 1)} className="rounded-lg border border-gray-700 p-2 disabled:opacity-40"><ChevronLeft size={18} /></button><button aria-label="Página siguiente de ventas" disabled={ventas.pagina >= ventas.paginas} onClick={() => void cargarVentas(verVentas, ventas.pagina + 1)} className="rounded-lg border border-gray-700 p-2 disabled:opacity-40"><ChevronRight size={18} /></button></div></div>
            </>}
          </section>
        </div>}

        {modalCrear && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <form onSubmit={crear} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white"><Truck size={18} className="text-orange-500" /> {editando ? 'Editar distribuidor' : 'Nuevo distribuidor'}</h3>
                <button type="button" onClick={() => setModalCrear(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>
              {error && <div role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
              <div className="space-y-3">
                <label className="block text-sm text-gray-300">Código<input required readOnly={!editando} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder={cargandoAlta ? 'Calculando código…' : 'Código automático'} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white read-only:cursor-default read-only:text-gray-400" /></label>
                {!editando && <p className="text-xs text-gray-500">Se asigna automáticamente al guardar.</p>}
                <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <input value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })} placeholder="Zona (opcional)" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <select required disabled={!!editando} value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white disabled:opacity-60">
                  <option value="">Sucursal que lo abastece…</option>
                  {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <input required type="number" min={0} max={100} step="0.01" value={form.porcentajeComision} onChange={(e) => setForm({ ...form, porcentajeComision: e.target.value })} placeholder="% de comisión" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                {editando ? <input required type="email" aria-label="Email de acceso" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email de acceso" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" /> : <label className="block text-sm text-gray-300">Correo de acceso<div className="mt-1 flex flex-wrap items-center overflow-hidden rounded-lg border border-gray-700 bg-gray-800 focus-within:border-orange-500"><input required type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} pattern="[a-zA-Z0-9]+([._-][a-zA-Z0-9]+)*" maxLength={64} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })} placeholder="nombre" title="Solo el nombre de acceso, sin @ ni espacios" className="min-w-24 flex-1 bg-transparent px-3 py-2 text-white outline-none" /><span className="max-w-full break-all border-l border-gray-700 bg-gray-900/50 px-3 py-2 text-xs text-orange-300">{alta ? `@${alta.dominioCorreo}` : 'Cargando sufijo…'}</span></div></label>}
                {!editando && <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Contraseña" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />}
              </div>
              <button type="submit" disabled={guardando || (!editando && (!alta || cargandoAlta))} className="mt-4 w-full rounded-lg bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">{guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear distribuidor'}</button>
            </form>
          </div>
        )}

        {seleccionado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Liquidar — {seleccionado.codigo} · {seleccionado.nombre}</h3>
                <button type="button" onClick={() => { versionPendientes.current++; setSeleccionado(null); }} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>

              <div className="flex gap-2">
                <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); cargarPendientes(seleccionado.id, e.target.value, hasta); }} className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); cargarPendientes(seleccionado.id, desde, e.target.value); }} className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
              </div>

              {pendientes && (
                <div className="mt-4 rounded-xl border border-gray-800 p-4">
                  <p className="text-sm text-gray-400">{pendientes.cantidadPedidos} pedido(s) sin liquidar en el periodo</p>
                  <p className="mt-1 text-sm text-gray-400">Total vendido: <span className="text-white">{moneda(pendientes.totalVentas)}</span></p>
                  <p className="mt-1 text-2xl font-bold text-orange-500">{moneda(pendientes.totalComision)}</p>
                  <button type="button" onClick={liquidar} disabled={liquidando || !pendientes.cantidadPedidos} className="mt-3 w-full rounded-lg bg-orange-500 py-2.5 font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                    {liquidando ? 'Liquidando…' : 'Liquidar este periodo'}
                  </button>
                </div>
              )}

              {!pendientes && <p className="mt-4 text-sm text-gray-400">Consulta el período para ver los pedidos entregados y pagados que se pueden liquidar.</p>}
              {!!pendientes?.pedidos.length && <details className="mt-4 rounded-xl border border-gray-800 p-3"><summary className="cursor-pointer text-sm">Ver ventas incluidas ({pendientes.cantidadPedidos})</summary><div className="mt-3 max-h-60 overflow-auto"><table className="w-full text-left text-sm"><thead className="text-gray-500"><tr><th className="p-2">Venta</th><th className="p-2 text-right">Valor</th><th className="p-2 text-right">Comisión</th></tr></thead><tbody>{pendientes.pedidos.map(p => <tr key={p.id} className="border-t border-gray-800"><td className="p-2">{p.numero}<p className="text-xs text-gray-500">{new Date(p.creadoEn).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</p></td><td className="p-2 text-right">{moneda(Number(p.total))}</td><td className="p-2 text-right">{moneda(Number(p.comisionMonto))}</td></tr>)}</tbody></table></div></details>}

              {liquidaciones.length > 0 && (
                <div className="mt-5">
                  <h4 className="mb-2 text-sm font-semibold text-gray-300">Liquidaciones anteriores</h4>
                  <div className="space-y-2">
                    {liquidaciones.map((l) => (
                      <div key={l.id} className="flex items-center justify-between rounded-lg border border-gray-800 p-3 text-sm">
                        <div>
                          <p className="text-gray-300">{new Date(l.periodoDesde).toLocaleDateString('es-CO')} – {new Date(l.periodoHasta).toLocaleDateString('es-CO')}</p>
                          <p className="text-xs text-gray-500">{l.cantidadPedidos} pedido(s) · liquidado por {l.usuario?.nombre}</p>
                        </div>
                        <strong className="text-white">{moneda(l.totalComision)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
