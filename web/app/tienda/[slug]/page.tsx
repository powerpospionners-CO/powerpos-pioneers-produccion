import type { Metadata } from "next";
import { jsonSeguro } from "../../../lib/seoTienda";
import { urlPublicaTienda } from "../../../lib/urlPublicaTienda";

import { cargarTiendaPublica as cargar } from "../../../lib/cargarTiendaPublica";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tienda = await cargar(slug);
  const titulo = `${tienda.nombre} · Tienda en línea`;
  const descripcion = (
    tienda.config.descripcion ||
    `Descubre el catálogo de ${tienda.nombre}. Consulta productos, precios y contacto con el negocio.`
  ).slice(0, 160);
  const url = await urlPublicaTienda(slug);
  return {
    title: { absolute: titulo },
    applicationName: tienda.nombre,
    manifest: null,
    appleWebApp: { title: tienda.nombre, capable: false },
    icons: {
      icon: tienda.logo || "/icons/tienda.svg",
      apple: tienda.logo || "/icons/tienda.svg",
    },
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
  const url = await urlPublicaTienda(slug);
  const sitio = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: tienda.nombre,
    url,
  };
  const datos = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: tienda.nombre,
    url,
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
        dangerouslySetInnerHTML={{ __html: jsonSeguro(sitio) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonSeguro(datos) }}
      />
    </>
  );
}
