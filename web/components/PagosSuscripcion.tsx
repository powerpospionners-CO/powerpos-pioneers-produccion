'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
type Pago = { referencia: string; estado: string; monto: number; periodicidad: string };
type Cobro = { estadoCobro: string; suscripcionVenceEn: string | null; pagos: Pago[]; plan: string; precios: { planes: { plan: string; mensual: number; anual: number }[] } };
const moneda = (valor: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);
export default function PagosSuscripcion({ empresaId, alGuardar }: { empresaId: number; alGuardar: () => Promise<void> }) {
  const [datos, setDatos] = useState<Cobro | null>(null);
  const [periodicidad, setPeriodicidad] = useState<'MENSUAL' | 'ANUAL'>('MENSUAL');
  const [estado, setEstado] = useState<'APROBADO' | 'PENDIENTE'>('APROBADO');
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState(''), [mensaje, setMensaje] = useState('');
  const clave = useRef<string | null>(null);
  const cargar = useCallback(async () => {
    const { data } = await api.get(`/superadmin/empresas/${empresaId}/suscripcion`);
    setDatos(data);
  }, [empresaId]);
  useEffect(() => {
    let vigente = true;
    api.get(`/superadmin/empresas/${empresaId}/suscripcion`).then(({ data }) => { if (vigente) setDatos(data); }).catch(() => { if (vigente) setError('No se pudo consultar la suscripción.'); });
    return () => { vigente = false; };
  }, [empresaId]);
  const guardar = async (referencia?: string) => {
    setOcupado(true); setError(''); setMensaje('');
    try {
      if (referencia) await api.post(`/superadmin/empresas/${empresaId}/suscripcion/pagos/${encodeURIComponent(referencia)}/confirmar`);
      else {
        clave.current ||= crypto.randomUUID();
        await api.post(`/superadmin/empresas/${empresaId}/suscripcion/pagos`, { clave: clave.current, periodicidad, estado });
        clave.current = null;
      }
      setMensaje(referencia || estado === 'APROBADO' ? 'Pago confirmado. El vencimiento se renovó automáticamente.' : 'Pago pendiente registrado. El vencimiento no cambió.');
      await cargar(); await alGuardar();
    } catch (e: any) { setError(e?.response?.data?.message || 'No se confirmó el registro. Actualiza el estado antes de volver a intentarlo.'); }
    finally { setOcupado(false); }
  };
  const alDia = datos?.estadoCobro === 'AL_DIA', exonerada = datos?.estadoCobro === 'EXONERADO';
  const precio = datos?.precios.planes.find((p) => p.plan === datos.plan);
  const pendientes = datos?.pagos.filter((p) => p.estado === 'PENDIENTE' && p.referencia.startsWith('MANUAL-')) || [];
  return <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
    <h4 className="font-semibold">Registro de pagos del plan</h4>
    <p className={alDia || exonerada ? 'text-sm text-emerald-400' : 'text-sm text-amber-300'}>{!datos ? 'Consultando estado…' : alDia ? 'Al día — no tiene pagos pendientes' : exonerada ? 'Pago del plan exonerado' : datos.estadoCobro === 'SIN_CONFIGURAR' ? 'Sin período configurado' : 'Renovación pendiente'}</p>
    {datos?.suscripcionVenceEn && <p className="text-xs text-slate-400">Próximo vencimiento: {new Date(datos.suscripcionVenceEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {mensaje && <p role="status" className="text-sm text-emerald-300">{mensaje}</p>}
    <label className="block text-sm">Período<select disabled={ocupado} value={periodicidad} onChange={(e) => { clave.current = null; setPeriodicidad(e.target.value as 'MENSUAL' | 'ANUAL'); }} className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2"><option value="MENSUAL">Un mes</option><option value="ANUAL">Un año</option></select></label>
    <label className="block text-sm">Estado del pago<select disabled={ocupado} value={estado} onChange={(e) => { clave.current = null; setEstado(e.target.value as 'APROBADO' | 'PENDIENTE'); }} className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2"><option value="APROBADO">Pagado — dinero recibido</option><option value="PENDIENTE">Pendiente — aún no recibido</option></select></label>
    <p className="text-xs text-slate-400">Valor del período: {precio ? moneda(periodicidad === 'ANUAL' ? precio.anual : precio.mensual) : 'Consultando…'}. Confirmar el pago suma el período desde hoy. Un pago pendiente no renueva el acceso.</p>
    <button type="button" disabled={ocupado || !datos || alDia || exonerada} onClick={() => void guardar()} className="w-full rounded-lg bg-emerald-600 px-3 py-2 font-semibold disabled:opacity-40">{ocupado ? 'Guardando…' : estado === 'APROBADO' ? 'Confirmar pago y renovar automáticamente' : 'Registrar pago pendiente'}</button>
    {pendientes.map((p) => <div key={p.referencia} className="flex items-center justify-between gap-3 border-t border-slate-700 pt-3 text-sm"><span>{moneda(p.monto)} · {p.periodicidad === 'ANUAL' ? 'Anual' : 'Mensual'} · Pendiente</span><button disabled={ocupado || alDia || exonerada} onClick={() => void guardar(p.referencia)} className="text-emerald-300 underline disabled:opacity-40">Confirmar recibido</button></div>)}
    <button type="button" disabled={ocupado} onClick={() => { void cargar().catch(() => setError('No se pudo actualizar el estado.')); }} className="text-xs text-slate-400 underline">Actualizar estado</button>
  </section>;
}
