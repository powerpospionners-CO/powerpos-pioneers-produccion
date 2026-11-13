import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { dominioTiendas, slugDelHost, urlTienda } from "../lib/seoTienda";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const slug = slugDelHost((await headers()).get("host") || "");
  return slug
    ? {
        rules: {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/login",
            "/auth/",
            "/dashboard",
            "/pos",
            "/productos",
            "/clientes",
            "/inventario",
            "/mi-tienda",
            "/configuracion",
            "/caja",
            "/reportes",
            "/auditoria",
            "/financiero",
            "/estadisticas",
            "/administracion",
            "/superadmin",
            "/domicilios",
            "/cocina",
            "/distribuidor",
            "/distribuidores",
            "/gastos",
            "/compras",
            "/consumo-empleados",
            "/fidelizacion",
            "/cliente",
            "/llamado",
            "/registro/",
            "/catalogo/",
            "/suscripcion",
            "/codigos-barras",
            "/tienda/",
            "/api/",
          ],
        },
        sitemap: `${urlTienda(slug)}sitemap.xml`,
      }
    : {
        rules: { userAgent: "*", disallow: "/", allow: "/sitemap.xml" },
        sitemap: `https://app.${dominioTiendas}/sitemap.xml`,
      };
}
