"use client";
import { useState } from "react";
import Link from "next/link";
import type { ProductoPublico, ResenaProducto } from "../lib/tiendaPublica";
import {
  existenciasTienda,
  puedePedirProducto,
} from "../lib/existenciasTienda";
import {
  precioLinea,
  sinOpciones,
  tieneOpciones,
  type OpcionesLinea,
} from "../lib/opcionesTienda";
import OpcionesProducto from "./tienda/OpcionesProducto";
const cop = (v: string | number) =>
  Number(v).toLocaleString("es-CO", { style: "currency", currency: "COP" });
const estrellas = (n: number) => "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n));
export default function ProductoWeb({
  producto,
  imagenes,
  volver,
  onAgregar,
  resenas,
  favorito,
  onFavorito,
}: {
  producto: ProductoPublico;
  imagenes: string[];
  volver: string;
  onAgregar: (opciones: OpcionesLinea) => void;
  resenas?: ResenaProducto;
  favorito?: boolean;
  onFavorito?: (valor: boolean) => void;
}) {
  const fotos = [...new Set([producto.imagen, ...imagenes].filter(Boolean))];
  const [foto, setFoto] = useState(0);
  const [opciones, setOpciones] = useState<OpcionesLinea>(sinOpciones());
  const disponible = puedePedirProducto(
    producto.stockActual,
    1,
    producto.disponible,
  );
  const precio = precioLinea(producto, opciones);
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
          {resenas && (
            <p className="product-rating" aria-label={`${resenas.promedio} de 5 estrellas en ${resenas.total} reseñas`}>
              <span aria-hidden="true">{estrellas(resenas.promedio)}</span> {resenas.promedio} · {resenas.total}{" "}
              {resenas.total === 1 ? "reseña" : "reseñas"}
            </p>
          )}
          <strong className="product-page-price">{cop(precio ?? producto.precio)}</strong>
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
          {tieneOpciones(producto) && disponible && (
            <OpcionesProducto producto={producto} valor={opciones} onChange={setOpciones} />
          )}
          <div className="store-form-actions">
            <button
              type="button"
              className="button primary"
              disabled={!disponible || precio === null}
              onClick={() => {
                onAgregar(opciones);
                setOpciones(sinOpciones());
              }}
            >
              {disponible ? "Agregar al carrito" : "Agotado"}
            </button>
            {onFavorito && (
              <button
                type="button"
                className="button text"
                aria-pressed={!!favorito}
                onClick={() => onFavorito(!favorito)}
              >
                {favorito ? "♥ En favoritos" : "♡ Guardar en favoritos"}
              </button>
            )}
          </div>
        </div>
      </div>
      {resenas && resenas.ultimas.length > 0 && (
        <section className="product-reviews" aria-label="Opiniones de clientes">
          <h2>Opiniones de clientes que lo recibieron</h2>
          <ul>
            {resenas.ultimas.map((r, i) => (
              <li key={i}>
                <strong>{r.nombre}</strong>{" "}
                <span aria-label={`${r.estrellas} de 5 estrellas`}>{estrellas(r.estrellas)}</span>
                {r.texto && <p>{r.texto}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
