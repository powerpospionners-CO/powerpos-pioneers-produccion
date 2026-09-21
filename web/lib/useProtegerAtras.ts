'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { urlLoginGenerico } from '@/lib/navegacion';

// Evita que, tras cerrar sesión, la flecha "atrás" del navegador vuelva a
// mostrar una pantalla del sistema desde una copia congelada en memoria
// (bfcache) o desde el caché de navegación del propio Next.js. En vez de
// confiar en lo que ya quedó pintado en pantalla, revisa el estado real de
// la sesión cada vez que la página vuelve a mostrarse o cambia el historial.
export function useProtegerAtras() {
  useEffect(() => {
    const sesionValida = () => {
      const { token, usuario } = useAuthStore.getState();
      return !!token && !!usuario;
    };

    const onPageShow = (evento: PageTransitionEvent) => {
      if (evento.persisted && !sesionValida()) {
        window.location.replace(urlLoginGenerico());
      }
    };
    const onPopState = () => {
      if (!sesionValida()) {
        window.location.replace(urlLoginGenerico());
      }
    };

    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);
}
