import { headers } from "next/headers";
import type { ReactNode } from "react";
import TiendaCliente from "./TiendaCliente";
import { cargarTiendaPublica } from "../../../lib/cargarTiendaPublica";
import { rutasTienda } from "../../../lib/seccionesTienda";
import { slugDelHost } from "../../../lib/seoTienda";
export default async function LayoutTienda({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: ReactNode;
}) {
  const { slug } = await params;
  const tienda = await cargarTiendaPublica(slug);
  const dominioEmpresa =
    slugDelHost((await headers()).get("host") || "") === slug;
  return (
    <TiendaCliente
      key={slug}
      slug={slug}
      inicial={tienda}
      rutas={rutasTienda(slug, dominioEmpresa)}
    >
      {children}
    </TiendaCliente>
  );
}
