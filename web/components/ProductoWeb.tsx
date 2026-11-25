"use client";
import { useState } from "react";
import Link from "next/link";
import type { ProductoPublico } from "../lib/tiendaPublica";
import {
  existenciasTienda,
  puedePedirProducto,
} from "../lib/existenciasTienda";
const cop = (v: string) =>
  Number(v).toLocaleString("es-CO", { style: "currency", currency: "COP" });
export default function ProductoWeb({
  producto,
  imagenes,
  volver,
  onAgregar,
}: {
  producto: ProductoPublico;
  imagenes: string[];
  volver: string;
  onAgregar: () => void;
}) {
  const fotos = [...new Set([producto.imagen, ...imagenes].filter(Boolean))];
  const [foto, setFoto] = useState(0);
  const disponible = puedePedirProducto(
    producto.stockActual,
    1,
    producto.disponible,
  );
  return (
    <section className="section product-page">
      <Link href={volver} prefetch={false} className="text-link">
        ← Volver a Productos
      </Link>
      <div className="product-page-grid">
        <div>
          <div className="product-page-photo">
            {fotos[foto] ? (
              <img src={fotos[foto]} alt={producto.nombre} />
            ) : (
              <p>Imagen no disponible</p>
            )}
          </div>
          {fotos.length > 1 && (
            <div className="product-thumbs">
              {fotos.map((src, i) => (
                <button
                  type="button"
                  key={src}
                  onClick={() => setFoto(i)}
                  aria-label={`Ver foto ${i + 1} de ${producto.nombre}`}
                  aria-pressed={foto === i}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-page-copy">
          <div className="eyebrow">{producto.categoria.nombre}</div>
          <h1>{producto.nombre}</h1>
          <strong className="product-page-price">{cop(producto.precio)}</strong>
          <p className="preserve-lines">
            {producto.descripcion ||
              "Consulta con el negocio los detalles de este producto."}
          </p>
          <dl>
            <dt>Presentación</dt>
            <dd>{producto.presentacion || "Consultar presentación"}</dd>
            {producto.origen && (
              <>
                <dt>Origen</dt>
                <dd>{producto.origen}</dd>
              </>
            )}
            <dt>Disponibilidad</dt>
            <dd>{disponible ? "Disponible" : "Agotado"}</dd>
            <dt>Existencias</dt>
            <dd>
              {existenciasTienda(producto.stockActual)}{" "}
              {producto.ventaGranel
                ? ["l", "ml"].includes(producto.unidadGranel || "")
                  ? "ml"
                  : "g"
                : "unidades"}
            </dd>
          </dl>
          <button
            type="button"
            className="button primary"
            disabled={!disponible}
            onClick={onAgregar}
          >
            {disponible ? "Agregar al carrito" : "Agotado"}
          </button>
        </div>
      </div>
    </section>
  );
}
