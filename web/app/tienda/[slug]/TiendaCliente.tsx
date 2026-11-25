"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  etiquetasSeccion,
  seccionesTienda,
  type SeccionTienda,
} from "../../../lib/seccionesTienda";
import TiendaFigma from "./TiendaFigma";
import {
  solicitarTienda,
  type TiendaPublica,
} from "../../../lib/tiendaPublica";
export default function TiendaCliente({
  slug,
  inicial,
  rutas,
  children,
}: {
  slug: string;
  inicial: TiendaPublica;
  rutas: Record<SeccionTienda, string>;
  children?: ReactNode;
}) {
  const params = useParams<{
    slug: string;
    seccion?: string;
    productoId?: string;
  }>();
  const router = useRouter();
  const enCategoria = params.seccion === "categorias";
  const seccion: SeccionTienda = enCategoria
    ? "productos"
    : seccionesTienda.includes(params.seccion as SeccionTienda)
      ? (params.seccion as SeccionTienda)
      : "inicio";
  const categoriaId =
    enCategoria && params.productoId ? Number(params.productoId) : undefined;
  const productoId =
    !enCategoria && params.productoId ? Number(params.productoId) : undefined;
  // Ruta inexistente: la página responde 404 y la tienda muestra su aviso con la marca.
  const noEncontrada =
    (!!params.seccion &&
      !enCategoria &&
      !seccionesTienda.includes(params.seccion as SeccionTienda)) ||
    (enCategoria && !params.productoId);
  const [tienda, setTienda] = useState<TiendaPublica | null>(inicial),
    [error, setError] = useState(""),
    [intento, setIntento] = useState(0);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const destino = hash ? document.getElementById(hash) : null;
    if (destino) destino.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [seccion, params.productoId, params.seccion]);
  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    setError("");
    const cargar = async () => {
      const current = ++sequence;
      try {
        const data = await solicitarTienda<TiendaPublica>(
          `/tiendas/${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted && current === sequence) {
          setTienda(data);
          setError("");
          const categoria = data.productos.find(
            (p) => categoriaId && p.categoriaId === categoriaId,
          )?.categoria.nombre;
          document.title = noEncontrada
            ? `Página no encontrada · ${data.nombre}`
            : categoria
              ? `${categoria} · ${data.nombre}`
              : productoId && data.productos.find((p) => p.id === productoId)
              ? `${data.productos.find((p) => p.id === productoId)!.nombre} · ${data.nombre}`
              : seccion === "inicio"
                ? `${data.nombre} · Tienda en línea`
                : `${etiquetasSeccion[seccion]} · ${data.nombre}`;
        }
      } catch (e) {
        if (!controller.signal.aborted && current === sequence)
          setError(
            e instanceof Error ? e.message : "No se pudo cargar la tienda",
          );
      }
    };
    void cargar();
    const timer = setInterval(() => void cargar(), 30000);
    const focus = () => void cargar();
    window.addEventListener("focus", focus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [slug, intento, seccion, productoId, categoriaId, noEncontrada]);
  if (!tienda)
    return (
      <main className="figma-store app-shell" style={{ padding: "15vh 8%" }}>
        <h1>
          {error ? "Tienda no disponible" : "Estamos preparando el catálogo…"}
        </h1>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              className="button primary"
              onClick={() => setIntento((n) => n + 1)}
            >
              Volver a intentar
            </button>
          </>
        )}
      </main>
    );
  return (
    <>
      {children}
      <TiendaFigma
        key={slug}
        tienda={tienda}
        slug={slug}
        seccion={seccion}
        productoId={productoId}
        categoriaId={categoriaId}
        noEncontrada={noEncontrada}
        rutas={rutas}
        navegar={(href) => router.push(href)}
      />
    </>
  );
}
