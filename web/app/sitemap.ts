import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { slugDelHost, slugPublico, urlTienda } from "../lib/seoTienda";
import { seccionesTienda, urlCategoriaTienda, urlSeccionTienda } from "../lib/seccionesTienda";
import { urlPublicaTienda } from "../lib/urlPublicaTienda";
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
    const tienda = await r.json();
    const productos: { id: number; categoriaId?: number }[] =
      tienda.productos || [];
    const categorias = [
      ...new Set(productos.map((p) => p.categoriaId).filter(Boolean)),
    ] as number[];
    return [
      ...seccionesTienda.map((seccion) => ({
        url: urlSeccionTienda(urlTienda(slug), seccion),
        changeFrequency: "daily" as const,
        priority: seccion === "inicio" ? 1 : 0.8,
      })),
      ...productos.map((p) => ({
        url: urlSeccionTienda(urlTienda(slug), "productos") + "/" + p.id,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
      ...categorias.map((id) => ({
        url: urlCategoriaTienda(urlTienda(slug), id),
        changeFrequency: "daily" as const,
        priority: 0.75,
      })),
    ];
  }
  const r = await fetch(`${base}/tiendas/mapa`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("No se pudo consultar el mapa de tiendas");
  const tiendas: { slug: string }[] = await r.json();
  const mapas = await Promise.all(
    tiendas
      .filter((t) => slugPublico(t.slug))
      .map(async (t) => {
        const url = await urlPublicaTienda(t.slug);
        return seccionesTienda.map((seccion) => ({
          url: urlSeccionTienda(url, seccion),
          changeFrequency: "daily" as const,
          priority: seccion === "inicio" ? 1 : 0.8,
        }));
      }),
  );
  return mapas.flat();
}
