import { NextRequest, NextResponse } from 'next/server';

// Dominio raíz del producto (sin protocolo, sin "www"). Configúralo en Vercel
// con NEXT_PUBLIC_ROOT_DOMAIN cuando conectes el dominio final.
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'powerpospioneers.com').toLowerCase();

// Subdominios reservados: nunca se tratan como el slug de una tienda.
// "app" es donde vive el panel administrativo (login, POS, dashboard, etc.).
const SUBDOMINIOS_RESERVADOS = new Set(['app', 'www', 'api']);

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];

  // Vercel preview deployments (*.vercel.app), localhost, IPs, etc.: sin reescritura.
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) {
    return NextResponse.next();
  }

  const subdominio = host.slice(0, -(`.${ROOT_DOMAIN}`.length));

  // Subdominio con más de un nivel (ej. algo.malo.powerpospioneers.com) o reservado: sin reescritura.
  if (!subdominio || subdominio.includes('.') || SUBDOMINIOS_RESERVADOS.has(subdominio)) {
    return NextResponse.next();
  }

  // Cualquier otro subdominio se trata como el slug de la tienda pública de una empresa.
  const nuevaUrl = url.clone();
  nuevaUrl.pathname = `/tienda/${subdominio}${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(nuevaUrl);
}

export const config = {
  // No interceptar assets estáticos, la API interna de Next ni archivos con extensión.
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
