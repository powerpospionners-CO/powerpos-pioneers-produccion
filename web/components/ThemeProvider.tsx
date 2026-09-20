'use client';

import { useEffect, useState } from 'react';

export type Tema = 'oscuro' | 'claro';

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema;
  window.localStorage.setItem('powerpos-tema', tema);
  window.dispatchEvent(new CustomEvent('powerpos-tema', { detail: tema }));
}

export function useTema() {
  const [tema, setTema] = useState<Tema>('oscuro');
  useEffect(() => {
    const guardado = window.localStorage.getItem('powerpos-tema');
    const inicial = guardado === 'claro' ? 'claro' : 'oscuro';
    document.documentElement.dataset.theme = inicial;
    setTema(inicial);
    const sincronizar = (event: Event) => setTema((event as CustomEvent<Tema>).detail);
    window.addEventListener('powerpos-tema', sincronizar);
    return () => window.removeEventListener('powerpos-tema', sincronizar);
  }, []);
  return { tema, cambiarTema: () => aplicarTema(tema === 'oscuro' ? 'claro' : 'oscuro') };
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useTema();
  return <>{children}</>;
}
