"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";

// Los ID ya llegan validados por la API; se revalidan antes de insertarlos en un script.
const GA = /^G-[A-Z0-9]{4,15}$/;
const PIXEL = /^\d{8,20}$/;

export function idsAnalitica(config: {
  googleAnalyticsId?: string;
  metaPixelId?: string;
}) {
  const ga = config.googleAnalyticsId || "";
  const pixel = config.metaPixelId || "";
  return { ga: GA.test(ga) ? ga : "", pixel: PIXEL.test(pixel) ? pixel : "" };
}

export default function AnaliticaTienda({
  slug,
  googleAnalyticsId,
  metaPixelId,
  privacidadHref,
}: {
  slug: string;
  googleAnalyticsId?: string;
  metaPixelId?: string;
  privacidadHref?: string;
}) {
  const { ga, pixel } = idsAnalitica({ googleAnalyticsId, metaPixelId });
  const clave = `analitica:${slug}`;
  const [decision, setDecision] = useState<"si" | "no" | "pendiente" | null>(
    null,
  );
  useEffect(() => {
    let guardada: string | null = null;
    try {
      guardada = localStorage.getItem(clave);
    } catch {
      /* Sin almacenamiento se vuelve a preguntar en cada visita. */
    }
    setDecision(guardada === "si" || guardada === "no" ? guardada : "pendiente");
  }, [clave]);
  if (!ga && !pixel) return null;
  const decidir = (valor: "si" | "no") => {
    try {
      localStorage.setItem(clave, valor);
    } catch {
      /* La decisión se respeta durante esta visita. */
    }
    setDecision(valor);
  };
  return (
    <>
      {decision === "si" && ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
          />
          <Script id="analitica-ga" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
      {decision === "si" && pixel && (
        <Script id="analitica-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      )}
      {decision === "pendiente" && (
        <div
          className="cookie-consent"
          role="dialog"
          aria-live="polite"
          aria-label="Uso de cookies de medición"
        >
          <p>
            Usamos cookies de medición para conocer cómo se usa esta tienda y
            mejorarla. Solo se activan si las aceptas.
            {privacidadHref && (
              <>
                {" "}
                <Link prefetch={false} href={privacidadHref}>
                  Política de privacidad
                </Link>
              </>
            )}
          </p>
          <div>
            <button
              type="button"
              className="button text"
              onClick={() => decidir("no")}
            >
              Rechazar
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => decidir("si")}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
