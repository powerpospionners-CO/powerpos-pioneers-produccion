'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { irALoginGenerico } from '@/lib/navegacion';
import { useVersionCheck } from '@/lib/useVersionCheck';
import { useInactividadLogout } from '@/lib/useInactividadLogout';
import { useProtegerAtras } from '@/lib/useProtegerAtras';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, usuario, hydrated, inicioSesion, logout } = useAuthStore();
  const [mantenimiento, setMantenimiento] = useState('');
  useEffect(() => {
    const actualizar = (event: Event) => setMantenimiento(String((event as CustomEvent).detail || ''));
    window.addEventListener('powerpos:mantenimiento', actualizar);
    return () => window.removeEventListener('powerpos:mantenimiento', actualizar);
  }, []);
  useVersionCheck();
  useInactividadLogout();
  useProtegerAtras();

  useEffect(() => {
    const verificar = () => {
      if (!hydrated) return;
      // Igual que en el store: no forzar el logout diario mientras no hay
      // conexión para volver a loguearse (corte de internet largo).
      if (inicioSesion && new Date(inicioSesion).toDateString() !== new Date().toDateString() && navigator.onLine) {
        logout();
        irALoginGenerico(router);
        return;
      }
      if (!token || !usuario) {
        irALoginGenerico(router);
      }
    };
    verificar();
    window.addEventListener('online', verificar);
    return () => window.removeEventListener('online', verificar);
  }, [hydrated, token, usuario, inicioSesion, logout, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-orange-500 text-xl font-bold animate-pulse">
          Power<span className="text-white">POS</span>
        </div>
      </div>
    );
  }

  if (!token || !usuario) return null;

  return <>{mantenimiento && <div role="alert" className="sticky top-0 z-[100] border-b border-amber-600 bg-amber-950 px-4 py-3 text-center text-sm text-amber-100">{mantenimiento}</div>}{children}</>;
}
