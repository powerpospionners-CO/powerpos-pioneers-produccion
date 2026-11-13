"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  solicitarTienda,
  type TiendaPublica,
} from "../../../lib/tiendaPublica";
type Estado = { id: string; estado: string; total: number; motivo?: string };
const dinero = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
export function PedidoTienda({
  tienda,
  slug,
  items,
  onRecibido,
}: {
  tienda: TiendaPublica;
  slug: string;
  items: { id: number; price: number; quantity: number; disponible: boolean }[];
  onRecibido: () => void;
}) {
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    direccion: "",
    zona: "",
    observacion: "",
    metodoPago: "EFECTIVO",
  });
  const [estado, setEstado] = useState<Estado | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    clave = useRef({ body: "", id: "" });
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0),
    zona = tienda.config.zonas.find((z) => z.nombre === form.zona),
    total = subtotal + (zona?.costo || 0);
  const path = `/tiendas/${encodeURIComponent(slug)}/pedidos`;
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pedido");
    if (!id) return;
    const controller = new AbortController();
    solicitarTienda<Estado>(`${path}/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(setEstado)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("No fue posible recuperar el seguimiento del pedido.");
      });
    return () => controller.abort();
  }, [path]);
  useEffect(() => {
    if (!estado?.id) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      solicitarTienda<Estado>(`${path}/${encodeURIComponent(estado.id)}`, {
        signal: controller.signal,
      })
        .then(setEstado)
        .catch(() => {});
    }, 10000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [path, estado?.id]);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const body = JSON.stringify({
      ...form,
      totalEsperado: total,
      items: items.map((i) => ({ productoId: i.id, cantidad: i.quantity })),
    });
    if (clave.current.body !== body)
      clave.current = { body, id: crypto.randomUUID() };
    try {
      const result = await solicitarTienda<Estado>(path, {
        method: "POST",
        body: JSON.stringify({ ...JSON.parse(body), clave: clave.current.id }),
      });
      setEstado(result);
      onRecibido();
      const url = new URL(window.location.href);
      url.searchParams.set("pedido", result.id);
      window.history.replaceState(null, "", url);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo enviar. Puedes reintentar sin duplicar la solicitud.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (estado)
    return (
      <div role="status" className="confirmation-note">
        <div>
          <h3>Solicitud recibida</h3>
          <p>Referencia: {estado.id.slice(0, 8)}</p>
          <p>Estado: {estado.estado.replaceAll("_", " ")}</p>
          <p>{dinero(Number(estado.total))}</p>
          {estado.motivo && <p>{estado.motivo}</p>}
          <p>
            La empresa revisa y confirma tu pedido. Esta solicitud no es un
            comprobante de pago.
          </p>
        </div>
      </div>
    );
  return (
    <form onSubmit={enviar}>
      <fieldset disabled={busy}>
        {(["nombre", "telefono", "direccion"] as const).map((k) => (
          <label key={k}>
            {
              {
                nombre: "Nombre",
                telefono: "Teléfono",
                direccion: "Dirección de entrega",
              }[k]
            }
            <input
              required
              type={k === "telefono" ? "tel" : "text"}
              autoComplete={
                {
                  nombre: "name",
                  telefono: "tel",
                  direccion: "street-address",
                }[k]
              }
              maxLength={k === "direccion" ? 300 : 100}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Zona de entrega
          <select
            required
            value={form.zona}
            onChange={(e) => setForm({ ...form, zona: e.target.value })}
          >
            <option value="">Selecciona tu zona</option>
            {tienda.config.zonas.map((z) => (
              <option key={z.nombre}>{z.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Forma de pago al confirmar
          <select
            value={form.metodoPago}
            onChange={(e) => setForm({ ...form, metodoPago: e.target.value })}
          >
            {["EFECTIVO", "TRANSFERENCIA", "NEQUI", "DAVIPLATA"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Indicaciones
          <textarea
            maxLength={500}
            value={form.observacion}
            onChange={(e) => setForm({ ...form, observacion: e.target.value })}
          />
        </label>
        <div className="order-mini-summary">
          <p>Productos: {dinero(subtotal)}</p>
          <p>Domicilio: {zona ? dinero(zona.costo) : "Por seleccionar"}</p>
          <strong>Total: {dinero(total)}</strong>
        </div>
        {subtotal < tienda.config.minimo && (
          <p>Pedido mínimo: {dinero(tienda.config.minimo)}</p>
        )}
        <label>
          <input type="checkbox" required /> Autorizo a {tienda.nombre} a usar
          estos datos para atender y entregar este pedido.
        </label>
        <p>La empresa confirma la solicitud. Enviarla no registra un pago.</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          disabled={
            busy ||
            !items.length ||
            items.some((p) => !p.disponible) ||
            subtotal < tienda.config.minimo
          }
        >
          {busy ? "Enviando…" : "Enviar pedido a la empresa"}
        </button>
      </fieldset>
    </form>
  );
}
