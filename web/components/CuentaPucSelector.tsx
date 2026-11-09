'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

type Cuenta = { codigo: string; nombre: string; activo: boolean };
export default function CuentaPucSelector({ tipo, value, onChange }: { tipo: string; value: string; onChange: (codigo: string) => void }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.get<Cuenta[]>('/financiero/puc/cuentas', { signal: controller.signal }).then(r => setCuentas(r.data)).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, []);
  const clase = tipo === 'INGRESO' ? '4' : '5';
  return <label className="block text-sm text-gray-400">Cuenta PUC
    <select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white">
      <option value="">Conservar clasificación o revisar después</option>
      {cuentas.filter(c => c.activo && c.codigo.startsWith(clase) && c.codigo.length >= 6 && !cuentas.some(h => h.codigo !== c.codigo && h.codigo.startsWith(c.codigo))).map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
    </select>
    {error && <span className="mt-1 block text-xs text-amber-200">No se pudo cargar el catálogo. Puedes clasificar el movimiento desde Plan de cuentas.</span>}
  </label>;
}
