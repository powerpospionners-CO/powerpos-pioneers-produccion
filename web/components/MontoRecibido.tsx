'use client';

import { useEffect, useState } from 'react';
import { moneda } from '@/lib/formato';

// Reemplazo simple de la calculadora de billetes para facturar: en vez de
// tocar billete por billete (lento para el cajero), se escribe con cuánto
// pagó el cliente y se muestra el cambio a devolver. Misma firma de props
// que CalculadoraBilletes para poder intercambiarlos sin tocar ModalCobro.
export default function MontoRecibido({ objetivo, onCambiar }: { objetivo: number; onCambiar?: (recibido: number) => void }) {
  const [texto, setTexto] = useState('');
  const recibido = Number(texto) || 0;

  useEffect(() => { onCambiar?.(recibido); }, [recibido]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambio = recibido - objetivo;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-gray-400">Total a cobrar</span>
        <strong className="text-xl font-bold tabular-nums text-white">{moneda(objetivo)}</strong>
      </div>

      <label htmlFor="monto-recibido" className="mb-1.5 block text-sm text-gray-400">¿Con cuánto pagó el cliente?</label>
      <input
        id="monto-recibido"
        type="number"
        inputMode="decimal"
        min={0}
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="0"
        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-center text-2xl font-bold tabular-nums text-white focus:border-orange-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setTexto(String(objetivo))}
        className="mt-2 min-h-11 w-full touch-manipulation rounded-lg bg-gray-800 py-2 text-sm text-gray-300 hover:text-white"
      >
        Pagó exacto ({moneda(objetivo)})
      </button>

      <div className="mt-3 border-t border-gray-800 pt-3">
        <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold ${cambio < 0 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          <span>{cambio < 0 ? 'Falta' : 'Cambio a devolver'}</span>
          <strong className="text-base">{moneda(Math.abs(cambio))}</strong>
        </div>
      </div>
    </div>
  );
}
