'use client';
import { useState } from 'react';
import { ArrowBigUp, Delete, X } from 'lucide-react';

interface TouchKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  titulo?: string;
}

const FILA_LETRAS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const FILA_SIMBOLOS = [
  ['@', '#', '$', '%', '&', '*', '-', '_', '+', '/'],
  ['(', ')', '[', ']', '{', '}', '<', '>', '=', '~'],
  [',', ';', ':', '!', '?', "'", '"', '\\'],
];

export default function TouchKeyboard({ value, onChange, onClose, titulo }: TouchKeyboardProps) {
  const [mayusculas, setMayusculas] = useState(false);
  const [modoSimbolos, setModoSimbolos] = useState(false);

  const filas = modoSimbolos ? FILA_SIMBOLOS : FILA_LETRAS;

  const insertar = (texto: string) => {
    onChange(value + texto);
  };

  const borrar = () => {
    onChange(value.slice(0, -1));
  };

  const tecla = (letra: string) => {
    const salida = mayusculas ? letra.toUpperCase() : letra;
    insertar(salida);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] bg-gray-950 border-t border-gray-800 shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="text-gray-400 text-xs">{titulo || 'Teclado en pantalla'}</span>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-white p-1">
          <X size={18} />
        </button>
      </div>

      <div className="p-2 md:p-3 space-y-1.5 max-w-3xl mx-auto">
        <div className="flex gap-1.5 justify-center">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => insertar(n)}
              className="flex-1 bg-gray-800 hover:bg-gray-700 active:bg-orange-500/30 text-white rounded-lg py-3 text-sm font-medium"
            >
              {n}
            </button>
          ))}
        </div>

        {filas.map((fila, indiceFila) => (
          <div key={indiceFila} className="flex gap-1.5 justify-center">
            {indiceFila === 2 && !modoSimbolos && (
              <button
                type="button"
                onClick={() => setMayusculas((prev) => !prev)}
                className={`flex-[1.5] rounded-lg py-3 flex items-center justify-center ${mayusculas ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                <ArrowBigUp size={18} />
              </button>
            )}
            {fila.map((letra) => (
              <button
                key={letra}
                type="button"
                onClick={() => tecla(letra)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 active:bg-orange-500/30 text-white rounded-lg py-3 text-sm font-medium"
              >
                {mayusculas && !modoSimbolos ? letra.toUpperCase() : letra}
              </button>
            ))}
            {indiceFila === 2 && (
              <button
                type="button"
                onClick={borrar}
                className="flex-[1.5] bg-gray-800 hover:bg-gray-700 active:bg-red-500/30 text-white rounded-lg py-3 flex items-center justify-center"
              >
                <Delete size={18} />
              </button>
            )}
          </div>
        ))}

        <div className="flex gap-1.5 justify-center">
          <button
            type="button"
            onClick={() => setModoSimbolos((prev) => !prev)}
            className="flex-[1.5] bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 text-xs font-semibold"
          >
            {modoSimbolos ? 'ABC' : '?123'}
          </button>
          <button
            type="button"
            onClick={() => insertar('.')}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 text-sm font-medium"
          >
            .
          </button>
          <button
            type="button"
            onClick={() => insertar(' ')}
            className="flex-[4] bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 text-xs"
          >
            espacio
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-[2] bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-3 text-xs font-semibold"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
