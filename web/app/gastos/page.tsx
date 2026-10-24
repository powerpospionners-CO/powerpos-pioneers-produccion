'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LockKeyhole, Receipt } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const CATEGORIAS = [['OTROS','Otros gastos'], ['COMPRA_INSUMOS','Compra de insumos'], ['SERVICIOS','Servicios'], ['ARRIENDO','Arriendo'], ['MANTENIMIENTO','Mantenimiento'], ['NOMINA','Nómina'], ['IMPUESTOS','Impuestos'], ['COMISION_DISTRIBUIDOR','Comisiones']];
type Gasto = { id: number; descripcion: string; monto: number; pagadoConRecaudo: boolean };
export default function GastosPage() {
  const [token, setToken] = useState('');
  const [codigo, setCodigo] = useState('');
  const [venceEn, setVenceEn] = useState(0);
  const [categoria, setCategoria] = useState('OTROS');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [pagadoConRecaudo, setPagadoConRecaudo] = useState(false);
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState<Gasto | null>(null);
  const bloquear = useCallback(() => { setToken(''); setCodigo(''); }, []);
  useEffect(() => { if (!token) return; const timer = setTimeout(bloquear, Math.max(0, venceEn - Date.now())); return () => clearTimeout(timer); }, [token, venceEn, bloquear]);
  const desbloquear = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true); setError('');
    try { const { data } = await api.post('/acceso-gastos/desbloquear', { codigo }); setCodigo(''); setVenceEn(data.venceEn); setToken(data.token); setClave(actual => actual || crypto.randomUUID()); }
    catch (e: any) { setError(e?.response?.data?.message || 'No se pudo abrir el apartado de gastos.'); }
    finally { setOcupado(false); }
  };
  const registrar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!clave || ocupado) return;
    setOcupado(true); setPendiente(true); setError('');
    try {
      const { data } = await api.post('/acceso-gastos/registrar', { categoria, descripcion, monto: Number(monto), fecha, pagadoConRecaudo, clave }, { headers: { 'X-Acceso-Gastos': token } });
      setGuardado(data); setPendiente(false);
    } catch (e: any) {
      if (e?.response?.status && e.response.status < 500) setPendiente(false);
      if ([401,403].includes(e?.response?.status)) bloquear();
      setError(e?.response?.data?.message || 'No se pudo confirmar el registro. Reintenta el mismo envío; no se creará un gasto duplicado.');
    } finally { setOcupado(false); }
  };
  const nuevo = () => { setGuardado(null); setError(''); setCategoria('OTROS'); setDescripcion(''); setMonto(''); setFecha(hoy()); setPagadoConRecaudo(false); setClave(crypto.randomUUID()); };
  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar /><div className="mx-auto max-w-xl px-4 py-7">
    <header className="mb-6 flex items-center gap-3"><Receipt className="text-orange-400" size={25} /><div><h1 className="text-2xl font-bold">Registrar gasto</h1><p className="mt-1 text-sm text-gray-400">Registra los gastos de tu sucursal para que el administrador pueda revisarlos.</p></div></header>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
    {!token ? <form onSubmit={desbloquear} className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5"><div className="flex items-center gap-2 text-sm text-gray-300"><LockKeyhole size={17} />Acceso autorizado por el administrador</div><label className="block text-sm">Código de acceso a Gastos<input autoFocus aria-label="Código de acceso a Gastos" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={codigo} onChange={e => setCodigo(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3" /></label><button disabled={ocupado || codigo.length !== 8} className="w-full rounded-lg bg-orange-600 p-3 font-semibold disabled:opacity-50">{ocupado ? 'Comprobando…' : 'Entrar'}</button><p className="text-xs text-gray-500">Solicita al administrador el código de este apartado. Se bloquea al salir o después de 30 minutos.</p></form>
    : guardado ? <section className="space-y-4 rounded-2xl border border-emerald-500/25 bg-gray-900 p-6"><CheckCircle2 className="text-emerald-400" size={30} /><h2 className="text-xl font-semibold">Gasto registrado</h2><p>{guardado.descripcion}</p><p className="text-2xl font-bold">{moneda(guardado.monto)}</p><p className="text-sm text-gray-400">{guardado.pagadoConRecaudo ? 'Se descontará del recaudo de la semana del gasto.' : 'No se descontará del recaudo semanal.'} El administrador puede consultarlo en Finanzas y Auditoría.</p><button onClick={nuevo} className="w-full rounded-lg bg-orange-600 p-3 font-semibold">Registrar otro gasto</button><button onClick={bloquear} className="w-full rounded-lg border border-gray-700 p-3 text-sm">Bloquear acceso</button></section>
    : <form onSubmit={registrar} className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <fieldset disabled={ocupado || pendiente} className="space-y-4 disabled:opacity-70"><label className="block text-sm">Categoría<select value={categoria} onChange={e => setCategoria(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3">{CATEGORIAS.map(([valor,texto]) => <option key={valor} value={valor}>{texto}</option>)}</select></label>
      <label className="block text-sm">¿En qué se gastó?<textarea required minLength={3} maxLength={250} rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej. Pago del transporte de la mercancía" className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3" /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Valor del gasto<input required type="number" min="0.01" max="99999999.99" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3" /></label><label className="block text-sm">Fecha del gasto<input required type="date" max={hoy()} value={fecha} onChange={e => setFecha(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3" /></label></div>
      <label className="block rounded-xl border border-orange-500/25 bg-orange-500/5 p-4 text-sm"><span className="flex items-center gap-2"><input type="checkbox" checked={pagadoConRecaudo} onChange={e => setPagadoConRecaudo(e.target.checked)} />Pagado con dinero del recaudo</span><span className="mt-2 block text-xs leading-relaxed text-gray-400">Marca solo si salió del efectivo ya retirado de caja. Se descontará del disponible semanal para consignar.</span></label></fieldset>
      <button disabled={ocupado || !clave} className="w-full rounded-lg bg-orange-600 p-3 font-semibold disabled:opacity-50">{ocupado ? 'Guardando…' : pendiente ? 'Reintentar el mismo envío' : 'Guardar gasto'}</button>
      <button type="button" disabled={ocupado} onClick={bloquear} className="w-full rounded-lg border border-gray-700 p-3 text-sm text-gray-300">Bloquear acceso</button>
    </form>}
  </div></main></AuthGuard>;
}
