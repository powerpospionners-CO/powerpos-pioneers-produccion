const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'powerpospioneers.com';

// Al cerrar sesión desde el subdominio de una empresa (ej.
// trailer-del-sabor.powerpospioneers.com), no debe quedar ahí mostrando el
// login de esa empresa — vuelve al login genérico en app.tudominio.com.
// En desarrollo/preview (localhost, *.vercel.app) no hay nada que cambiar.
export function urlLoginGenerico(): string {
  if (typeof window === 'undefined') return '/login';
  const host = window.location.hostname;
  const enDominioReal = host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`);
  if (enDominioReal && host !== `app.${ROOT_DOMAIN}`) {
    return `https://app.${ROOT_DOMAIN}/login`;
  }
  return '/login';
}

export function irALoginGenerico(router: { push: (ruta: string) => void }) {
  const destino = urlLoginGenerico();
  if (destino.startsWith('http')) {
    window.location.href = destino;
  } else {
    router.push(destino);
  }
}
