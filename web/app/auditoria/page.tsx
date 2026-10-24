'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';

type Registro = { id: number; creadoEn: string; accion: string; detalle: { metodo: string; ruta: string; estado: number; recursoId?: number; actor?: { nombre: string; rol: string; sucursalId?: number }; campos?: string[]; cambio?: { nombre?: string; anterior?: string; nuevo?: string; pantalla?: string } } };
export default function AuditoriaPage() {
  const admin = useAuthStore(s => s.usuario?.rol === 'ADMIN_EMPRESA');
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [siguiente, setSiguiente] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [incluirConsultas, setIncluirConsultas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const cargar = useCallback(async (antesDe?: number) => {
    setCargando(true); setError('');
    try { const { data } = await api.get('/auditoria', { params: { antesDe, incluirConsultas } }); setRegistros(data.registros); setSiguiente(data.siguiente); }
    catch { setError('No se pudo cargar la auditoría.'); } finally { setCargando(false); }
  }, [incluirConsultas]);
  useEffect(() => { if (admin) cargar(); }, [admin, cargar]);
  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar /><div className="mx-auto max-w-6xl p-4"><h1 className="mb-3 text-2xl font-bold">Auditoría de la empresa</h1>
    {!admin ? <p>Solo el administrador puede consultar esta información.</p> : <>
      <p className="mb-4 text-gray-400">Actividad registrada desde la activación de la auditoría. Incluye usuarios, administradores, consultas y operaciones. Las contraseñas y códigos de acceso no se muestran.</p>
      <button disabled={cargando} onClick={() => cargar()} className="mb-4 rounded border border-gray-700 p-2">{cargando ? 'Cargando…' : 'Actualizar / más recientes'}</button>
      <label className="mb-4 block"><input type="checkbox" checked={incluirConsultas} onChange={e => setIncluirConsultas(e.target.checked)} /> Incluir consultas de datos</label>{error && <p role="alert">{error}</p>}
      <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Fecha', 'Usuario', 'Acción', 'Detalle'].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{registros.map(r => <tr key={r.id} className="border-t border-gray-800"><td className="p-3">{new Date(r.creadoEn).toLocaleString('es-CO')}</td><td className="p-3">{r.detalle.actor?.nombre}<div className="text-xs text-gray-400">{r.detalle.actor?.rol} · Sucursal {r.detalle.actor?.sucursalId || '—'}</div></td><td className="p-3">{r.accion}<div className="text-xs">HTTP {r.detalle.estado}</div></td><td className="p-3">{r.detalle.metodo} {r.detalle.ruta} {r.detalle.recursoId ? `#${r.detalle.recursoId}` : ''}{r.detalle.campos?.length ? <p>Campos: {r.detalle.campos.join(', ')}</p> : null}{r.detalle.cambio?.pantalla && <p>Pantalla: {r.detalle.cambio.pantalla}</p>}{r.detalle.cambio?.nuevo && <p>{r.detalle.cambio.nombre}: {r.detalle.cambio.anterior || 'Sin código'} → {r.detalle.cambio.nuevo}</p>}</td></tr>)}</tbody></table></div>
      {!cargando && !registros.length && <p>No hay actividad registrada todavía.</p>}
      {siguiente && <button disabled={cargando} onClick={() => cargar(siguiente)} className="mt-4 rounded border border-gray-700 p-3">Ver anteriores</button>}
    </>}
  </div></main></AuthGuard>;
}
