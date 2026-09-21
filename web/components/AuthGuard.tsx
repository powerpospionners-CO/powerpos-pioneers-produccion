'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { irALoginGenerico } from '@/lib/navegacion';
import { useVersionCheck } from '@/lib/useVersionCheck';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, usuario, hydrated, inicioSesion, logout } = useAuthStore();
  useVersionCheck();

  useEffect(() => {
    if (!hydrated) return;
    if (inicioSesion && new Date(inicioSesion).toDateString() !== new Date().toDateString()) {
      logout();
      irALoginGenerico(router);
      return;
    }
    if (!token || !usuario) {
      irALoginGenerico(router);
    }
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

  return <>{children}</>;
}