"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { solicitarTienda } from "../../lib/tiendaPublica";
import { claveEnvio } from "../../lib/cuentaTienda";
import CampoTrampa from "./CampoTrampa";

type Estado = {
  id: string;
  estado: string;
  fecha: string;
  hora: string;
  personas: number;
  motivo: string;
};
const etiquetas: Record<string, string> = {
  PENDIENTE: "Recibimos tu solicitud. La tienda la confirmará pronto.",
  CONFIRMADA: "¡Tu reserva está confirmada!",
  RECHAZADA: "La tienda no pudo aceptar esta reserva.",
  CANCELADA: "La reserva fue cancelada.",
  ASISTIO: "Gracias por visitarnos.",
  NO_ASISTIO: "La reserva se registró como no asistida.",
};
const hoyColombia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

export default function ReservaTienda({
  slug,
  nombreTienda,
  habilitadas,
  maxPersonas = 10,
  diasMax = 30,
  privacidadHref,
}: {
  slug: string;
  nombreTienda: string;
  habilitadas: boolean;
  maxPersonas?: number;
  diasMax?: number;
  privacidadHref?: string;
}) {
  const ruta = `/tiendas/${encodeURIComponent(slug)}/reservas`;
  const recordada = `reserva:${slug}`;
  const [form, setForm] = useState({ nombre: "", telefono: "", correo: "", fecha: "", hora: "", personas: 2, nota: "" });
  const [trampa, setTrampa] = useState(""),
    [acepta, setAcepta] = useState(false),
    [estado, setEstado] = useState<Estado | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const clave = useRef({ body: "", id: "" });
  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem(recordada) || "";
    } catch {
      /* Sin almacenamiento no se recuerda la última reserva. */
    }
    if (!id) return;
    solicitarTienda<Estado>(`${ruta}/${encodeURIComponent(id)}`)
      .then(setEstado)
      .catch(() => undefined);
  }, [ruta, recordada]);
  if (!habilitadas)
    return (
      <section className="section store-form-page">
        <h1>Reservas</h1>
        <p>{nombreTienda} no recibe reservas en línea por ahora. Escríbenos por los canales de contacto.</p>
      </section>
    );
  const maxFecha = (() => {
    const d = new Date(`${hoyColombia()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + diasMax);
    return d.toISOString().slice(0, 10);
  })();
  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const body = JSON.stringify({ ...form, correo: form.correo || undefined, consentimiento: acepta, sitio: trampa });
    clave.current = claveEnvio(clave.current, body);
    try {
      const r = await solicitarTienda<Estado>(ruta, {
        method: "POST",
        body: JSON.stringify({ ...JSON.parse(body), clave: clave.current.id }),
      });
      setEstado(r);
      try {
        localStorage.setItem(recordada, r.id);
      } catch {
        /* La confirmación sigue visible en pantalla. */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la reserva");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section store-form-page" id="reservas">
      <div className="eyebrow">
        <span /> Reservas
      </div>
      <h1>Reserva tu mesa</h1>
      {estado && (
        <div className="store-form-result" role="status">
          <strong>{etiquetas[estado.estado] || estado.estado}</strong>
          <p>
            {estado.fecha} · {estado.hora} · {estado.personas} {estado.personas === 1 ? "persona" : "personas"}
          </p>
          {estado.motivo && <p>{estado.motivo}</p>}
          <div className="store-form-actions">
            <button type="button" className="button text" onClick={() => solicitarTienda<Estado>(`${ruta}/${encodeURIComponent(estado.id)}`).then(setEstado).catch(() => undefined)}>
              Actualizar estado
            </button>
            <button
              type="button"
              className="button text"
              onClick={() => {
                setEstado(null);
                clave.current = { body: "", id: "" };
                try {
                  localStorage.removeItem(recordada);
                } catch {
                  /* Nada que limpiar. */
                }
              }}
            >
              Hacer otra reserva
            </button>
          </div>
        </div>
      )}
      {!estado && (
        <form className="store-form" onSubmit={enviar}>
          <fieldset disabled={busy}>
            <label>
              Nombre
              <input required maxLength={100} autoComplete="name" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label>
              Teléfono
              <input required type="tel" maxLength={20} autoComplete="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </label>
            <label>
              Correo (opcional)
              <input type="email" maxLength={200} autoComplete="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            </label>
            <div className="store-form-grid">
              <label>
                Fecha
                <input required type="date" min={hoyColombia()} max={maxFecha} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </label>
              <label>
                Hora
                <input required type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
              </label>
              <label>
                Personas
                <input required type="number" min={1} max={maxPersonas} value={form.personas} onChange={(e) => setForm({ ...form, personas: Number(e.target.value) })} />
              </label>
            </div>
            <label>
              Indicaciones (opcional)
              <textarea maxLength={300} value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
            </label>
            <CampoTrampa valor={trampa} onChange={setTrampa} />
            <label className="store-check">
              <input type="checkbox" required checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
              <span>
                Autorizo a {nombreTienda} a usar estos datos para gestionar mi reserva
                {privacidadHref ? (
                  <>
                    {" "}según su <a href={privacidadHref} target="_blank" rel="noopener noreferrer">política de privacidad</a>
                  </>
                ) : null}
                .
              </span>
            </label>
            {error && <p role="alert" className="error">{error}</p>}
            <button className="button primary">{busy ? "Enviando…" : "Solicitar reserva"}</button>
            <p className="store-form-help">La reserva queda pendiente hasta que la tienda la confirme.</p>
          </fieldset>
        </form>
      )}
    </section>
  );
}
