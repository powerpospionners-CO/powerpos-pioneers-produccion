import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { sesionInactiva } from './sesion-inactiva';
import { rutaImpresionEscritorio } from './escritorio';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('token');
    const sesion = useAuthStore.getState();
    if (token && sesion.hydrated && sesion.inicioSesion && (sesion.token !== token || sesionInactiva(window.localStorage, sesion.inicioSesion))) {
      sesion.logout();
      window.location.replace('/login');
      throw new axios.CanceledError('Sesión cerrada por inactividad');
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      const escritorio = window.powerposDesktop;
      if (escritorio && config.method?.toLowerCase() === 'post' && rutaImpresionEscritorio(config.url || '')) {
        config.adapter = async (peticion) => {
          const datos = typeof peticion.data === 'string' ? JSON.parse(peticion.data) : (peticion.data || {});
          const r = await escritorio.imprimir({ ruta: peticion.url!, token, datos });
          const respuesta = { data: r.data, status: r.status, statusText: String(r.status), headers: {}, config: peticion };
          if (r.status >= 400) throw new axios.AxiosError(r.data?.message || 'No se pudo completar la solicitud', undefined, peticion, undefined, respuesta);
          return respuesta;
        };
      }
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('powerpos:mantenimiento', { detail: '' }));
    return response;
  },
  (error) => {
    if (error.response?.status === 503 && typeof window !== 'undefined' && String(error.response?.data?.message || '').startsWith('Estamos verificando las bases de datos')) {
      window.dispatchEvent(new CustomEvent('powerpos:mantenimiento', { detail: 'Mantenimiento temporal: estamos verificando las bases de datos. Espera para reintentar tu operación.' }));
    }
    if (
      error.response?.status === 403 &&
      error.response?.data?.error === 'SUBSCRIPTION_EXPIRED' &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/suscripcion'
    ) {
      window.location.href = '/suscripcion';
    }
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
