import AuthCallbackClient from './AuthCallbackClient';

// Recibe la sesión cuando el login (genérico, en app.tudominio.com u otro
// subdominio) redirige a la empresa a su propio subdominio de marca.
// El token viaja una sola vez por la URL y se limpia de inmediato.
//
// Esta página NUNCA debe quedar en caché: cada visita trae un token distinto
// (uno por cada inicio de sesión). `force-dynamic` no bastaba porque el
// contenido es 100% de cliente (sin datos de servidor), así que Next.js la
// seguía generando como página estática; leer `searchParams` aquí obliga a
// que cada visita se resuelva en el servidor, sin caché.
export const dynamic = 'force-dynamic';

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;
  return <AuthCallbackClient />;
}
