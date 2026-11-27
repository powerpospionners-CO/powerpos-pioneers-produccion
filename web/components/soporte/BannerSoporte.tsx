'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { salirDeSoporte } from '@/lib/soporte';

// Franja fija mientras el superadministrador revisa una empresa en modo soporte.
export default function BannerSoporte() {
  const usuario = useAuthStore((s) => s.usuario) as any;
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!usuario?.soporte) return;
    const t = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(t);
  }, [usuario?.soporte]);
  if (!usuario?.soporte) return null;
  const restan = Math.max(0, Math.ceil((new Date(usuario.soporteVence).getTime() - ahora) / 60000));
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-sky-800 px-4 py-2 text-sm text-white">
      <span><strong>Modo soporte · solo lectura</strong> · {usuario.empresa} · {usuario.sucursal} · {restan > 0 ? `vence en ${restan} min` : 'vencido'}</span>
      <button type="button" onClick={() => salirDeSoporte()} className="rounded-lg bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">Salir del modo soporte</button>
    </div>
  );
}
