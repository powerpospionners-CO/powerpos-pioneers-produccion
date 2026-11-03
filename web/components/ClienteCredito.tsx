'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type Cliente = { id: number; nombre: string; documento: string | null; telefono?: string | null };

export default function ClienteCredito({ id, onChange }: { id: number | null; onChange: (id: number | null) => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);
  const [cargando, setCargando] = useState(false);
  const [consultado, setConsultado] = useState(false);
  const [error, setError] = useState('');
  const empresaId = useAuthStore((s) => s.usuario?.empresaId);
  const sucursalId = useAuthStore((s) => s.usuario?.sucursalId);
  const solicitud = useRef(0), controlador = useRef<AbortController | null>(null);
  const buscar = useCallback(async () => {
    const numero = ++solicitud.current;
    controlador.current?.abort();
    const control = new AbortController(); controlador.current = control;
    setError(''); setCargando(true); setConsultado(false);
    try {
      const { data } = await api.get<Cliente[]>('/clientes', { params: { busqueda: busqueda.trim() }, signal: control.signal });
      if (numero !== solicitud.current || control.signal.aborted) return;
      setClientes(data); setConsultado(true);
    } catch (e: unknown) {
      if (numero !== solicitud.current || control.signal.aborted) return;
      setClientes([]);
      const mensaje = (e as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      setError(typeof mensaje === 'string' ? mensaje : 'No se pudieron consultar los clientes. Revisa la conexión y vuelve a buscar.');
    } finally { if (numero === solicitud.current && !control.signal.aborted) setCargando(false); }
  }, [busqueda]);
  useEffect(() => {
    const demora = setTimeout(() => { void buscar(); }, busqueda.trim() ? 300 : 0);
    return () => { clearTimeout(demora); controlador.current?.abort(); };
  }, [buscar, busqueda, empresaId, sucursalId]);
  const opciones = id && seleccionado?.id === id && !clientes.some((c) => c.id === id) ? [seleccionado, ...clientes] : clientes;
  const elegir = (cliente: Cliente | null) => {
    setSeleccionado(cliente);
    onChange(cliente?.id ?? null);
  };
  return <div className="space-y-2 rounded-xl border border-gray-700 p-3 text-sm">
    <label className="block">Cliente de la venta<input value={busqueda} maxLength={150} onChange={e=>setBusqueda(e.target.value)} onKeyDown={e=>{ if (e.key === 'Enter') { e.preventDefault(); void buscar(); } }} placeholder="Nombre, documento o teléfono" className="mt-1 w-full rounded bg-gray-950 p-2" /></label>
    <p className="text-xs text-gray-300">Selecciona un cliente para identificarlo en la factura, tanto si paga de contado como si queda un saldo a crédito.</p>
    <button type="button" disabled={cargando} onClick={()=>void buscar()} className="text-orange-300 disabled:opacity-50">{cargando ? 'Buscando clientes…' : 'Buscar cliente'}</button>
    <div role="group" aria-label="Seleccionar cliente de la venta" aria-busy={cargando} className="max-h-44 space-y-1 overflow-y-auto">
      <button type="button" aria-pressed={id === null} onClick={() => elegir(null)} className="w-full rounded bg-gray-950 p-2 text-left aria-pressed:bg-orange-900">Sin cliente · venta de contado</button>
      {opciones.map(cliente => (
        <button key={cliente.id} type="button" disabled={cargando} aria-pressed={id === cliente.id} onClick={() => elegir(cliente)} className="w-full rounded bg-gray-950 p-2 text-left aria-pressed:bg-orange-900 disabled:opacity-50">
          {cliente.nombre}{cliente.documento ? ` · ${cliente.documento}` : ''}{cliente.telefono ? ` · ${cliente.telefono}` : ''}
        </button>
      ))}
    </div>
    {!cargando && consultado && clientes.length === 0 && <p role="status" className="text-amber-200">{busqueda.trim() ? 'No se encontraron clientes con esos datos en esta sede. Prueba con una parte del nombre o con el documento.' : 'No hay clientes activos disponibles en esta sede. Comprueba que el cliente se haya creado aquí y esté activo.'}</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </div>;
}
