export const dominioTiendas =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || "powerpospioneers.com";
export function slugPublico(slug: string) {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    !["app", "www", "api", "admin", "mail", "ftp"].includes(slug)
  );
}
export function urlTienda(slug: string) {
  if (!slugPublico(slug)) throw new Error("Tienda inválida");
  return `https://${slug}.${dominioTiendas}/`;
}
export function slugDelHost(host: string) {
  const nombre = host.toLowerCase().split(":")[0];
  const sufijo = `.${dominioTiendas}`;
  const slug = nombre.endsWith(sufijo) ? nombre.slice(0, -sufijo.length) : "";
  return slugPublico(slug) ? slug : null;
}
export function jsonSeguro(datos: unknown) {
  return JSON.stringify(datos).replace(/</g, "\\u003c");
}
