'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AnunciosCarrusel, { type Anuncio } from '@/components/AnunciosCarrusel';

interface EstadoLlamado {
  empresa: string;
  pedido: string | null;
  clienteNombre: string | null;
  mensaje: string | null;
  logoUrl: string | null;
  estado: 'LISTO' | 'ENTREGADO' | null;
}

const estadoInicial: EstadoLlamado = {
  empresa: 'PowerPOS',
  pedido: null,
  clienteNombre: null,
  mensaje: null,
  logoUrl: null,
  estado: null,
};

export default function PantallaLlamadoPage() {
  const [estado, setEstado] = useState<EstadoLlamado>(estadoInicial);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);

  useEffect(() => {
    const cargarAnuncios = () => {
      api.get('/empresa').then(({ data }) => {
        if (Array.isArray(data.anunciosPantalla)) setAnuncios(data.anunciosPantalla);
      }).catch(() => {});
    };
    cargarAnuncios();
    const timer = setInterval(cargarAnuncios, 5 * 60000);
    return () => clearInterval(timer);
  }, []);

  const aplicarPayload = (payload: Partial<EstadoLlamado> = {}) => {
    setEstado((prev) => ({
      ...estadoInicial,
      empresa: payload.empresa || prev.empresa || 'PowerPOS',
      logoUrl: payload.logoUrl || prev.logoUrl || null,
      estado: payload.estado || null,
      pedido: payload.estado === 'ENTREGADO' ? null : payload.pedido || null,
      clienteNombre: payload.estado === 'ENTREGADO' ? null : payload.clienteNombre || null,
      mensaje: payload.estado === 'ENTREGADO' ? null : payload.mensaje || null,
    }));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ultimo = window.localStorage.getItem('powerpos-llamado-cliente-event');
      if (ultimo) {
        try {
          const payload = JSON.parse(ultimo) as Partial<EstadoLlamado>;
          aplicarPayload(payload);
        } catch {
          // ignorar payload inválido
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const ultimo = window.localStorage.getItem('powerpos-llamado-cliente-event');
        if (ultimo) {
          const payload = JSON.parse(ultimo) as Partial<EstadoLlamado>;
          aplicarPayload(payload);
        }
      } catch {
        // ignorar payload inválido
      }
    }

    const canal = new BroadcastChannel('powerpos-llamado-cliente');
    canal.onmessage = (evento) => aplicarPayload(evento.data || {});

    const manejarStorage = (event: StorageEvent) => {
      if (event.key !== 'powerpos-llamado-cliente-event' || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as Partial<EstadoLlamado>;
        aplicarPayload(payload);
      } catch {
        // ignorar payload inválido
      }
    };

    const manejarEventoLocal = (event: Event) => {
      const custom = event as CustomEvent<Partial<EstadoLlamado>>;
      if (!custom.detail) return;
      aplicarPayload(custom.detail);
    };

    window.addEventListener('storage', manejarStorage);
    window.addEventListener('powerpos-llamado-cliente-event', manejarEventoLocal);
    return () => {
      canal.close();
      window.removeEventListener('storage', manejarStorage);
      window.removeEventListener('powerpos-llamado-cliente-event', manejarEventoLocal);
    };
  }, []);

  useEffect(() => {
    if (estado.estado === 'ENTREGADO') {
      window.speechSynthesis.cancel();
      return;
    }
    if (!estado.pedido || !estado.clienteNombre) return;

    const texto = `Pedido ${estado.pedido} listo para ${estado.clienteNombre}.`;
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-CO';
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [estado.estado, estado.pedido, estado.clienteNombre]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white flex items-center justify-center p-8">
      <div className="w-full max-w-6xl text-center">
        <div className="mb-6 flex items-center justify-center gap-4">
          {estado.logoUrl ? (
            <img src={estado.logoUrl} alt={estado.empresa} className="h-20 w-20 object-cover rounded-2xl border border-white/10 bg-white/10 shadow-lg" />
          ) : (
            <div className="h-20 w-20 rounded-2xl border border-orange-500/40 bg-orange-500/10 flex items-center justify-center text-2xl font-black text-orange-300">
              {estado.empresa?.slice(0, 2).toUpperCase() || 'P'}
            </div>
          )}
          <div className="text-orange-400 text-xl font-bold tracking-[0.35em] uppercase">
            {estado.empresa}
          </div>
        </div>

        <div className={`rounded-[32px] border border-white/10 bg-white/5 backdrop-blur-sm shadow-2xl shadow-orange-950/30 min-h-[420px] flex items-center justify-center overflow-hidden ${estado.estado === null && anuncios.length > 0 ? '' : 'p-10 md:p-16'}`}>
          {estado.estado === 'LISTO' && estado.clienteNombre && estado.pedido ? (
            <>
              <div className="text-center">
                <div className="text-xl md:text-2xl uppercase tracking-[0.3em] text-orange-300 mb-6">
                  Pedido listo
                </div>
                <div className="text-5xl md:text-7xl font-black tracking-tight text-white mb-4">
                  {estado.clienteNombre}
                </div>
                <div className="text-2xl md:text-4xl text-slate-200 mb-10">
                  Pedido <span className="text-orange-400 font-bold">#{estado.pedido}</span>
                </div>
                <div className="inline-flex items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10 px-8 py-4 text-xl md:text-2xl font-semibold text-orange-100">
                  Por favor acercarse a la barra
                </div>
              </div>
            </>
          ) : estado.estado === 'ENTREGADO' ? (
            <div className="h-40 w-40 rounded-full border border-white/10 bg-white/5 flex items-center justify-center opacity-60">
              <div className="text-5xl">✓</div>
            </div>
          ) : anuncios.length > 0 ? (
            <div className="w-full h-full min-h-[420px]">
              <AnunciosCarrusel anuncios={anuncios} />
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl md:text-6xl font-black text-white mb-6">
                Esperando pedido
              </div>
              <div className="text-xl md:text-2xl text-slate-300">
                Cuando un cliente tenga su pedido listo, aparecerá aquí.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
