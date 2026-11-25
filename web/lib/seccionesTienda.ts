export const seccionesTienda = [
  "inicio",
  "productos",
  "nosotros",
  "contacto",
  "politicas",
] as const;
export type SeccionTienda = (typeof seccionesTienda)[number];
export const etiquetasSeccion: Record<SeccionTienda, string> = {
  inicio: "Inicio",
  productos: "Productos",
  nosotros: "Nosotros",
  contacto: "Contacto",
  politicas: "Políticas de compra",
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
    politicas: `${base}/politicas`,
  };
}
// Las categorías cuelgan de la misma base que productos: /tienda/<slug>/categorias/<id>.
export function rutaCategoria(rutas: Record<SeccionTienda, string>, id: number) {
  return `${rutas.productos.replace(/\/productos$/, "")}/categorias/${id}`;
}
export function urlCategoriaTienda(base: string, id: number) {
  return urlSeccionTienda(base, "productos").replace(/\/productos$/, `/categorias/${id}`);
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
