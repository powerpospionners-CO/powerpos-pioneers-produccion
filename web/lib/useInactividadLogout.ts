'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { irALoginGenerico } from '@/lib/navegacion';
import { CLAVE_ACTIVIDAD, registrarActividad, sesionInactiva, ultimaActividad } from './sesion-inactiva';
const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
export function useInactividadLogout() {
  const router = useRouter();
  const { token, inicioSesion, hydrated, logout } = useAuthStore();
  useEffect(() => {
    if (!hydrated || !token || !inicioSesion) return;
    let cerrado = false;
    const comprobar = () => {
      if (cerrado) return false;
      if (localStorage.getItem('token') !== token || sesionInactiva(localStorage, inicioSesion)) {
        cerrado = true;
        logout();
        irALoginGenerico(router);
        return false;
      }
      return true;
    };
    const actividad = (evento: Event) => {
      // Un toque al volver de suspensión nunca revive una sesión vencida.
      if (!evento.isTrusted || document.visibilityState !== 'visible' || !comprobar()) return;
      if (Date.now() - ultimaActividad(localStorage, inicioSesion) > 1000) registrarActividad(localStorage, inicioSesion);
    };
    const cambioAlmacen = (evento: StorageEvent) => {
      if (evento.key === CLAVE_ACTIVIDAD || evento.key === 'token' || evento.key === 'auth-storage') comprobar();
    };
    comprobar();
    const revision = window.setInterval(comprobar, 1000);
    EVENTOS_ACTIVIDAD.forEach(evento => window.addEventListener(evento, actividad, { passive: true, capture: true }));
    window.addEventListener('focus', comprobar);
    window.addEventListener('pageshow', comprobar);
    document.addEventListener('visibilitychange', comprobar);
    window.addEventListener('storage', cambioAlmacen);
    return () => {
      clearInterval(revision);
      EVENTOS_ACTIVIDAD.forEach(evento => window.removeEventListener(evento, actividad, { capture: true }));
      window.removeEventListener('focus', comprobar);
      window.removeEventListener('pageshow', comprobar);
      document.removeEventListener('visibilitychange', comprobar);
      window.removeEventListener('storage', cambioAlmacen);
    };
  }, [hydrated, token, inicioSesion, logout, router]);
}
