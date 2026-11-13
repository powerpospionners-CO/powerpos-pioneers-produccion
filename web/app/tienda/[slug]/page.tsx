import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import TiendaCliente from "./TiendaCliente";
import type { TiendaPublica } from "../../../lib/tiendaPublica";
import { jsonSeguro, slugPublico, urlTienda } from "../../../lib/seoTienda";

export const dynamic = "force-dynamic";
const cargar = cache(async (slug: string): Promise<TiendaPublica> => {
  if (!slugPublico(slug)) notFound();
  const base =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";
  const r = await fetch(`${base}/tiendas/${encodeURIComponent(slug)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 404) notFound();
  if (!r.ok) throw new Error("No fue posible cargar la tienda");
  return r.json();
});
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tienda = await cargar(slug);
  const titulo = `${tienda.nombre} · Tienda en línea`;
  const descripcion = (
    tienda.config.descripcion ||
    `Descubre el catálogo de ${tienda.nombre}. Consulta productos, precios y contacto con el negocio.`
  ).slice(0, 160);
  const url = urlTienda(slug);
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: titulo,
      description: descripcion,
      url,
      siteName: tienda.nombre,
      locale: "es_CO",
      type: "website",
      ...(tienda.logo ? { images: [tienda.logo] } : {}),
    },
  };
}
export default async function TiendaPage({ params }: Props) {
  const { slug } = await params;
  const tienda = await cargar(slug);
  const datos = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: tienda.nombre,
    url: urlTienda(slug),
    ...(tienda.logo ? { image: tienda.logo } : {}),
    ...(tienda.config.descripcion
      ? { description: tienda.config.descripcion }
      : {}),
    ...(tienda.telefono ? { telephone: tienda.telefono } : {}),
    ...(tienda.direccion
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: tienda.direccion,
          },
        }
      : {}),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonSeguro(datos) }}
      />
      <TiendaCliente key={slug} slug={slug} inicial={tienda} />
    </>
  );
}
