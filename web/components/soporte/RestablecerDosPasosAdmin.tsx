'use client';

import { useState } from 'react';
import api from '@/lib/api';

// El superadministrador quita la 2FA de un administrador que perdió su celular y sus códigos.
export default function RestablecerDosPasosAdmin({ empresaId, email, nombre }: { empresaId: number; email: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ motivo: '', password: '', codigo: '' });
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campo = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white';
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true); setEstado(null);
    try {
      await api.post('/auth/seguridad/superadmin/restablecer-2fa', { empresaId, email, ...form });
      setEstado({ ok: true, texto: `Listo. ${nombre} entrará solo con su contraseña y el sistema le pedirá activar la verificación de nuevo.` });
      setForm({ motivo: '', password: '', codigo: '' });
    } catch (err: any) {
      setEstado({ ok: false, texto: err?.response?.data?.message || 'No se pudo restablecer' });
    } finally { setEnviando(false); }
  };
  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className="text-xs border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 hover:border-sky-500">Restablecer 2FA</button>;
  return (
    <form onSubmit={enviar} className="mt-2 w-72 space-y-2 rounded-lg border border-sky-800 bg-slate-900 p-3 text-left">
      <p className="text-xs text-slate-300">Quita la verificación en dos pasos de <strong>{nombre}</strong> y cierra sus sesiones. Hazlo solo si confirmaste con esa persona que perdió el celular y sus códigos. Se le avisa por correo.</p>
      <label className="block text-xs text-slate-400">Motivo<textarea required minLength={10} maxLength={200} className={campo} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ej.: perdió el celular, confirmado por WhatsApp" /></label>
      <label className="block text-xs text-slate-400">Tu contraseña<input required type="password" autoComplete="current-password" className={campo} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <label className="block text-xs text-slate-400">Tu código de verificación<input required inputMode="numeric" autoComplete="one-time-code" maxLength={11} className={campo} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></label>
      {estado && <p className={`text-xs ${estado.ok ? 'text-emerald-400' : 'text-red-400'}`}>{estado.texto}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setAbierto(false); setEstado(null); }} className="flex-1 rounded-lg border border-slate-700 py-1.5 text-xs">Cerrar</button>
        <button disabled={enviando || form.motivo.trim().length < 10} className="flex-1 rounded-lg bg-sky-700 py-1.5 text-xs font-bold text-white disabled:opacity-50">{enviando ? 'Restableciendo…' : 'Restablecer'}</button>
      </div>
    </form>
  );
}
