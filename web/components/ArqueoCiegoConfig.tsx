'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

// Arqueo ciego por sede: el cajero cuenta el efectivo sin ver cuánto se espera.
export default function ArqueoCiegoConfig() {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [mensaje, setMensaje] = useState('');
  useEffect(() => {
    api.get('/caja/arqueo-ciego').then(({ data }) => setActivo(!!data.activo)).catch(() => setActivo(null));
  }, []);
  const cambiar = async (valor: boolean) => {
    setMensaje('');
    try {
      setActivo(!!(await api.patch('/caja/arqueo-ciego', { activo: valor })).data.activo);
      setMensaje('✅ Guardado');
    } catch (e: any) {
      setMensaje(e?.response?.data?.message || 'No se pudo guardar');
    }
  };
  if (activo === null) return null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-4 space-y-2">
      <h3 className="text-white font-semibold">Arqueo ciego</h3>
      <label className="flex gap-3 text-sm text-gray-200">
        <input type="checkbox" className="mt-1" checked={activo} onChange={(e) => void cambiar(e.target.checked)} />
        <span>
          El cajero cuenta el efectivo al cerrar sin ver cuánto debería haber
          <span className="block text-xs text-gray-500">La diferencia la ven el administrador y el gerente en el historial de cajas. Aplica a esta sede. No se usa cuando el recaudo semanal está activo, porque el retiro necesita las ventas en efectivo.</span>
        </span>
      </label>
      {mensaje && <p className={`text-sm ${mensaje.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>{mensaje}</p>}
    </div>
  );
}
