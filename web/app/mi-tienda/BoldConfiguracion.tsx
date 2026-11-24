"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
type Config = {
  habilitado: boolean;
  merchantId: string;
  identidadConfigurada: boolean;
  secretoConfigurado: boolean;
  webhookRegistrado: boolean;
  webhook: string;
  sucursalId: number;
};
type Pago = {
  id: string;
  estado: string;
  total: number;
  referencia: string;
  pedidoWebId: string;
  pedidoId?: number;
};
const input =
  "w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
export default function BoldConfiguracion({
  sucursalTienda,
}: {
  sucursalTienda: number;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [identidad, setIdentidad] = useState("");
  const [secreto, setSecreto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [busy, setBusy] = useState(false);
  const cargar = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api.get("/tienda-admin/bold/configuracion"),
        api.get("/tienda-admin/bold/pagos"),
      ]);
      setConfig(c.data);
      setPagos(p.data);
    } catch (e: any) {
      setMensaje(
        e.response?.data?.message ||
          "No se pudo cargar la configuración de Bold",
      );
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!config || busy) return;
    setBusy(true);
    setMensaje("");
    try {
      const { data } = await api.patch("/tienda-admin/bold/configuracion", {
        habilitado: config.habilitado,
        merchantId: config.merchantId,
        webhookRegistrado: config.webhookRegistrado,
        identidad,
        secreto,
      });
      setConfig(data);
      setIdentidad("");
      setSecreto("");
      setMensaje(
        data.habilitado
          ? "Botón de pagos habilitado en esta tienda. La confirmación de cada pago llegará desde Bold."
          : "Configuración guardada. El botón permanece deshabilitado.",
      );
    } catch (e: any) {
      setMensaje(e.response?.data?.message || "No se pudo guardar Bold");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold">Pagos en línea con Bold</h2>
      <p>
        Conecta las llaves de <strong>Botón de pagos · Producción</strong> de
        esta empresa. El comprador paga en Bold; PowerPOS verifica el importe y
        la confirmación antes de permitir aceptar la venta.
      </p>
      {mensaje && <p role="status">{mensaje}</p>}
      {config && (
        <form onSubmit={guardar} className="space-y-4">
          <fieldset
            disabled={busy || config.sucursalId !== sucursalTienda}
            className="space-y-4"
          >
            {config.sucursalId !== sucursalTienda && (
              <p role="alert">
                Cambia a la sucursal que recibe los pedidos de la tienda para
                configurar sus pagos.
              </p>
            )}
            <label className="block">
              ID del comercio (merchant_id de Bold)
              <input
                className={input}
                required={config.habilitado}
                value={config.merchantId}
                maxLength={128}
                onChange={(e) =>
                  setConfig({ ...config, merchantId: e.target.value })
                }
              />
            </label>
            <label className="block">
              Llave de identidad del botón
              <input
                className={input}
                type="password"
                autoComplete="new-password"
                value={identidad}
                maxLength={512}
                placeholder={
                  config.identidadConfigurada
                    ? "Configurada · deja vacío para conservarla"
                    : "Llave de producción"
                }
                onChange={(e) => setIdentidad(e.target.value)}
              />
            </label>
            <label className="block">
              Llave secreta del botón
              <input
                className={input}
                type="password"
                autoComplete="new-password"
                value={secreto}
                maxLength={512}
                placeholder={
                  config.secretoConfigurado
                    ? "Configurada · deja vacío para conservarla"
                    : "Llave secreta de producción"
                }
                onChange={(e) => setSecreto(e.target.value)}
              />
            </label>
            <p>
              Las llaves quedan cifradas. La llave secreta nunca se entrega a la
              tienda pública.
            </p>
            <label className="block">
              URL para registrar en Bold → Integraciones → Webhooks
              <input
                readOnly
                className={input}
                value={config.webhook}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <label className="block">
              <input
                type="checkbox"
                checked={config.webhookRegistrado}
                onChange={(e) =>
                  setConfig({ ...config, webhookRegistrado: e.target.checked })
                }
              />{" "}
              Registré esta URL en los webhooks de producción de Bold y comprobé
              que las llaves pertenecen a esta empresa.
            </label>
            <label className="block">
              <input
                type="checkbox"
                checked={config.habilitado}
                onChange={(e) =>
                  setConfig({ ...config, habilitado: e.target.checked })
                }
              />{" "}
              Habilitar el botón de pagos en la tienda pública
            </label>
            <button
              disabled={busy}
              className="rounded-lg bg-orange-600 px-5 py-3 font-bold"
            >
              {busy ? "Guardando…" : "Guardar pagos Bold"}
            </button>
          </fieldset>
        </form>
      )}
      <div className="space-y-3">
        <h3 className="font-bold">Últimos pagos web</h3>
        <button
          type="button"
          onClick={() => void cargar()}
          className="underline"
        >
          Actualizar pagos
        </button>
        <p>
          Los pagos aprobados requieren aceptar el pedido en Domicilios. Si no
          puedes entregarlo, gestiona la devolución en Bold; PowerPOS no
          devuelve dinero automáticamente.
        </p>
        {!pagos.length && <p>Todavía no hay intentos de pago.</p>}
        {pagos.map((p) => (
          <div key={p.id} className="rounded border border-gray-700 p-3">
            <p>
              {p.referencia} ·{" "}
              {Number(p.total).toLocaleString("es-CO", {
                style: "currency",
                currency: "COP",
              })}
            </p>
            <p>
              {p.estado === "APROBADO"
                ? "Pago recibido · pendiente de aceptar en Domicilios"
                : p.estado === "REVISION"
                  ? "Requiere revisión en Bold: posible anulación o pago adicional"
                  : p.estado}
            </p>
            <p>
              Pedido web: {p.pedidoWebId}
              {p.pedidoId ? ` · Venta: ${p.pedidoId}` : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
