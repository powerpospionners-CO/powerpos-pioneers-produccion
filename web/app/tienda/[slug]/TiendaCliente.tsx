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
  const params = useParams<{ slug: string; seccion?: string }>();
  const router = useRouter();
  const seccion: SeccionTienda = seccionesTienda.includes(
    params.seccion as SeccionTienda,
  )
    ? (params.seccion as SeccionTienda)
    : "inicio";
  const [tienda, setTienda] = useState<TiendaPublica | null>(inicial),
    [error, setError] = useState(""),
    [intento, setIntento] = useState(0);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seccion]);
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
          document.title =
            seccion === "inicio"
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
  }, [slug, intento, seccion]);
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
        rutas={rutas}
        navegar={(href) => router.push(href)}
      />
    </>
  );
}
