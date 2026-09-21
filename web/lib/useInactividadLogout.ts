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
  // Referencias para que el efecto de abajo se arme una sola vez al montar
  // y nunca se reinicie por un re-render de este hook (solo por actividad
  // real de la persona, que es lo único que debe reiniciar el conteo).
  const routerRef = useRef(router);
  const logoutRef = useRef(logout);
  routerRef.current = router;
  logoutRef.current = logout;

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout>;
    const cerrarPorInactividad = () => {
      logoutRef.current();
      irALoginGenerico(routerRef.current);
    };
    const reiniciarTemporizador = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(cerrarPorInactividad, MINUTOS_INACTIVIDAD * 60 * 1000);
    };

    EVENTOS_ACTIVIDAD.forEach((evento) => window.addEventListener(evento, reiniciarTemporizador, { passive: true }));
    reiniciarTemporizador();

    return () => {
      EVENTOS_ACTIVIDAD.forEach((evento) => window.removeEventListener(evento, reiniciarTemporizador));
      clearTimeout(temporizador);
    };
  }, []);
}
