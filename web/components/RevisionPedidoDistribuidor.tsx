"use client";
import { useState } from "react";
import api from "@/lib/api";
import { moneda } from "@/lib/formato";
import { useAuthStore } from "@/store/authStore";

export default function RevisionPedidoDistribuidor({
  pedidoId,
  onCancelado,
}: {
  pedidoId: number;
  onCancelado: () => void | Promise<void>;
}) {
  const rol = useAuthStore((s) => s.usuario?.rol),
    [abierto, setAbierto] = useState(false),
    [datos, setDatos] = useState<any>(null),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState(""),
    [motivo, setMotivo] = useState(""),
    [confirmado, setConfirmado] = useState(false);
  async function cargar() {
    setOcupado(true);
    setError("");
    try {
      setDatos(
        (
          await api.get(
            `/pedidos-distribuidor/${pedidoId}/revision-administrativa`,
          )
        ).data,
      );
      setConfirmado(false);
    } catch (e: any) {
      setError(
        String(e.response?.data?.message || "No se pudo cargar la revisión"),
      );
    } finally {
      setOcupado(false);
    }
  }
  async function cancelar() {
    setOcupado(true);
    setError("");
    try {
      await api.patch(`/pedidos-distribuidor/${pedidoId}/cancelar-revisado`, {
        motivo,
        revision: datos.revision,
        confirmado,
      });
      setAbierto(false);
      setMotivo("");
      setConfirmado(false);
      await onCancelado();
    } catch (e: any) {
      setError(
        String(
          e.response?.data?.message ||
            "No se confirmó la cancelación. Actualiza la revisión antes de reintentar.",
        ),
      );
    } finally {
      setOcupado(false);
    }
  }
  if (rol !== "ADMIN_EMPRESA") return null;
  return (
    <>
      <button
        type="button"
        className="mt-3 rounded-lg border border-orange-400/50 px-3 py-2 text-sm font-semibold text-orange-300"
        onClick={() => {
          setAbierto(true);
          setDatos(null);
          setMotivo("");
          void cargar();
        }}
      >
        Revisar y cancelar pedido
      </button>
      {abierto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Revisión administrativa del pedido de distribuidor"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-600 bg-gray-900 p-5 text-left text-gray-100"
          >
            <header className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold">
                Revisión del pedido de distribuidor
              </h2>
              <button
                type="button"
                disabled={ocupado}
                className="rounded border border-gray-600 px-3 py-1"
                onClick={() => setAbierto(false)}
              >
                Cerrar revisión
              </button>
            </header>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded bg-red-950 p-3 text-red-200"
              >
                {error}
              </p>
            )}
            {ocupado && !datos && (
              <p className="mt-4" role="status">
                Consultando pedido y venta vinculada…
              </p>
            )}
            {datos && (
              <div className="mt-4 space-y-4">
                <section className="rounded-lg border border-gray-700 p-3">
                  <h3 className="font-semibold">{datos.pedido.numero}</h3>
                  <p>
                    {datos.pedido.distribuidor.nombre} · Cliente:{" "}
                    {datos.pedido.clienteReferencia || "Sin referencia"}
                  </p>
                  <p>Total del pedido: {moneda(Number(datos.pedido.total))}</p>
                  <p>
                    Comisión registrada:{" "}
                    {moneda(Number(datos.pedido.comisionMonto))} ·{" "}
                    {datos.pedido.liquidacionId
                      ? "Ya liquidada"
                      : "Sin liquidación"}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {datos.pedido.detalles.map((d: any) => (
                      <li key={d.id}>
                        {d.cantidad} × {d.producto.nombre}
                        {d.presentacionNombre
                          ? ` · ${d.presentacionNombre}`
                          : ""}{" "}
                        · {moneda(Number(d.subtotal))}
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-lg border border-gray-700 p-3">
                  <h3 className="font-semibold">Venta vinculada</h3>
                  {datos.venta ? (
                    <>
                      <p>
                        {datos.venta.numero} · {datos.venta.estado}
                        {datos.venta.devueltoTotal ? " · DEVOLUCIÓN TOTAL" : ""}
                      </p>
                      <p>
                        Total: {moneda(Number(datos.venta.total))} · Medio:{" "}
                        {datos.venta.metodoPago}
                      </p>
                      {datos.venta.saldoCredito !== null && (
                        <p>
                          Saldo de crédito: {moneda(datos.venta.saldoCredito)}
                        </p>
                      )}
                      {datos.venta.pagos.length > 0 && (
                        <p className="text-sm">
                          Pagos registrados:{" "}
                          {datos.venta.pagos
                            .map(
                              (p: any) =>
                                `${p.metodoPago}: ${moneda(Number(p.monto))}`,
                            )
                            .join(" · ")}
                        </p>
                      )}
                      {datos.venta.devoluciones.map((d: any) => (
                        <p key={d.id} className="mt-2 text-sm">
                          Devolución: {moneda(Number(d.monto))} · {d.motivo}
                        </p>
                      ))}
                    </>
                  ) : (
                    <p>
                      {datos.controlRegistrado
                        ? "Sin venta de caja disponible o sin retiro registrado."
                        : "Pedido histórico sin control de caja."}
                    </p>
                  )}
                </section>
                {datos.bloqueo && (
                  <p className="rounded-lg border border-amber-600 bg-amber-950/30 p-3 text-sm text-amber-200">
                    {datos.bloqueo}
                  </p>
                )}
                <p className="text-sm text-gray-300">
                  {datos.efecto} El pedido cancelado se conserva en el historial
                  y deja de aparecer como pendiente.
                </p>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void cancelar();
                  }}
                >
                  <fieldset
                    disabled={ocupado || !datos.puedeCancelar}
                    className="space-y-3"
                  >
                    <label className="block text-sm">
                      Motivo de cancelación
                      <textarea
                        className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-950 p-3"
                        rows={3}
                        minLength={10}
                        maxLength={1000}
                        required
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        required
                        checked={confirmado}
                        onChange={(e) => setConfirmado(e.target.checked)}
                      />
                      Revisé el pedido y su venta. Confirmo el cierre del pedido
                      del distribuidor y el motivo registrado.
                    </label>
                    <button
                      type="submit"
                      disabled={
                        ocupado || !confirmado || motivo.trim().length < 10
                      }
                      className="rounded-lg bg-red-700 px-4 py-2 font-semibold disabled:opacity-40"
                    >
                      {ocupado
                        ? "Confirmando…"
                        : "Cancelar pedido del distribuidor"}
                    </button>
                  </fieldset>
                </form>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void cargar()}
                  className="text-sm text-orange-300 underline"
                >
                  Actualizar revisión
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
