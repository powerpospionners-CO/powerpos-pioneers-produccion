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
  (response) => response,
  (error) => {
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
