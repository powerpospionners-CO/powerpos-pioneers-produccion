import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CLAVE_ACTIVIDAD, registrarActividad } from '@/lib/sesion-inactiva';

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  empresa: string;
  empresaId?: number;
  sucursalId?: number;
  plan?: string;
  tipoNegocio?: 'RESTAURANTE' | 'SUPERMERCADO' | 'TIENDA' | 'COMERCIO';
  permisos?: Record<string, boolean>;
  permisosUsuario?: Record<string, boolean | { ver: boolean; editar: boolean }>;
  modoPreparacion?: 'KDS' | 'COMANDAS';
  facturacionElectronicaHabilitada?: boolean;
  consumoEmpleadosHabilitado?: boolean;
  catalogoHabilitado?: boolean;
  tiendaSlug?: string;
  distribuidorId?: number;
  distribuidorCodigo?: string;
  distribuidorComision?: number;
}

interface AuthStore {
  token: string | null;
  usuario: Usuario | null;
  inicioSesion: string | null;
  hydrated: boolean;
  setAuth: (token: string, usuario: Usuario) => void;
  setTipoNegocio: (tipo: Usuario['tipoNegocio']) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      usuario: null,
      inicioSesion: null,
      hydrated: false,
      setAuth: (token, usuario) => {
        const inicioSesion = new Date().toISOString();
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('token', token);
          registrarActividad(window.localStorage, inicioSesion);
        }
        set({ token, usuario, inicioSesion });
      },
      setTipoNegocio: (tipoNegocio) => set((state) => ({ usuario: state.usuario ? { ...state.usuario, tipoNegocio } : null })),
      logout: () => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('token');
          window.localStorage.removeItem(CLAVE_ACTIVIDAD);
          window.localStorage.removeItem('usuario');
        }
        set({ token: null, usuario: null, inicioSesion: null });
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        // El cierre de sesión diario es una medida de seguridad, no debe
        // dejar al cajero sin poder entrar durante un corte de internet
        // largo (ej. un apagón de días) solo porque no puede volver a
        // loguearse. Si no hay conexión, se mantiene la sesión como estaba.
        const diaDistinto = state?.inicioSesion && new Date(state.inicioSesion).toDateString() !== new Date().toDateString();
        const enLinea = typeof navigator === 'undefined' || navigator.onLine;
        if (diaDistinto && enLinea) {
          state!.logout();
        }
        state?.setHydrated();
      },
    }
  )
);
