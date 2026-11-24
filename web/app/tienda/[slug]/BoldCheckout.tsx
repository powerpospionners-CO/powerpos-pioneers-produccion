"use client";
import { useEffect, useRef, useState } from "react";
import { solicitarTienda } from "../../../lib/tiendaPublica";

export function BoldCheckout({
  slug,
  pedidoId,
  clave,
}: {
  slug: string;
  pedidoId: string;
  clave: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const container = root.current;
    let library: HTMLScriptElement | undefined;
    setCargando(true);
    setError("");
    solicitarTienda<{
      referencia: string;
      total: number;
      identidad: string;
      integridad: string;
      vencimiento: string;
      retorno: string;
    }>(
      `/tiendas/${encodeURIComponent(slug)}/pedidos/${encodeURIComponent(pedidoId)}/bold`,
      {
        method: "POST",
        body: JSON.stringify({ clave }),
        signal: controller.signal,
      },
    )
      .then((data) => {
        if (controller.signal.aborted || !container) return;
        const button = document.createElement("script");
        for (const [key, value] of Object.entries({
          "data-bold-button": "",
          "data-api-key": data.identidad,
          "data-order-id": data.referencia,
          "data-currency": "COP",
          "data-amount": String(data.total),
          "data-integrity-signature": data.integridad,
          "data-expiration-date": data.vencimiento,
          "data-redirection-url": data.retorno,
          "data-render-mode": "embedded",
          "data-description": "Pago del pedido en la tienda",
        }))
          button.setAttribute(key, value);
        container.replaceChildren(button);
        // Bold requiere que el marcador exista antes de cargar la librería en React.
        library = document.createElement("script");
        library.src = "https://checkout.bold.co/library/boldPaymentButton.js";
        library.async = true;
        library.onload = () => {
          if (!controller.signal.aborted) setCargando(false);
        };
        library.onerror = () => {
          if (!controller.signal.aborted) {
            setCargando(false);
            setError(
              "No se pudo cargar Bold. Revisa tu conexión y vuelve a intentar.",
            );
          }
        };
        document.head.appendChild(library);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setCargando(false);
          setError(e.message || "No fue posible preparar el pago.");
        }
      });
    return () => {
      controller.abort();
      library?.remove();
      container?.replaceChildren();
    };
  }, [slug, pedidoId, clave, intento]);
  return (
    <section aria-label="Pago seguro con Bold">
      <p>
        Paga de forma segura con Bold. Confirmaremos el pago cuando Bold nos
        notifique; puede tardar unos minutos.
      </p>
      {cargando && <p role="status">Preparando pago seguro…</p>}
      <div ref={root} />
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}
      <p>Si ya pagaste, espera la confirmación antes de volver a pagar.</p>
    </section>
  );
}
