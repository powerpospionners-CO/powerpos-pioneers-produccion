'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

type RondaCocina = { cuentaId: string; mesa: number; meseroNombre: string; n: number; estado: string; enviadaEn: string; lineas: { nombre: string; cantidad: number; observacion: string }[] };
const SIGUIENTE: Record<string, [string, string]> = { PENDIENTE: ['EN_PREPARACION', 'Empezar'], EN_PREPARACION: ['LISTA', 'Lista'] };

// Rondas enviadas desde las mesas: la cocina las prepara y avisa al mesero cuando están listas.
export default function RondasMesas() {
  const [rondas, setRondas] = useState<RondaCocina[]>([]);
  const cargar = useCallback(() => api.get('/mesas/cocina').then(({ data }) => setRondas(data)).catch(() => setRondas([])), []);
  useEffect(() => {
    void cargar();
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [cargar]);
  if (!rondas.length) return null;
  const minutos = (f: string) => Math.max(0, Math.floor((Date.now() - new Date(f).getTime()) / 60000));
  return (
    <section aria-label="Pedidos de mesas" className="px-6 pt-6">
      <h2 className="mb-3 text-lg font-bold text-white">Mesas</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {rondas.map((r) => (
          <article key={`${r.cuentaId}-${r.n}`} className={`rounded-xl border p-4 ${r.estado === 'LISTA' ? 'border-green-600 bg-green-950/30' : 'border-gray-700 bg-gray-900'}`}>
            <header className="mb-2 flex items-center justify-between text-white">
              <strong className="text-xl">Mesa {r.mesa}</strong>
              <span className="text-sm text-gray-400">R{r.n} · {minutos(r.enviadaEn)} min</span>
            </header>
            <ul className="space-y-1 text-gray-200">
              {r.lineas.map((l, i) => (
                <li key={i}><strong>{l.cantidad} ×</strong> {l.nombre}{l.observacion && <span className="block text-sm font-bold text-amber-300">{l.observacion}</span>}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-400">{r.meseroNombre}</p>
            {SIGUIENTE[r.estado] ? (
              <button type="button" onClick={() => void api.patch(`/mesas/cuentas/${r.cuentaId}/rondas/${r.n}`, { estado: SIGUIENTE[r.estado][0] }).then(cargar).catch(cargar)} className="mt-3 w-full rounded-lg bg-orange-500 py-2 font-bold text-white">
                {SIGUIENTE[r.estado][1]}
              </button>
            ) : <p className="mt-3 text-center text-sm font-semibold text-green-300">Lista · esperando al mesero</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
