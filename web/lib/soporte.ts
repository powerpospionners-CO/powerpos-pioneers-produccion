import { useAuthStore } from '@/store/authStore';

// Al entrar en modo soporte se guarda la sesión del superadministrador en esta pestaña para volver a ella al salir.
const CLAVE = 'powerpos-soporte-origen';

export function guardarOrigen() {
  const { token, usuario } = useAuthStore.getState();
  if (token && usuario?.rol === 'SUPERADMIN') window.sessionStorage.setItem(CLAVE, JSON.stringify({ token, usuario }));
}

// Vuelve a la sesión del superadministrador; si no hay, cierra la sesión de soporte.
export function salirDeSoporte() {
  let origen: { token?: string; usuario?: any } | null = null;
  try {
    origen = JSON.parse(window.sessionStorage.getItem(CLAVE) || 'null');
  } catch {
    origen = null;
  }
  window.sessionStorage.removeItem(CLAVE);
  if (origen?.token && origen.usuario?.rol === 'SUPERADMIN') {
    useAuthStore.getState().setAuth(origen.token, origen.usuario);
    window.location.href = '/superadmin';
    return true;
  }
  useAuthStore.getState().logout();
  window.location.href = '/login';
  return false;
}
