'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { empresaConTeclado } from './edicionTeclado';

export function useTecladoTactilEmpresa() {
  const empresaId = useAuthStore(s => s.usuario?.empresaId);
  const hydrated = useAuthStore(s => s.hydrated);
  const [habilitado, setHabilitado] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const clave = 'powerpos:teclado-trailer';
    if (empresaId != null) {
      const activa = empresaConTeclado(empresaId);
      setHabilitado(activa);
      try { if (activa) localStorage.setItem(clave, '1'); else localStorage.removeItem(clave); } catch { /* La preferencia no impide escribir. */ }
    } else {
      let recordado = false;
      try { recordado = localStorage.getItem(clave) === '1'; } catch { /* Puede usarse el dominio de la empresa. */ }
      setHabilitado(location.hostname === 'trailerdelsabor.powerpospioneers.com' || recordado);
    }
  }, [empresaId, hydrated]);
  // Una sesión de otra empresa siempre prevalece sobre la preferencia del equipo.
  return empresaId != null ? hydrated && empresaConTeclado(empresaId) : habilitado;
}
