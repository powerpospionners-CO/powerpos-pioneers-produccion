'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { guardarOrigen } from '@/lib/soporte';

type Sede = { id: number; nombre: string; pendienteActivacion?: boolean };

// Abre el panel de una sede como su administrador, solo lectura y por 30 minutos. Avisa a la empresa por correo.
export default function SoporteEmpresa({ empresaId, sedes }: { empresaId: number; sedes: Sede[] }) {
  const activas = sedes.filter((s) => !s.pendienteActivacion);
  const [abierto, setAbierto] = useState(false);
  const [sucursalId, setSucursalId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [entrando, setEntrando] = useState(false);
  if (!activas.length) return null;
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntrando(true);
    setError('');
    try {
      const { data } = await api.post('/auth/soporte', { empresaId, sucursalId: Number(sucursalId || activas[0].id), motivo });
      guardarOrigen();
      useAuthStore.getState().setAuth(data.access_token, data.usuario);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo abrir el modo soporte');
      setEntrando(false);
    }
  };
  return (
    <div className="mt-3 rounded-lg border border-sky-800 p-3">
      <button type="button" onClick={() => setAbierto(!abierto)} className="text-sm font-semibold text-sky-300">
        {abierto ? 'Cerrar' : 'Ver el panel de la empresa (solo lectura)'}
      </button>
      {abierto && (
        <form onSubmit={entrar} className="mt-3 space-y-2 text-sm">
          <p className="text-xs text-slate-400">Verás el panel como su administrador durante 30 minutos, sin poder cambiar nada. La empresa recibe un correo con el motivo y cada consulta queda en su Auditoría.</p>
          {activas.length > 1 && (
            <label className="block">Sede
              <select value={sucursalId || String(activas[0].id)} onChange={(e) => setSucursalId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2">
                {activas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="block">Motivo
            <textarea required minLength={10} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: revisar que aparezcan las tarifas de IVA" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2" />
          </label>
          {error && <p className="text-red-400">{error}</p>}
          <button disabled={entrando || motivo.trim().length < 10} className="w-full rounded-lg bg-sky-700 p-2 font-bold text-white disabled:opacity-50">
            {entrando ? 'Entrando…' : 'Entrar en modo soporte'}
          </button>
        </form>
      )}
    </div>
  );
}
