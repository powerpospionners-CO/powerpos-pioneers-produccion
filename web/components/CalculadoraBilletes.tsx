'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { moneda } from '@/lib/formato';

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
        <button type="button" onClick={() => setConteo({})} className="min-h-11 px-3 text-sm text-gray-400 hover:text-white touch-manipulation">Limpiar</button>
      </div>
      <p className="mb-3 text-xs text-gray-400">Toca un billete o una moneda para agregarlo.</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        {DENOMINACIONES.map((d) => (
          <div key={d.valor} className={`rounded-xl border p-2 text-center transition-colors ${conteo[d.valor] ? 'border-orange-500/70 bg-orange-500/10' : 'border-gray-800 bg-gray-900'}`}>
            <button
              type="button"
              onClick={() => sumar(d.valor, 1)}
              aria-label={`Agregar ${d.tipo} de ${moneda(d.valor)}`}
              className="group w-full touch-manipulation select-none rounded-lg p-1 text-sm font-bold text-white transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            >
              <span className="relative mb-2 flex h-24 items-center justify-center sm:h-28">
                <Image
                  src={`/efectivo/${d.tipo}-${d.valor}.${[50000, 20000, 5000].includes(d.valor) ? 'png' : 'jpg'}`}
                  alt={`${d.tipo === 'billete' ? 'Billete colombiano' : 'Moneda colombiana'} de ${moneda(d.valor)}`}
                  width={d.tipo === 'billete' ? 480 : 235}
                  height={d.tipo === 'billete' ? 210 : 235}
                  unoptimized
                  draggable={false}
                  className={d.tipo === 'billete' ? 'max-h-full w-full rounded object-contain drop-shadow-md' : 'h-24 w-24 rounded-full object-contain shadow-md'}
                />
              </span>
              {moneda(d.valor)}
            </button>
            <div className="mt-1 flex items-center justify-center gap-2">
              <button type="button" aria-label={`Quitar ${moneda(d.valor)}`} disabled={!conteo[d.valor]} onClick={() => sumar(d.valor, -1)} className="h-11 w-11 shrink-0 touch-manipulation rounded-lg bg-gray-800 text-xl text-gray-300 hover:text-white active:bg-gray-700 disabled:opacity-30">−</button>
              <span aria-label={`Cantidad de ${moneda(d.valor)}`} className="min-w-5 text-center text-base font-semibold tabular-nums text-white">{conteo[d.valor] || 0}</span>
              <button type="button" aria-label={`Agregar ${moneda(d.valor)}`} onClick={() => sumar(d.valor, 1)} className="h-11 w-11 shrink-0 touch-manipulation rounded-lg bg-gray-800 text-xl text-gray-300 hover:text-white active:bg-gray-700">+</button>
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
