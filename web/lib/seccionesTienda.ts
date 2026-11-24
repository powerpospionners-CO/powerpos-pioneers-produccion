export const seccionesTienda = [
  "inicio",
  "productos",
  "nosotros",
  "contacto",
] as const;
export type SeccionTienda = (typeof seccionesTienda)[number];
export const etiquetasSeccion: Record<SeccionTienda, string> = {
  inicio: "Inicio",
  productos: "Productos",
  nosotros: "Nosotros",
  contacto: "Contacto",
};
export function rutasTienda(
  slug: string,
  dominioEmpresa = false,
): Record<SeccionTienda, string> {
  const base = dominioEmpresa
    ? "/tienda"
    : `/tienda/${encodeURIComponent(slug)}`;
  return {
    inicio: dominioEmpresa ? "/" : base,
    productos: `${base}/productos`,
    nosotros: `${base}/nosotros`,
    contacto: `${base}/contacto`,
  };
}
export function urlSeccionTienda(base: string, seccion: SeccionTienda) {
  if (seccion === "inicio") return base;
  const url = new URL(base);
  url.pathname =
    url.pathname === "/"
      ? `/tienda/${seccion}`
      : `${url.pathname.replace(/\/$/, "")}/${seccion}`;
  return url.toString();
}
