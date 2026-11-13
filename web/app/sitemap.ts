import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { slugDelHost, slugPublico, urlTienda } from "../lib/seoTienda";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slug = slugDelHost((await headers()).get("host") || "");
  const base =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";
  if (slug) {
    const r = await fetch(`${base}/tiendas/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error("No se pudo consultar el mapa de la tienda");
    return [{ url: urlTienda(slug), changeFrequency: "daily", priority: 1 }];
  }
  const r = await fetch(`${base}/tiendas/mapa`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("No se pudo consultar el mapa de tiendas");
  const tiendas: { slug: string }[] = await r.json();
  return tiendas
    .filter((t) => slugPublico(t.slug))
    .map((t) => ({
      url: urlTienda(t.slug),
      changeFrequency: "daily",
      priority: 1,
    }));
}
