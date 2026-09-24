import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  modoPreparacion?: 'KDS' | 'COMANDAS';
  facturacionElectronicaHabilitada?: boolean;
  consumoEmpleadosHabilitado?: boolean;
  catalogoHabilitado?: boolean;
  tiendaSlug?: string;
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
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('token', token);
        }
        set({ token, usuario, inicioSesion: new Date().toISOString() });
      },
      setTipoNegocio: (tipoNegocio) => set((state) => ({ usuario: state.usuario ? { ...state.usuario, tipoNegocio } : null })),
      logout: () => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('token');
        }
        set({ token: null, usuario: null, inicioSesion: null });
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        if (state?.inicioSesion && new Date(state.inicioSesion).toDateString() !== new Date().toDateString()) {
          state.logout();
        }
        state?.setHydrated();
      },
    }
  )
);
