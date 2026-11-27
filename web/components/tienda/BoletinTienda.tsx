"use client";
import { useEffect, useState, type FormEvent } from "react";
import { solicitarTienda } from "../../lib/tiendaPublica";
import CampoTrampa from "./CampoTrampa";

export default function BoletinTienda({
  slug,
  nombreTienda,
  privacidadHref,
}: {
  slug: string;
  nombreTienda: string;
  privacidadHref?: string;
}) {
  const [contacto, setContacto] = useState(""),
    [acepta, setAcepta] = useState(false),
    [trampa, setTrampa] = useState(""),
    [baja, setBaja] = useState(false),
    [mensaje, setMensaje] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  // Enlace "Darme de baja" de un correo de campaña: ?baja=correo abre el formulario en modo baja con el correo escrito.
  useEffect(() => {
    const correo = new URLSearchParams(window.location.search).get("baja");
    if (correo && correo.includes("@") && correo.length <= 150) {
      setBaja(true);
      setContacto(correo);
    }
  }, []);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMensaje("");
    const valor = contacto.trim();
    const canal = valor.includes("@") ? { correo: valor } : { whatsapp: valor };
    try {
      await solicitarTienda(`/tiendas/${encodeURIComponent(slug)}/boletin${baja ? "/baja" : ""}`, {
        method: "POST",
        body: JSON.stringify({ ...canal, sitio: trampa, ...(baja ? {} : { consentimiento: acepta }) }),
      });
      setMensaje(baja ? "Listo. Ya no recibirás novedades." : "¡Gracias! Te contaremos nuestras novedades.");
      setContacto("");
      setAcepta(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la solicitud");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form id="boletin" className="store-newsletter" onSubmit={enviar}>
      <strong>{baja ? "Dejar de recibir novedades" : "Recibe nuestras novedades"}</strong>
      <label>
        <span className="sr-only">Correo o WhatsApp</span>
        <input required maxLength={200} placeholder="Correo o número de WhatsApp" value={contacto} onChange={(e) => setContacto(e.target.value)} disabled={busy} />
      </label>
      <CampoTrampa valor={trampa} onChange={setTrampa} />
      {!baja && (
        <label className="store-check">
          <input type="checkbox" required checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          <span>
            Acepto recibir novedades de {nombreTienda}
            {privacidadHref ? (
              <>
                {" "}y su <a href={privacidadHref}>política de privacidad</a>
              </>
            ) : null}
            .
          </span>
        </label>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Enviando…" : baja ? "Darme de baja" : "Suscribirme"}
      </button>
      {mensaje && <p role="status">{mensaje}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="store-link-button" onClick={() => { setBaja(!baja); setMensaje(""); setError(""); }}>
        {baja ? "Volver a suscribirme" : "Darme de baja"}
      </button>
    </form>
  );
}
