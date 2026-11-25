"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { TiendaPublica } from "../lib/tiendaPublica";
import {
  fechaColombia,
  promocionVigente,
  redesTienda,
} from "../lib/comercioTienda";
export default function InicioComercial({
  tienda,
  productosHref,
  nosotrosHref,
}: {
  tienda: TiendaPublica;
  productosHref: string;
  nosotrosHref: string;
}) {
  const t = tienda.config;
  const [fecha, setFecha] = useState("");
  useEffect(() => {
    const actualizar = () => setFecha(fechaColombia(new Date()));
    actualizar();
    const timer = setInterval(actualizar, 60000);
    return () => clearInterval(timer);
  }, []);
  const promociones = (t.promociones || []).filter(
    (p) =>
      fecha &&
      promocionVigente(p, fecha) &&
      (!p.productoId || tienda.productos.some((v) => v.id === p.productoId)),
  );
  const opiniones = (t.testimonios || []).filter((p) => p.autorizado);
  const redes = redesTienda(t);
  return (
    <>
      {(t.sobreNosotros || t.descripcion) && (
        <section className="section home-story">
          <div className="eyebrow">Conoce {tienda.nombre}</div>
          <h2>
            Más que productos, <em>un negocio para ti.</em>
          </h2>
          <p>
            {(t.sobreNosotros || t.descripcion).slice(0, 360)}
            {(t.sobreNosotros || t.descripcion).length > 360 ? "…" : ""}
          </p>
          <Link href={nosotrosHref} prefetch={false} className="text-link">
            Conoce nuestra historia →
          </Link>
        </section>
      )}
      {promociones.length > 0 && (
        <section className="section home-promotions">
          <div className="eyebrow">Por tiempo limitado</div>
          <h2>
            Promociones <em>vigentes</em>
          </h2>
          <div className="commercial-grid">
            {promociones.map((p, i) => (
              <article key={i}>
                <small>
                  Del {p.desde.split("-").reverse().join("/")} al{" "}
                  {p.hasta.split("-").reverse().join("/")}
                </small>
                <h3>{p.titulo}</h3>
                <p className="preserve-lines">{p.detalle}</p>
                <Link
                  className="button dark"
                  href={
                    p.productoId
                      ? `${productosHref}/${p.productoId}`
                      : productosHref
                  }
                  prefetch={false}
                >
                  Ver {p.productoId ? "producto" : "catálogo"} →
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}
      {(["destacadosIds", "novedadesIds"] as const).map((campo) => {
        const lista = (t[campo] || []).flatMap((id) => {
          const p = tienda.productos.find((v) => v.id === id);
          return p ? [p] : [];
        });
        return lista.length ? (
          <section key={campo} className="section home-products">
            <div className="section-heading">
              <h2>
                {campo === "destacadosIds"
                  ? "Nuestros destacados"
                  : "Novedades"}
                <em> para descubrir.</em>
              </h2>
              <Link href={productosHref} prefetch={false} className="text-link">
                Ver catálogo →
              </Link>
            </div>
            <div className="commercial-grid">
              {lista.map((p) => (
                <Link
                  key={p.id}
                  href={`${productosHref}/${p.id}`}
                  prefetch={false}
                  className="home-product-card"
                >
                  {p.imagen ? (
                    <img src={p.imagen} alt={p.nombre} loading="lazy" />
                  ) : (
                    <div className="home-product-placeholder">{p.nombre}</div>
                  )}
                  <small>{p.categoria.nombre}</small>
                  <h3>{p.nombre}</h3>
                  <strong>
                    {Number(p.precio).toLocaleString("es-CO", {
                      style: "currency",
                      currency: "COP",
                    })}
                  </strong>
                  <p>
                    {p.disponible && Number(p.stockActual) > 0
                      ? "Ver producto →"
                      : "Agotado"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null;
      })}
      {opiniones.length > 0 && (
        <section className="section home-testimonials">
          <div className="eyebrow">Experiencias reales</div>
          <h2>
            Lo que dicen <em>nuestros clientes.</em>
          </h2>
          <div className="commercial-grid">
            {opiniones.map((p, i) => (
              <figure key={i}>
                <blockquote>{p.texto}</blockquote>
                <figcaption>— {p.nombre}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      {redes.length > 0 && (
        <section className="section home-social">
          <h2>
            Sigamos <em>en contacto.</em>
          </h2>
          <div className="social-links">
            {redes.map((r) => (
              <a
                key={r.nombre}
                className="button dark"
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {r.nombre} ↗
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
