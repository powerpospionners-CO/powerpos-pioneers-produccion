"use client";
import { useCallback, useState } from "react";
import QRCode from "qrcode";
import api from "@/lib/api";
import type { TiendaPublica } from "@/lib/tiendaPublica";
type Config = TiendaPublica["config"];
type Resena = { id: string; estado: string; productoId: number; estrellas: number; texto: string; nombre: string; fecha: string };
type Estadisticas = {
  periodo: number;
  pedidos: { total: number; porEstado: Record<string, number>; porEntrega: Record<string, number> };
  ventas: { total: number; ticketPromedio: number; pedidos: number };
  conversion: number;
  cupones: { usos: number; descuento: number };
  productos: { nombre: string; cantidad: number; ventas: number }[];
  reservas: { total: number; porEstado: Record<string, number> };
  cuentasNuevas: number;
  suscriptoresNuevos: number;
};
const input = "mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
const boton = "rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-50";
const card = "rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4";
const dinero = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const error = (e: any, t: string) => e?.response?.data?.message || t;

// En el subdominio de la empresa la tienda vive en /tienda; en el portal general, en /tienda/<slug>.
export function urlMesa(origen: string, host: string, slug: string, numero: number, token: string) {
  const base = host.startsWith(`${slug}.`) ? `${origen}/tienda/productos` : `${origen}/tienda/${encodeURIComponent(slug)}/productos`;
  return `${base}?mesa=${numero}&t=${encodeURIComponent(token)}`;
}
const escapar = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function ExperienciaTienda({
  config,
  busy,
  nombre,
  onChange,
}: {
  config: Config;
  busy: boolean;
  nombre: string;
  onChange: (k: string, v: unknown) => void;
}) {
  const [resenas, setResenas] = useState<Resena[] | null>(null),
    [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null),
    [dias, setDias] = useState(30),
    [ocupado, setOcupado] = useState(false),
    [aviso, setAviso] = useState(""),
    [falla, setFalla] = useState("");
  const accion = useCallback(async (fn: () => Promise<void>, exito = "") => {
    setOcupado(true);
    setFalla("");
    setAviso("");
    try {
      await fn();
      if (exito) setAviso(exito);
    } catch (e) {
      setFalla(error(e, "No se pudo completar la acción"));
    } finally {
      setOcupado(false);
    }
  }, []);
  const imprimirMesas = () =>
    accion(async () => {
      const { data } = await api.get("/tienda-admin/mesas");
      if (!data.mesas.length) throw new Error("Activa las mesas y guarda los cambios antes de imprimir.");
      const tarjetas = await Promise.all(
        data.mesas.map(async (m: { numero: number; token: string }) => {
          const url = urlMesa(window.location.origin, window.location.host, data.slug, m.numero, m.token);
          const qr = await QRCode.toDataURL(url, { width: 360, margin: 1 });
          return `<figure><img src="${qr}" alt="QR mesa ${m.numero}"><figcaption><strong>Mesa ${m.numero}</strong><span>Escanea para ver el menú y pedir</span></figcaption></figure>`;
        }),
      );
      const ventana = window.open("", "_blank");
      if (!ventana) throw new Error("Permite las ventanas emergentes para imprimir los códigos.");
      ventana.document.write(
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Mesas · ${escapar(nombre)}</title><style>body{font-family:system-ui,sans-serif;margin:24px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}figure{margin:0;padding:16px;border:1px solid #ccc;border-radius:12px;text-align:center;break-inside:avoid}img{width:100%;max-width:220px}figcaption{display:grid;gap:4px}strong{font-size:22px}span{color:#555;font-size:13px}@media print{button{display:none}}</style></head><body><h1>${escapar(nombre)}</h1><button onclick="print()">Imprimir</button><main>${tarjetas.join("")}</main></body></html>`,
      );
      ventana.document.close();
    });
  const deshabilitado = busy || ocupado;
  const casilla = (campo: keyof Config, titulo: string, ayuda: string) => (
    <label key={String(campo)} className="flex gap-3">
      <input type="checkbox" className="mt-1" disabled={busy} checked={!!config[campo]} onChange={(e) => onChange(String(campo), e.target.checked)} />
      <span>
        {titulo}
        <span className="block text-sm text-gray-400">{ayuda}</span>
      </span>
    </label>
  );
  return (
    <>
      <section className={card}>
        <h2 className="text-xl font-bold">Entregas, mesas y avisos</h2>
        <p className="text-gray-400">Actívalas y guarda los cambios.</p>
        {casilla("recogerHabilitado", "Recoger en tienda", "El cliente elige recoger su pedido; no paga domicilio ni pedido mínimo.")}
        {casilla("programarHabilitado", "Pedidos programados", "El cliente elige fecha y hora (hasta 7 días, dentro de tu horario).")}
        {casilla("mesasHabilitadas", "Pedidos desde la mesa con QR", "Cada mesa tiene un QR firmado; el pedido llega a Domicilios marcado con su número.")}
        {config.mesasHabilitadas && (
          <div className="flex flex-wrap items-end gap-3">
            <label>
              Número de mesas
              <input type="number" min={1} max={200} className={input} disabled={busy} value={config.mesasCantidad ?? 10} onChange={(e) => onChange("mesasCantidad", Number(e.target.value))} />
            </label>
            <button type="button" className={boton} disabled={deshabilitado} onClick={() => void imprimirMesas()}>
              Imprimir códigos QR
            </button>
          </div>
        )}
        {casilla("avisosClientes", "Avisos al cliente", "Correo o WhatsApp cuando cambia el estado del pedido o la reserva, y recordatorio el día anterior a la reserva. Solo a quien lo autoriza.")}
        {config.avisosClientes && (
          <p className="text-sm text-gray-400">
            El correo usa el SMTP del sistema. Para WhatsApp se requiere una plantilla de cliente aprobada por Meta, configurada por PowerPOS (variable WHATSAPP_TEMPLATE_CLIENTE). Sin ella se avisa solo por correo.
          </p>
        )}
        {casilla("resenasHabilitadas", "Reseñas verificadas", "Solo clientes con cuenta y un pedido entregado opinan; tú apruebas cada reseña antes de publicarla. Requiere cuentas de cliente.")}
      </section>

      {(falla || aviso) && (
        <p role={falla ? "alert" : "status"} className={falla ? "text-red-300" : "text-teal-300"}>
          {falla || aviso}
        </p>
      )}

      {config.resenasHabilitadas && (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Reseñas por moderar</h2>
            <button type="button" className={boton} disabled={deshabilitado} onClick={() => void accion(async () => setResenas((await api.get("/tienda-admin/resenas")).data))}>
              {resenas ? "Actualizar" : "Ver reseñas"}
            </button>
          </div>
          {resenas && !resenas.length && <p className="text-gray-400">Todavía no hay reseñas.</p>}
          <ul className="divide-y divide-gray-800">
            {resenas?.map((r) => (
              <li key={r.id} className="space-y-2 py-3">
                <p>
                  <strong>{r.nombre}</strong> · {"★".repeat(r.estrellas)}{"☆".repeat(5 - r.estrellas)} · producto #{r.productoId} ·{" "}
                  <span className="text-gray-400">{{ PENDIENTE: "Por revisar", PUBLICADA: "Publicada", OCULTA: "Oculta" }[r.estado] || r.estado}</span>
                </p>
                {r.texto && <p className="text-gray-300">{r.texto}</p>}
                <div className="flex gap-2">
                  {r.estado !== "PUBLICADA" && (
                    <button type="button" className="rounded-lg bg-teal-700 px-3 py-1 disabled:opacity-50" disabled={deshabilitado} onClick={() => void accion(async () => { await api.patch(`/tienda-admin/resenas/${r.id}`, { accion: "PUBLICAR" }); setResenas(resenas.map((x) => (x.id === r.id ? { ...x, estado: "PUBLICADA" } : x))); }, "Reseña publicada.")}>
                      Publicar
                    </button>
                  )}
                  {r.estado !== "OCULTA" && (
                    <button type="button" className={boton} disabled={deshabilitado} onClick={() => void accion(async () => { await api.patch(`/tienda-admin/resenas/${r.id}`, { accion: "OCULTAR" }); setResenas(resenas.map((x) => (x.id === r.id ? { ...x, estado: "OCULTA" } : x))); }, "Reseña oculta.")}>
                      Ocultar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-bold">Estadísticas de la tienda en línea</h2>
          <div className="flex items-end gap-2">
            <label>
              Periodo
              <select className={input} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                <option value={7}>Últimos 7 días</option>
                <option value={30}>Últimos 30 días</option>
                <option value={90}>Últimos 90 días</option>
              </select>
            </label>
            <button type="button" className={boton} disabled={deshabilitado} onClick={() => void accion(async () => setEstadisticas((await api.get(`/tienda-admin/estadisticas?dias=${dias}`)).data))}>
              Consultar
            </button>
          </div>
        </div>
        {estadisticas && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Ventas web", dinero(estadisticas.ventas.total)],
                ["Pedidos aceptados", `${estadisticas.ventas.pedidos} de ${estadisticas.pedidos.total}`],
                ["Ticket promedio", dinero(estadisticas.ventas.ticketPromedio)],
                ["Aceptación", `${estadisticas.conversion}%`],
                ["Usos de cupón", String(estadisticas.cupones.usos)],
                ["Descuento en cupones", dinero(estadisticas.cupones.descuento)],
                ["Reservas", String(estadisticas.reservas.total)],
                ["Cuentas / suscriptores nuevos", `${estadisticas.cuentasNuevas} / ${estadisticas.suscriptoresNuevos}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-gray-800 p-3">
                  <dt className="text-xs text-gray-400">{k}</dt>
                  <dd className="text-lg font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-gray-400">
              Por tipo de entrega: domicilio {estadisticas.pedidos.porEntrega.DOMICILIO || 0} · recoger {estadisticas.pedidos.porEntrega.RECOGER || 0} · mesa {estadisticas.pedidos.porEntrega.MESA || 0}
            </p>
            {!!estadisticas.productos.length && (
              <table className="w-full text-left text-sm">
                <caption className="mb-2 text-left font-bold">Productos más pedidos en línea</caption>
                <thead className="text-gray-400">
                  <tr><th className="py-1">Producto</th><th>Unidades</th><th>Ventas</th></tr>
                </thead>
                <tbody>
                  {estadisticas.productos.map((p) => (
                    <tr key={p.nombre} className="border-t border-gray-800">
                      <td className="py-1">{p.nombre}</td><td>{p.cantidad}</td><td>{dinero(p.ventas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </>
  );
}
