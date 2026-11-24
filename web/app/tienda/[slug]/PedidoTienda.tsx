"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BoldCheckout } from "./BoldCheckout";
import {
  solicitarTienda,
  type TiendaPublica,
} from "../../../lib/tiendaPublica";
type Estado = {
  id: string;
  estado: string;
  total: number;
  subtotal?: number;
  costoDomicilio?: number;
  items?: { nombre: string; cantidad: number; precio: number }[];
  motivo?: string;
  pagoBold?: { estado: string; referencia?: string } | null;
};
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
    [recuperando, setRecuperando] = useState(false),
    [clavePago, setClavePago] = useState(""),
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
    setRecuperando(true);
    try {
      setClavePago(sessionStorage.getItem(`bold:${slug}:${id}`) || "");
    } catch {
      /* Seguimiento disponible sin almacenamiento. */
    }
    const controller = new AbortController();
    solicitarTienda<Estado>(`${path}/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(setEstado)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("No fue posible recuperar el seguimiento del pedido.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecuperando(false);
      });
    return () => controller.abort();
  }, [path, slug]);
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
      pagoBold: form.metodoPago === "TARJETA",
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
      if (form.metodoPago === "TARJETA") {
        setClavePago(clave.current.id);
        try {
          sessionStorage.setItem(`bold:${slug}:${result.id}`, clave.current.id);
        } catch {
          /* Mantener la clave en memoria. */
        }
        setEstado({ ...result, pagoBold: { estado: "PENDIENTE" } });
      }
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
  function nuevoPedido() {
    const url = new URL(window.location.href);
    for (const key of ["pedido", "bold-order-id", "bold-tx-status"])
      url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
    setEstado(null);
    setClavePago("");
    setError("");
    clave.current = { body: "", id: "" };
  }
  if (recuperando)
    return <p role="status">Consultando el estado de tu pedido…</p>;
  if (estado)
    return (
      <section
        className="web-order-confirmation"
        aria-label="Resumen de tu pedido"
      >
        <div className="web-order-heading">
          <span>Pedido #{estado.id.slice(0, 8)}</span>
          <h3>
            {estado.estado === "RECHAZADO"
              ? "Pedido cancelado"
              : estado.estado === "RECIBIDO"
                ? "Recibimos tu pedido"
                : "Sigue tu pedido"}
          </h3>
        </div>
        <p className="web-order-status" role="status">
          {(
            {
              RECIBIDO: "Pendiente de revisión de la tienda",
              ACEPTADO: "Aceptado por la tienda",
              EN_CAMINO: "Tu pedido está en camino",
              ENTREGADO: "Pedido entregado",
              RECHAZADO: "Solicitud cancelada",
            } as Record<string, string>
          )[estado.estado] || estado.estado.replaceAll("_", " ")}
        </p>
        {!!estado.items?.length && (
          <ul className="web-order-items">
            {estado.items.map((item, i) => (
              <li key={i}>
                <span>
                  {item.cantidad} × {item.nombre}
                </span>
                <strong>{dinero(item.cantidad * Number(item.precio))}</strong>
              </li>
            ))}
          </ul>
        )}
        <dl className="web-order-totals">
          {estado.subtotal !== undefined && (
            <div>
              <dt>Productos</dt>
              <dd>{dinero(Number(estado.subtotal))}</dd>
            </div>
          )}
          {estado.costoDomicilio !== undefined && (
            <div>
              <dt>Domicilio</dt>
              <dd>{dinero(Number(estado.costoDomicilio))}</dd>
            </div>
          )}
          <div className="web-order-grand-total">
            <dt>Total del pedido</dt>
            <dd>{dinero(Number(estado.total))}</dd>
          </div>
        </dl>
        {estado.pagoBold && (
          <p className="web-order-payment">
            Pago Bold:{" "}
            {(
              {
                PENDIENTE: "Pendiente de confirmación",
                APROBADO:
                  "Pago recibido · pendiente de aceptación de la tienda",
                APLICADO: "Pago recibido y pedido aceptado",
                RECHAZADO: "El último intento fue rechazado",
                ANULADO: "Pago anulado",
                CANCELADO: "Intento cancelado con el pedido",
                REVISION: "Contacta a la tienda: hay un pago en revisión",
              } as Record<string, string>
            )[estado.pagoBold.estado] || estado.pagoBold.estado}
          </p>
        )}
        {estado.estado === "RECIBIDO" &&
          estado.pagoBold &&
          ["PENDIENTE", "RECHAZADO"].includes(estado.pagoBold.estado) &&
          clavePago && (
            <BoldCheckout slug={slug} pedidoId={estado.id} clave={clavePago} />
          )}
        {estado.pagoBold &&
          !clavePago &&
          estado.pagoBold.estado === "PENDIENTE" && (
            <p>
              Para continuar el pago, utiliza el mismo navegador donde enviaste
              el pedido. Si ya pagaste, espera la confirmación o contacta a la
              tienda.
            </p>
          )}
        {estado.motivo && <p>{estado.motivo}</p>}
        <p className="web-order-help">
          La empresa revisa y confirma tu pedido. Esta solicitud no es un
          comprobante de pago.
        </p>
        <button
          type="button"
          className="button text full"
          onClick={nuevoPedido}
        >
          Hacer otro pedido
        </button>
      </section>
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
            {tienda.bold?.habilitado && (
              <option value="TARJETA">Pagar en línea con Bold</option>
            )}
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
        <p>
          {form.metodoPago === "TARJETA"
            ? "Al enviar el pedido podrás pagar con Bold. El pago se confirmará automáticamente y la tienda revisará tu pedido."
            : "La empresa confirma la solicitud. Enviarla no registra un pago."}
        </p>
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
