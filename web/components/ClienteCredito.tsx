'use client';
import { useState } from 'react';
import api from '@/lib/api';

export default function ClienteCredito({ id, onChange }: { id: number | null; onChange: (id: number | null) => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<{ id: number; nombre: string; documento: string }[]>([]);
  const [error, setError] = useState('');
  const buscar = async () => {
    setError('');
    try { const { data } = await api.get('/clientes', { params: { busqueda } }); setClientes(data); }
    catch { setError('No se pudieron consultar los clientes.'); }
  };
  return <div className="space-y-2 rounded-xl border border-gray-700 p-3 text-sm">
    <label className="block">Cliente para crédito<input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Nombre o documento" className="mt-1 w-full rounded bg-gray-950 p-2" /></label>
    <button type="button" onClick={buscar} className="text-orange-300">Buscar cliente</button>
    <select aria-label="Cliente para crédito" value={id ?? ''} onChange={e=>onChange(e.target.value ? Number(e.target.value) : null)} className="w-full rounded bg-gray-950 p-2"><option value="">Sin cliente · solo contado</option>{clientes.map(c=><option key={c.id} value={c.id}>{c.nombre} · {c.documento}</option>)}</select>
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </div>;
}
