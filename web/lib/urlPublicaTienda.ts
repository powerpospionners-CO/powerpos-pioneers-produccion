import 'server-only';
import { dominioTiendas, urlTienda } from './seoTienda';
const cache = new Map<string, { vence: number; url: Promise<string> }>();
export function urlPublicaTienda(slug: string): Promise<string> {
  const candidata = urlTienda(slug);
  const anterior = cache.get(slug);
  if (anterior && anterior.vence > Date.now()) return anterior.url;
  const url = (async () => {
    try {
      // Consultar un recurso interno fijo, no la página de la tienda: evita recursión de SSR.
      const r = await fetch(`${candidata}api/version`, { cache: 'no-store', signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (r.ok && typeof (await r.json()).version === 'string') return candidata;
    } catch { /* Un dominio aún no conectado conserva el enlace público del sistema. */ }
    return `https://app.${dominioTiendas}/tienda/${encodeURIComponent(slug)}`;
  })();
  if (cache.size >= 512) { for (const clave of cache.keys()) { cache.delete(clave); break; } }
  cache.set(slug, { vence: Date.now() + 60000, url });
  return url;
}
