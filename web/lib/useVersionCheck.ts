'use client';
import { useEffect, useRef } from 'react';

// Revisa cada cierto tiempo (y al volver a la pestaña) si Vercel publicó una
// versión nueva del sistema. Si la hay, y la persona no está escribiendo en
// un campo en ese momento, recarga la página sola para que no tenga que
// refrescar manualmente para ver los cambios.
export function useVersionCheck() {
  const versionInicial = useRef<string | null>(null);

  useEffect(() => {
    const revisarYRecargar = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await r.json();
        if (!versionInicial.current) {
          versionInicial.current = version;
          return;
        }
        if (version === versionInicial.current) return;

        const activo = document.activeElement;
        const escribiendo = !!activo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activo.tagName);
        if (document.visibilityState === 'visible' && !escribiendo) {
          window.location.reload();
        }
      } catch {
        // sin conexión momentánea: se reintenta en el próximo ciclo
      }
    };

    void revisarYRecargar();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revisarYRecargar();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(revisarYRecargar, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
}
