'use client';

import { useEffect } from 'react';

// Registra el service worker que permite instalar PowerPOS como app y
// cachear los archivos estáticos para que abra rápido y siga funcionando
// (la interfaz, no las llamadas a la API) sin conexión.
export default function RegistroServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
