'use client';
import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useNotificar } from '@/components/Notificaciones';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { Plus, Truck, X } from 'lucide-react';

type Distribuidor = {
  id: number; codigo: string; nombre: string; zona: string | null; porcentajeComision: string; activo: boolean;
  sucursal: { nombre: string }; usuario: { email: string; activo: boolean } | null;
};
type Sucursal = { id: number; nombre: string };
type Pendientes = { pedidos: any[]; cantidadPedidos: number; totalVentas: number; totalComision: number; periodoDesde: string; periodoHasta: string };
type Liquidacion = { id: number; periodoDesde: string; periodoHasta: string; cantidadPedidos: number; totalComision: number; creadoEn: string; distribuidor: { codigo: string; nombre: string }; usuario: { nombre: string } };

const hoyISO = () => new Date().toISOString().slice(0, 10);
const inicioMesISO = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

export default function DistribuidoresPage() {
  const { aviso, confirmar } = useNotificar();
  const [distribuidores, setDistribuidores] = useState<Distribuidor[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [modalCrear, setModalCrear] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ codigo: '', nombre: '', zona: '', sucursalId: '', email: '', password: '', porcentajeComision: '' });

  const [seleccionado, setSeleccionado] = useState<Distribuidor | null>(null);
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [pendientes, setPendientes] = useState<Pendientes | null>(null);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [liquidando, setLiquidando] = useState(false);

  const cargar = async () => {
    try {
      const { data } = await api.get('/distribuidores');
      setDistribuidores(data);
    } catch { /* silencioso */ }
  };

  useEffect(() => {
    cargar();
    api.get('/sucursales').then((r) => setSucursales(r.data)).catch(() => undefined);
  }, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.post('/distribuidores', { ...form, porcentajeComision: Number(form.porcentajeComision) });
      setModalCrear(false);
      setForm({ codigo: '', nombre: '', zona: '', sucursalId: '', email: '', password: '', porcentajeComision: '' });
      await cargar();
      aviso('Distribuidor creado.', 'exito');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo crear el distribuidor.');
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async (d: Distribuidor) => {
    try {
      await api.patch(`/distribuidores/${d.id}`, { activo: !d.activo });
      await cargar();
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo actualizar.', 'error');
    }
  };

  const abrirLiquidacion = async (d: Distribuidor) => {
    setSeleccionado(d);
    setPendientes(null);
    await cargarPendientes(d.id, desde, hasta);
    try {
      const { data } = await api.get(`/distribuidores/${d.id}/liquidaciones`);
      setLiquidaciones(data);
    } catch { setLiquidaciones([]); }
  };

  const cargarPendientes = async (distribuidorId: number, d: string, h: string) => {
    try {
      const { data } = await api.get(`/distribuidores/${distribuidorId}/pendientes-liquidar`, { params: { desde: d, hasta: h } });
      setPendientes(data);
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo calcular lo pendiente.', 'error');
    }
  };

  const liquidar = async () => {
    if (!seleccionado) return;
    if (!(await confirmar(`Se va a liquidar ${moneda(pendientes?.totalComision || 0)} a ${seleccionado.nombre} (${pendientes?.cantidadPedidos} pedido(s)) y se registra como egreso en Financiero.`, { titulo: 'Liquidar comisión', textoConfirmar: 'Sí, liquidar' }))) return;
    setLiquidando(true);
    try {
      await api.post(`/distribuidores/${seleccionado.id}/liquidar`, { desde, hasta });
      aviso('Liquidación registrada.', 'exito');
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
        <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">Zonas y comisiones</p>
              <h1 className="mt-1 text-3xl font-bold">Distribuidores</h1>
              <p className="mt-1 text-sm text-gray-400">Cada uno tiene su propio código y acceso para registrar sus pedidos.</p>
            </div>
            <button type="button" onClick={() => setModalCrear(true)} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600">
              <Plus size={18} /> Nuevo distribuidor
            </button>
          </div>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-800 text-gray-400"><tr><th className="pb-2">Código</th><th className="pb-2">Nombre</th><th className="pb-2">Zona</th><th className="pb-2">Sucursal</th><th className="pb-2 text-right">Comisión</th><th className="pb-2 text-center">Estado</th><th className="pb-2 text-right">Acciones</th></tr></thead>
              <tbody>
                {distribuidores.map((d) => (
                  <tr key={d.id} className={`border-b border-gray-800 ${!d.activo ? 'opacity-50' : ''}`}>
                    <td className="py-2 font-semibold">{d.codigo}</td>
                    <td className="py-2">{d.nombre}<p className="text-xs text-gray-500">{d.usuario?.email}</p></td>
                    <td className="py-2 text-gray-400">{d.zona || '—'}</td>
                    <td className="py-2 text-gray-400">{d.sucursal?.nombre}</td>
                    <td className="py-2 text-right">{Number(d.porcentajeComision)}%</td>
                    <td className="py-2 text-center text-xs">{d.activo ? 'Activo' : 'Inactivo'}</td>
                    <td className="py-2 text-right">
                      <span className="inline-flex gap-2">
                        <button type="button" onClick={() => abrirLiquidacion(d)} className="rounded border border-gray-700 px-2 py-1 text-xs hover:border-orange-500 hover:text-orange-400">Liquidar</button>
                        <button type="button" onClick={() => toggleActivo(d)} className="rounded border border-gray-700 px-2 py-1 text-xs hover:border-gray-500">{d.activo ? 'Desactivar' : 'Activar'}</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!distribuidores.length && <p className="py-8 text-center text-gray-400">Aún no has creado distribuidores.</p>}
          </section>
        </div>

        {modalCrear && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <form onSubmit={crear} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white"><Truck size={18} className="text-orange-500" /> Nuevo distribuidor</h3>
                <button type="button" onClick={() => setModalCrear(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>
              {error && <div role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
              <div className="space-y-3">
                <input required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Código (ej. DIST-001)" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <input value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })} placeholder="Zona (opcional)" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <select required value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white">
                  <option value="">Sucursal que lo abastece…</option>
                  {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <input required type="number" min={0} max={100} step="0.01" value={form.porcentajeComision} onChange={(e) => setForm({ ...form, porcentajeComision: e.target.value })} placeholder="% de comisión" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email de acceso" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Contraseña" className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
              </div>
              <button type="submit" disabled={guardando} className="mt-4 w-full rounded-lg bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">{guardando ? 'Creando…' : 'Crear distribuidor'}</button>
            </form>
          </div>
        )}

        {seleccionado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Liquidar — {seleccionado.codigo} · {seleccionado.nombre}</h3>
                <button type="button" onClick={() => setSeleccionado(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
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
