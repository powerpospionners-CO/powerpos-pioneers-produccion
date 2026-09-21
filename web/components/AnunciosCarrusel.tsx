'use client';
import { useEffect, useState } from 'react';

export interface Anuncio {
  imagen: string;
  titulo?: string;
  texto?: string;
}

export default function AnunciosCarrusel({ anuncios, intervaloMs = 7000 }: { anuncios: Anuncio[]; intervaloMs?: number }) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    setIndice(0);
  }, [anuncios.length]);

  useEffect(() => {
    if (anuncios.length < 2) return;
    const timer = setInterval(() => setIndice((i) => (i + 1) % anuncios.length), intervaloMs);
    return () => clearInterval(timer);
  }, [anuncios.length, intervaloMs]);

  if (anuncios.length === 0) return null;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-[inherit]">
      {anuncios.map((anuncio, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
          style={{ opacity: i === indice ? 1 : 0 }}
        >
          <img src={anuncio.imagen} alt={anuncio.titulo || 'Anuncio'} className="w-full h-full object-cover" />
          {(anuncio.titulo || anuncio.texto) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-8 pt-20">
              {anuncio.titulo && <p className="text-3xl md:text-4xl font-black text-white">{anuncio.titulo}</p>}
              {anuncio.texto && <p className="text-lg md:text-xl text-white/85 mt-2">{anuncio.texto}</p>}
            </div>
          )}
        </div>
      ))}
      {anuncios.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {anuncios.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === indice ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
