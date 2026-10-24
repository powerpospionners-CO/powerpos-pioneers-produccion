'use client';
import { useState } from 'react';
import api from '@/lib/api';

export default function AccesoBarrasUsuario({ id }: { id: number }) {
  const [mensaje, setMensaje] = useState('');
  const [codigo, setCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const configurar = async (habilitado: boolean) => {
    if (!window.confirm(habilitado ? '¿Generar un código nuevo para que este usuario edite únicamente códigos de barras? El código anterior dejará de funcionar.' : '¿Revocar este acceso y cerrar sus sesiones de códigos de barras?')) return;
    setGuardando(true); setCodigo(''); setMensaje('');
    try {
      const { data } = await api.post(`/acceso-barras/usuarios/${id}`, { habilitado });
      setCodigo(data.codigo || ''); setMensaje(data.mensaje);
    } catch (e: any) { setMensaje(e?.response?.data?.message || 'No se pudo configurar el acceso'); }
    finally { setGuardando(false); }
  };
  return <div className="mt-3 rounded-lg border border-gray-700 p-3 text-sm">
    <p className="mb-2 text-gray-300">Acceso exclusivo a códigos de barras</p>
    <div className="flex flex-wrap gap-2">
      <button disabled={guardando} onClick={() => configurar(true)} className="rounded bg-gray-700 px-3 py-2 disabled:opacity-50">Generar código de acceso</button>
      <button disabled={guardando} onClick={() => configurar(false)} className="rounded bg-gray-700 px-3 py-2 disabled:opacity-50">Revocar acceso</button>
    </div>
    {mensaje && <p role="status" className="mt-2 text-gray-300">{mensaje}</p>}
    {codigo && <div className="mt-2"><p className="text-xl font-bold tracking-widest text-orange-400">{codigo}</p><button onClick={() => setCodigo('')} className="mt-2 underline">Ocultar código</button></div>}
  </div>;
}
