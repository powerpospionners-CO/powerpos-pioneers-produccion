'use client';

import { useEffect, useState } from 'react';

const DENOMINACIONES = [
  { valor: 100000, tipo: 'billete' },
  { valor: 50000, tipo: 'billete' },
  { valor: 20000, tipo: 'billete' },
  { valor: 10000, tipo: 'billete' },
  { valor: 5000, tipo: 'billete' },
  { valor: 2000, tipo: 'billete' },
  { valor: 1000, tipo: 'moneda' },
  { valor: 500, tipo: 'moneda' },
  { valor: 200, tipo: 'moneda' },
  { valor: 100, tipo: 'moneda' },
] as const;

const moneda = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function CalculadoraBilletes({ objetivo, onCambiar }: { objetivo: number; onCambiar?: (recibido: number) => void }) {
  const [conteo, setConteo] = useState<Record<number, number>>({});
  const recibido = DENOMINACIONES.reduce((acc, d) => acc + (conteo[d.valor] || 0) * d.valor, 0);

  useEffect(() => { onCambiar?.(recibido); }, [recibido]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambio = recibido - objetivo;
  const sumar = (valor: number, delta: number) => setConteo((prev) => ({ ...prev, [valor]: Math.max(0, (prev[valor] || 0) + delta) }));

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-300">Billetes y monedas recibidos</span>
        <button type="button" onClick={() => setConteo({})} className="text-xs text-gray-500 hover:text-white">Limpiar</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DENOMINACIONES.map((d) => (
          <div key={d.valor} className="rounded-lg border border-gray-800 bg-gray-900 p-2 text-center">
            <button
              type="button"
              onClick={() => sumar(d.valor, 1)}
              className={`w-full rounded-lg py-2 text-xs font-bold transition-colors ${d.tipo === 'billete' ? 'border border-green-700/40 bg-green-900/30 text-green-300 hover:bg-green-900/50' : 'border border-yellow-700/40 bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50'}`}
            >
              {d.tipo === 'billete' ? '💵' : '🪙'} {moneda(d.valor)}
            </button>
            <div className="mt-1 flex items-center justify-center gap-2">
              <button type="button" aria-label={`Quitar ${moneda(d.valor)}`} onClick={() => sumar(d.valor, -1)} className="rounded bg-gray-800 px-2 py-0.5 text-gray-300 hover:text-white">−</button>
              <span className="w-5 text-center text-sm text-white">{conteo[d.valor] || 0}</span>
              <button type="button" aria-label={`Agregar ${moneda(d.valor)}`} onClick={() => sumar(d.valor, 1)} className="rounded bg-gray-800 px-2 py-0.5 text-gray-300 hover:text-white">+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1 border-t border-gray-800 pt-3 text-sm">
        <div className="flex justify-between text-gray-300"><span>Recibido</span><strong className="text-white">{moneda(recibido)}</strong></div>
        <div className="flex justify-between text-gray-300"><span>A cobrar</span><strong className="text-white">{moneda(objetivo)}</strong></div>
        <div className={`flex justify-between rounded-lg px-2 py-1 font-bold ${cambio < 0 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          <span>{cambio < 0 ? 'Falta' : 'Cambio a devolver'}</span><strong>{moneda(Math.abs(cambio))}</strong>
        </div>
      </div>
    </div>
  );
}
