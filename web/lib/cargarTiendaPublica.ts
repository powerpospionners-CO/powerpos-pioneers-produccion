import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { TiendaPublica } from "./tiendaPublica";
import { cargarCatalogo } from "./cargarCatalogo";
import { slugPublico } from "./seoTienda";
export const cargarTiendaPublica = cache(
  async (slug: string): Promise<TiendaPublica> => {
    if (!slugPublico(slug)) notFound();
    const base =
      process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3000";
    const r = await cargarCatalogo(`${base}/tiendas/${encodeURIComponent(slug)}`);
    if (r.status === 404) notFound();
    if (!r.ok) throw new Error("No fue posible cargar la tienda");
    return r.json();
  },
);
