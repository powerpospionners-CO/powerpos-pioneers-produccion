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
function validar(valor: string): SeccionTienda {
  if (valor === "inicio" || !seccionesTienda.includes(valor as SeccionTienda))
    notFound();
  return valor as SeccionTienda;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, seccion: valor } = await params;
  const seccion = validar(valor);
  const meta = await metadataInicio({ params: Promise.resolve({ slug }) });
  const titulo = `${etiquetasSeccion[seccion]} · ${meta.applicationName}`;
  const url = urlSeccionTienda(await urlPublicaTienda(slug), seccion);
  return {
    ...meta,
    title: { absolute: titulo },
    alternates: { canonical: url },
    openGraph: { ...meta.openGraph, title: titulo, url },
  };
}
export default async function SeccionPage({ params }: Props) {
  validar((await params).seccion);
  return null;
}
