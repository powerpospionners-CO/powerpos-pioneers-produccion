'use client';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useAuthStore } from '@/store/authStore';
import { crearBorradorVenta } from './borradorVenta';

export function useBorradorVenta<T extends object>(tipo: string, inicial: T) {
  const usuario = useAuthStore(s => s.usuario);
  const base = useRef(inicial).current;
  const clave = `powerpos:venta-actual:v1:${usuario?.empresaId}:${usuario?.sucursalId}:${usuario?.id}:${tipo}`;
  const almacen = useMemo(() => {
    let storage: Storage | null = null;
    try { if (typeof window !== 'undefined' && usuario?.id) storage = window.localStorage; } catch { /* Se informa en el primer cambio. */ }
    return crearBorradorVenta(storage, clave, base);
  }, [clave, base, usuario?.id]);
  const servidor = useMemo(() => ({ datos: base, error: '', recuperado: false }), [base]);
  const snapshot = useSyncExternalStore(almacen.subscribe, almacen.getSnapshot, () => servidor);
  useEffect(() => {
    const proteger = (evento: Event) => {
      const actual = almacen.getSnapshot();
      if (actual.error || ('intento' in actual.datos && actual.datos.intento)) evento.preventDefault();
    };
    const antesDeSalir = (evento: BeforeUnloadEvent) => {
      if (almacen.getSnapshot().error) { evento.preventDefault(); evento.returnValue = ''; }
    };
    window.addEventListener('powerpos:antes-actualizar', proteger);
    window.addEventListener('beforeunload', antesDeSalir);
    return () => { window.removeEventListener('powerpos:antes-actualizar', proteger); window.removeEventListener('beforeunload', antesDeSalir); };
  }, [almacen]);
  return { ...snapshot, almacen };
}

export function useCampoBorrador<T extends object, K extends keyof T>(borrador: ReturnType<typeof useBorradorVenta<T>>, campo: K) {
  const set = useCallback((valor: T[K] | ((anterior: T[K]) => T[K])) => borrador.almacen.set(campo, valor), [borrador.almacen, campo]);
  return [borrador.datos[campo], set] as const;
}
