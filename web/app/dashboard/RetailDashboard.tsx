'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Boxes, CircleDollarSign, Receipt, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';

type Caja = { id: number; usuarioId: number; usuario?: { nombre: string }; montoInicial: string; totalEsperado?: number };
type Producto = { id: number; nombre: string; codigoBarras?: string; controlaStock: boolean; stockActual: number; stockMinimo: number };
type Venta = { id: number; numero: string; total: string; metodoPago: string; creadoEn: string; estado: string };
type Cajero = { id: number; nombre: string; rol: string };
const moneda = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function RetailDashboard() {
  const usuario = useAuthStore((s) => s.usuario);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [cajeros, setCajeros] = useState<Cajero[]>([]);
  const [cajeroId, setCajeroId] = useState('');
  const [base, setBase] = useState('');
  const [contado, setContado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    const [p, v, c, u] = await Promise.allSettled([api.get('/productos'), api.get('/pedidos'), api.get('/caja/abierta'), api.get('/usuarios')]);
    if (p.status === 'fulfilled') setProductos(p.value.data);
    if (v.status === 'fulfilled') setVentas(v.value.data);
    setCaja(c.status === 'fulfilled' ? c.value.data : null);
    if (u.status === 'fulfilled') {
      const elegibles = u.value.data.filter((x: Cajero) => ['CAJERO', 'ADMIN_EMPRESA', 'GERENTE'].includes(x.rol));
      setCajeros(elegibles);
      setCajeroId((actual) => actual || String(elegibles[0]?.id || ''));
    }
  };
  useEffect(() => { void cargar(); }, []);

  const abrirCaja = async () => {
    if (!cajeroId || base === '' || Number(base) < 0) return;
    setOcupado(true); setError('');
    try { await api.post('/caja/abrir', { montoInicial: Number(base), cajeroId: Number(cajeroId) }); setBase(''); await cargar(); }
    catch (e: any) { setError(e?.response?.data?.message || 'No se pudo abrir la caja.'); }
    finally { setOcupado(false); }
  };
  const cerrarCaja = async () => {
    if (!caja || contado === '' || Number(contado) < 0) return;
    setOcupado(true); setError('');
    try { await api.post(`/caja/${caja.id}/cerrar`, { montoFinal: Number(contado) }); setContado(''); await cargar(); }
    catch (e: any) { setError(e?.response?.data?.message || 'No se pudo cerrar la caja.'); }
    finally { setOcupado(false); }
  };

  const hoy = new Date().toDateString();
  const ventasHoy = ventas.filter((v) => v.estado !== 'ANULADO' && new Date(v.creadoEn).toDateString() === hoy);
  const totalHoy = ventasHoy.reduce((sum, venta) => sum + Number(venta.total), 0);
  const bajos = productos.filter((p) => p.controlaStock && p.stockActual <= p.stockMinimo);
  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar /><div className="mx-auto max-w-7xl space-y-6 p-4 md:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">Operación comercial</p><h1 className="mt-1 text-3xl font-bold">Resumen de tu negocio</h1><p className="mt-1 text-sm text-gray-400">Ventas, caja y existencias en una sola vista.</p></div><button onClick={cargar} className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:text-white"><RefreshCw size={16} /> Actualizar</button></div>
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      { icon: CircleDollarSign, title: 'Ventas de hoy', value: moneda(totalHoy), detail: `${ventasHoy.length} transacciones` },
      { icon: Receipt, title: 'Ventas registradas', value: String(ventas.length), detail: 'Últimas transacciones' },
      { icon: Boxes, title: 'Productos', value: String(productos.length), detail: 'En tu catálogo' },
      { icon: AlertTriangle, title: 'Existencias bajas', value: String(bajos.length), detail: 'En o bajo el mínimo' },
    ].map(({ icon: Icon, title, value, detail }) => <div key={title} className="rounded-2xl border border-gray-800 bg-gray-900 p-5"><Icon size={21} className="text-orange-500" /><p className="mt-4 text-sm text-gray-400">{title}</p><p className="mt-1 text-2xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>)}</div>
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-gray-800 bg-gray-900 p-5"><h2 className="text-lg font-bold">Caja de la sucursal</h2>{caja ? <div className="mt-4 space-y-4"><p className="text-sm text-green-400">Abierta · asignada a {caja.usuario?.nombre || 'cajero'}</p><p className="text-sm text-gray-400">Base inicial: {moneda(Number(caja.montoInicial))}</p><label className="block text-sm text-gray-400">Dinero contado al cerrar<input type="number" min="0" value={contado} onChange={(e) => setContado(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white" /></label><button onClick={cerrarCaja} disabled={ocupado || contado === ''} className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50">Cerrar caja</button></div> : <div className="mt-4 space-y-4"><p className="text-sm text-gray-400">Abre la caja antes de registrar ventas.</p><label className="block text-sm text-gray-400">Asignar a<select value={cajeroId} onChange={(e) => setCajeroId(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white">{cajeros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label className="block text-sm text-gray-400">Base de efectivo<input type="number" min="0" value={base} onChange={(e) => setBase(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white" /></label><button onClick={abrirCaja} disabled={ocupado || !cajeroId || base === ''} className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50">Abrir caja</button></div>}</section>
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5"><h2 className="text-lg font-bold">Productos por reponer</h2><div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{bajos.length ? bajos.map((p) => <div key={p.id} className="flex justify-between gap-3 rounded-lg bg-gray-800 p-3 text-sm"><div><strong>{p.nombre}</strong><p className="text-xs text-gray-500">{p.codigoBarras || 'Sin código de barras'}</p></div><span className="text-yellow-400">{p.stockActual} / mín. {p.stockMinimo}</span></div>) : <p className="text-sm text-gray-400">No hay productos en el nivel mínimo.</p>}</div></section></div>
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5"><h2 className="text-lg font-bold">Ventas recientes</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-gray-800 text-gray-400"><tr><th className="pb-3">Venta</th><th className="pb-3">Fecha</th><th className="pb-3">Pago</th><th className="pb-3 text-right">Total</th></tr></thead><tbody>{ventas.slice(0, 10).map((v) => <tr key={v.id} className="border-b border-gray-800"><td className="py-3">{v.numero}</td><td>{new Date(v.creadoEn).toLocaleString('es-CO')}</td><td>{v.metodoPago}</td><td className="text-right font-semibold">{moneda(Number(v.total))}</td></tr>)}</tbody></table>{!ventas.length && <p className="py-8 text-center text-gray-400">Aún no hay ventas registradas.</p>}</div></section>
  </div></main></AuthGuard>;
}
