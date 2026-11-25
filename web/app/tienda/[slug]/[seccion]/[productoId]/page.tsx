import type { Metadata } from "next";
import {generateMetadata as metadataInicio} from "../../page";
import { jsonSeguro } from "../../../../../lib/seoTienda";
import { notFound } from "next/navigation";
import { cargarTiendaPublica } from "../../../../../lib/cargarTiendaPublica";
import { urlPublicaTienda } from "../../../../../lib/urlPublicaTienda";
import { urlSeccionTienda } from "../../../../../lib/seccionesTienda";
type Props = {
  params: Promise<{ slug: string; seccion: string; productoId: string }>;
};
async function datos({ params }: Props) {
  const p = await params;
  if (p.seccion !== "productos" || !/^\d+$/.test(p.productoId)) notFound();
  const tienda = await cargarTiendaPublica(p.slug);
  const producto = tienda.productos.find((v) => v.id === Number(p.productoId));
  if (!producto) notFound();
  const url =
    urlSeccionTienda(await urlPublicaTienda(p.slug), "productos") +
    "/" +
    producto.id;
  return { tienda, producto, url };
}
export async function generateMetadata(p: Props): Promise<Metadata> {
  const { tienda, producto, url } = await datos(p);
  const {slug}=await p.params;
  const meta=await metadataInicio({params:Promise.resolve({slug})});
  return {
    ...meta,
    title: { absolute: `${producto.nombre} · ${tienda.nombre}` },
    description:
      producto.descripcion?.slice(0, 160) ||
      `Consulta ${producto.nombre} en ${tienda.nombre}.`,
    alternates: { canonical: url },
    openGraph: {
      ...meta.openGraph,
      title: producto.nombre,
      url,
      images: producto.imagen ? [producto.imagen] : [],
    },
  };
}
export default async function ProductoPage(p: Props) {
  const { tienda, producto, url } = await datos(p);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: producto.nombre,
    description: producto.descripcion,
    image: producto.imagen || undefined,
    url,
    offers: {
      "@type": "Offer",
      priceCurrency: "COP",
      price: Number(producto.precio),
      availability:
        producto.disponible && Number(producto.stockActual) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url,
      seller: { "@type": "Organization", name: tienda.nombre },
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonSeguro(schema) }}
    />
  );
}
