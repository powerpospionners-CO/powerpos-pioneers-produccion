'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

// Contacto de soporte de PowerPOS que ven todas las empresas en el Centro de ayuda.
export default function ContactoSoporteConfig() {
  const [datos, setDatos] = useState({ whatsapp: '', correo: '', horario: '' });
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { api.get('/ayuda/contacto').then(({ data }) => setDatos(data)).catch(() => undefined); }, []);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true); setMensaje(null);
    try {
      setDatos((await api.patch('/ayuda/contacto', datos)).data);
      setMensaje({ ok: true, texto: 'Contacto guardado. Ya aparece en el Centro de ayuda de todas las empresas.' });
    } catch (err: any) {
      setMensaje({ ok: false, texto: err?.response?.data?.message || 'No se pudo guardar' });
    } finally { setGuardando(false); }
  };
  const campo = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white';
  return (
    <form onSubmit={guardar} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-orange-400">Soporte</p>
        <h3 className="mt-1 text-xl font-bold">Contacto de soporte</h3>
        <p className="mt-1 text-sm text-slate-400">Aparece en el Centro de ayuda (ícono ?) de todas las empresas. Deja vacío lo que no quieras mostrar.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-300">WhatsApp con indicativo<input className={campo} inputMode="tel" placeholder="573001234567" value={datos.whatsapp} onChange={(e) => setDatos({ ...datos, whatsapp: e.target.value })} /></label>
        <label className="text-sm text-slate-300">Correo<input className={campo} type="email" placeholder="soporte@powerpospioneers.com" value={datos.correo} onChange={(e) => setDatos({ ...datos, correo: e.target.value })} /></label>
        <label className="text-sm text-slate-300">Horario de atención<input className={campo} maxLength={80} placeholder="Lunes a sábado, 8 a. m. a 6 p. m." value={datos.horario} onChange={(e) => setDatos({ ...datos, horario: e.target.value })} /></label>
      </div>
      {mensaje && <p className={`text-sm ${mensaje.ok ? 'text-green-400' : 'text-red-400'}`}>{mensaje.texto}</p>}
      <button disabled={guardando} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar contacto'}</button>
    </form>
  );
}
