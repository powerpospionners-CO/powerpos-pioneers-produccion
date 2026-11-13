"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TiendaFigma from "./TiendaFigma";
import {
  solicitarTienda,
  type TiendaPublica,
} from "../../../lib/tiendaPublica";
export default function TiendaPage() {
  const { slug } = useParams<{ slug: string }>();
  const [tienda, setTienda] = useState<TiendaPublica | null>(null),
    [error, setError] = useState(""),
    [intento, setIntento] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    setTienda(null);
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
          document.title = `${data.nombre} · Tienda en línea`;
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
  }, [slug, intento]);
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
  return <TiendaFigma key={slug} tienda={tienda} slug={slug} />;
}
