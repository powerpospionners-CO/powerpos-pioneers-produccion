'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { irALoginGenerico } from '@/lib/navegacion';

const MINUTOS_INACTIVIDAD = 20;
const EVENTOS_ACTIVIDAD = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

// Si nadie toca el sistema (mouse, teclado, pantalla táctil) durante
// MINUTOS_INACTIVIDAD, cierra la sesión sola — pensado para el kiosco/POS
// que puede quedar desatendido en el mostrador.
export function useInactividadLogout() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cerrarPorInactividad = () => {
      logout();
      irALoginGenerico(router);
    };
    const reiniciarTemporizador = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(cerrarPorInactividad, MINUTOS_INACTIVIDAD * 60 * 1000);
    };

    EVENTOS_ACTIVIDAD.forEach((evento) => window.addEventListener(evento, reiniciarTemporizador, { passive: true }));
    reiniciarTemporizador();

    return () => {
      EVENTOS_ACTIVIDAD.forEach((evento) => window.removeEventListener(evento, reiniciarTemporizador));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [logout, router]);
}
