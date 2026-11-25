import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateMetadata as metadataInicio } from "../page";
import { urlPublicaTienda } from "../../../../lib/urlPublicaTienda";
import {
  seccionesTienda,
  etiquetasSeccion,
  urlSeccionTienda,
  type SeccionTienda,
} from "../../../../lib/seccionesTienda";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string; seccion: string }> };
// Un notFound() en metadatos salta al 404 raíz; la página lanza el 404 para conservar la marca.
const noEncontrada: Metadata = {
  title: { absolute: "Página no encontrada" },
  robots: { index: false, follow: false },
};
function validar(valor: string): SeccionTienda {
  if (valor === "inicio" || !seccionesTienda.includes(valor as SeccionTienda))
    notFound();
  return valor as SeccionTienda;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, seccion: valor } = await params;
  if (valor === "inicio" || !seccionesTienda.includes(valor as SeccionTienda))
    return noEncontrada;
  const seccion = valor as SeccionTienda;
  const meta = await metadataInicio({ params: Promise.resolve({ slug }) });
  const titulo = `${etiquetasSeccion[seccion]} · ${meta.applicationName}`;
  const url = urlSeccionTienda(await urlPublicaTienda(slug), seccion);
  return {
    ...meta,
    title: { absolute: titulo },
    alternates: { canonical: url },
    openGraph: { ...meta.openGraph, title: titulo, url },
    // La cuenta del cliente es privada y nunca se indexa.
    ...(seccion === "cuenta" ? { robots: { index: false, follow: false } } : {}),
  };
}
export default async function SeccionPage({ params }: Props) {
  validar((await params).seccion);
  return null;
}
