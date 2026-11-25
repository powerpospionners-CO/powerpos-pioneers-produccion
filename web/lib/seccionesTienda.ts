export const seccionesTienda = [
  "inicio",
  "productos",
  "nosotros",
  "contacto",
  "politicas",
  "reservas",
  "cuenta",
] as const;
export type SeccionTienda = (typeof seccionesTienda)[number];
export const etiquetasSeccion: Record<SeccionTienda, string> = {
  inicio: "Inicio",
  productos: "Productos",
  nosotros: "Nosotros",
  contacto: "Contacto",
  politicas: "Políticas de compra",
  reservas: "Reservas",
  cuenta: "Mi cuenta",
};
// Secciones que dependen de una función activada por la empresa o son privadas del cliente.
export function seccionIndexable(
  seccion: SeccionTienda,
  config?: { reservasHabilitadas?: boolean },
) {
  if (seccion === "cuenta") return false;
  if (seccion === "reservas") return !!config?.reservasHabilitadas;
  return true;
}
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
    reservas: `${base}/reservas`,
    cuenta: `${base}/cuenta`,
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
