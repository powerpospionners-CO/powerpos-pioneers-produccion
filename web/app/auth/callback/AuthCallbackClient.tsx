'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function AuthCallbackClient() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const datosUsuario = params.get('u');
    const siguiente = params.get('next') || '/dashboard';

    if (!token || !datosUsuario) {
      router.replace('/login');
      return;
    }

    try {
      const usuario = JSON.parse(atob(decodeURIComponent(datosUsuario)));
      setAuth(token, usuario);
      router.replace(siguiente);
    } catch {
      router.replace('/login');
    }
  }, [router, setAuth]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-orange-500 text-xl font-bold animate-pulse">
        Power<span className="text-white">POS</span>
      </div>
    </div>
  );
}
