'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import AuditoriaActividad from '@/components/AuditoriaActividad';
import type { RegistroAuditoria } from '@/lib/auditoria';
import { useAuthStore } from '@/store/authStore';

export default function AuditoriaPage() {
  const admin = useAuthStore(s => s.usuario?.rol === 'ADMIN_EMPRESA');
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [sucursales, setSucursales] = useState<Record<number, string>>({});
  const [siguiente, setSiguiente] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [incluirConsultas, setIncluirConsultas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const cargar = useCallback(async (antesDe?: number) => {
    setCargando(true); setError('');
    try { const { data } = await api.get('/auditoria', { params: { antesDe, incluirConsultas } }); setRegistros(data.registros); setSiguiente(data.siguiente); }
    catch { setError('No se pudo cargar la actividad. Intenta actualizarla.'); } finally { setCargando(false); }
  }, [incluirConsultas]);
  useEffect(() => { if (admin) cargar(); }, [admin, cargar]);
  useEffect(() => {
    if (!admin) return;
    let activo = true;
    api.get('/sucursales').then(({ data }) => { if (activo) setSucursales(Object.fromEntries(data.map((s: { id: number; nombre: string }) => [s.id, s.nombre]))); }).catch(() => undefined);
    return () => { activo = false; };
  }, [admin]);
  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar />
    {!admin ? <p className="p-6">Solo el administrador puede consultar esta información.</p> : <AuditoriaActividad registros={registros} sucursales={sucursales} cargando={cargando} error={error} incluirConsultas={incluirConsultas} cambiarConsultas={setIncluirConsultas} actualizar={() => cargar()} anteriores={siguiente ? () => cargar(siguiente) : undefined} />}
  </main></AuthGuard>;
}
