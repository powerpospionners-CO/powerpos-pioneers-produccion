import type { Metadata } from "next";
import {generateMetadata as metadataInicio} from "../../page";
import { jsonSeguro } from "../../../../../lib/seoTienda";
import { notFound } from "next/navigation";
import { cargarTiendaPublica } from "../../../../../lib/cargarTiendaPublica";
import { urlPublicaTienda } from "../../../../../lib/urlPublicaTienda";
import {
  urlCategoriaTienda,
  urlSeccionTienda,
} from "../../../../../lib/seccionesTienda";
type Props = {
  params: Promise<{ slug: string; seccion: string; productoId: string }>;
};
// Devuelve null en vez de notFound(): desde los metadatos Next saltaría al 404 raíz sin la marca.
async function datos({ params }: Props) {
  const p = await params;
  if (!["productos", "categorias"].includes(p.seccion) || !/^\d+$/.test(p.productoId))
    return null;
  const tienda = await cargarTiendaPublica(p.slug);
  const base = await urlPublicaTienda(p.slug);
  const id = Number(p.productoId);
  if (p.seccion === "categorias") {
    const productos = tienda.productos.filter((v) => v.categoriaId === id);
    if (!productos.length) return null;
    return {
      tienda,
      categoria: { nombre: productos[0].categoria.nombre, productos },
      url: urlCategoriaTienda(base, id),
      base,
    };
  }
  const producto = tienda.productos.find((v) => v.id === id);
  if (!producto) return null;
  const url = urlSeccionTienda(base, "productos") + "/" + producto.id;
  return { tienda, producto, url, base };
}
export async function generateMetadata(p: Props): Promise<Metadata> {
  const d = await datos(p);
  if (!d)
    return {
      title: { absolute: "Página no encontrada" },
      robots: { index: false, follow: false },
    };
  const { tienda, producto, categoria, url } = d;
  const {slug}=await p.params;
  const meta=await metadataInicio({params:Promise.resolve({slug})});
  if (categoria)
    return {
      ...meta,
      title: { absolute: `${categoria.nombre} · ${tienda.nombre}` },
      description: `Consulta ${categoria.productos.length} productos de ${categoria.nombre} en ${tienda.nombre}.`,
      alternates: { canonical: url },
      openGraph: { ...meta.openGraph, title: `${categoria.nombre} · ${tienda.nombre}`, url },
    };
  return {
    ...meta,
    title: { absolute: `${producto!.nombre} · ${tienda.nombre}` },
    description:
      producto!.descripcion?.slice(0, 160) ||
      `Consulta ${producto!.nombre} en ${tienda.nombre}.`,
    alternates: { canonical: url },
    openGraph: {
      ...meta.openGraph,
      title: producto!.nombre,
      url,
      images: producto!.imagen ? [producto!.imagen] : [],
    },
  };
}
export default async function ProductoPage(p: Props) {
  const d = await datos(p);
  if (!d) notFound();
  const { tienda, producto, categoria, url, base } = d;
  const schema = categoria
    ? {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${categoria.nombre} · ${tienda.nombre}`,
        url,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: categoria.productos.map((v, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: urlSeccionTienda(base, "productos") + "/" + v.id,
            name: v.nombre,
          })),
        },
      }
    : {
        "@context": "https://schema.org",
        "@type": "Product",
        name: producto!.nombre,
        description: producto!.descripcion,
        image: producto!.imagen || undefined,
        url,
        offers: {
          "@type": "Offer",
          priceCurrency: "COP",
          price: Number(producto!.precio),
          availability:
            producto!.disponible && Number(producto!.stockActual) > 0
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
