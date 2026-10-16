import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
