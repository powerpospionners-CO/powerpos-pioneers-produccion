"use client";
import { useRef, useState } from "react";
import api from "@/lib/api";
type Registro = {
  id: string;
  estado: string;
  cuentaRevision?: string;
  datos: Record<string, any>;
};
const control =
  "mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-white";
const money = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(
    n / 100,
  );
const hoy = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
export default function PagoNomina({
  periodos,
  empleados,
  onRegistrado,
}: {
  periodos: Registro[];
  empleados: Registro[];
  onRegistrado: (mensaje: string) => Promise<void>;
}) {
  const [periodoId, setPeriodoId] = useState(""),
    [medio, setMedio] = useState("TRANSFERENCIA"),
    [monto, setMonto] = useState(""),
    [fechaPago, setFechaPago] = useState(hoy()),
    [referencia, setReferencia] = useState(""),
    [archivo, setArchivo] = useState<File | null>(null),
    [confirmado, setConfirmado] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const solicitud = useRef<Record<string, any> | null>(null);
  const enCurso = useRef(false);
  const [pendiente, setPendiente] = useState(false);
  const p = periodos.find((r) => r.id === periodoId),
    e = empleados.find((r) => r.id === p?.datos.empleadoId),
    cuenta = e?.datos.cuentaNomina;
  const devengado = (p?.datos.conceptos || [])
      .filter((c: any) => c.tipo === "DEVENGADO")
      .reduce((n: number, c: any) => n + c.montoCentavos, 0),
    deducido = (p?.datos.conceptos || [])
      .filter((c: any) => c.tipo === "DEDUCCION")
      .reduce((n: number, c: any) => n + c.montoCentavos, 0);
  async function registrar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setBusy(true);
    setError("");
    try {
      if (!solicitud.current) {
        let soporteId;
        if (archivo) {
          const fd = new FormData();
          fd.append("archivo", archivo);
          soporteId = (
            await api.post("/personal/archivos", fd, {
              headers: { "Content-Type": "multipart/form-data" },
            })
          ).data.id;
        }
        solicitud.current = {
          periodoId,
          medio,
          monto,
          fechaPago,
          referenciaTransferencia:
            medio === "TRANSFERENCIA" ? referencia : undefined,
          cuentaRevision:
            medio === "TRANSFERENCIA" ? e?.cuentaRevision : undefined,
          soporteId,
          confirmado,
          idempotencia: crypto.randomUUID(),
        };
      }
      setPendiente(true);
      const r = (
        await api.post("/personal/pagos/registrar-enviar", solicitud.current)
      ).data;
      solicitud.current = null;
      setPendiente(false);
      setPeriodoId("");
      setMonto("");
      setArchivo(null);
      setReferencia("");
      setConfirmado(false);
      await onRegistrado(r.mensaje);
    } catch (err: any) {
      setError(
        String(
          err.response?.data?.message || err.message || "No se pudo completar",
        ) +
          ". Conservamos la misma referencia de operación para que el reintento no duplique el pago. Si los datos deben corregirse, actualiza la vista y revisa primero los pagos registrados.",
      );
    } finally {
      enCurso.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5"
      onSubmit={(ev) => {
        ev.preventDefault();
        void registrar();
      }}
    >
      <h2 className="text-xl font-semibold">
        Registrar giro y enviar comprobante de nómina
      </h2>
      <p className="text-sm">
        Registra un pago que ya realizaste en el banco. El sistema no gira
        dinero. El correo incluirá el PDF con devengados, deducciones y neto,
        además del enlace privado para confirmar o presentar diferencias.
      </p>
      <fieldset disabled={busy || pendiente} className="space-y-3">
        <label className="block">
          Periodo pendiente
          <select
            required
            className={control}
            value={periodoId}
            onChange={(ev) => {
              const r = periodos.find((x) => x.id === ev.target.value);
              setPeriodoId(ev.target.value);
              setMonto(
                r
                  ? String(
                      (r.datos.totalCentavos - r.datos.pagadoCentavos) / 100,
                    )
                  : "",
              );
              setConfirmado(false);
            }}
          >
            <option value="">Selecciona</option>
            {periodos
              .filter((r) => r.datos.pagadoCentavos < r.datos.totalCentavos)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.datos.empleado.nombre}: {r.datos.desde} a {r.datos.hasta} ·
                  saldo {money(r.datos.totalCentavos - r.datos.pagadoCentavos)}
                </option>
              ))}
          </select>
        </label>
        {p && (
          <div className="rounded-lg border border-gray-700 p-3">
            <p>
              Devengado: {money(devengado)} · Deducido: {money(deducido)} · Neto
              del periodo: {money(p.datos.totalCentavos)}
            </p>
            <ul className="mt-2 space-y-1">
              {p.datos.conceptos.map((c: any, i: number) => (
                <li key={i}>
                  {c.tipo === "DEDUCCION" ? "Descuento" : "Devengado"}:{" "}
                  {c.nombre} — {money(c.montoCentavos)}
                  {c.fundamento && (
                    <span className="block text-xs text-gray-400">
                      Fundamento: {c.fundamento}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              El neto ya incluye los descuentos del periodo. Este registro no
              los vuelve a descontar.
            </p>
          </div>
        )}
        <label className="block">
          Medio
          <select
            className={control}
            value={medio}
            onChange={(ev) => {
              setMedio(ev.target.value);
              setConfirmado(false);
            }}
          >
            <option value="TRANSFERENCIA">
              Transferencia bancaria / cuenta de nómina
            </option>
            <option value="EFECTIVO">Efectivo</option>
          </select>
        </label>
        {medio === "TRANSFERENCIA" && (
          <>
            <p className="rounded-lg border border-orange-800 p-3">
              {cuenta
                ? `Destino del expediente: ${cuenta.banco} · ${cuenta.tipo} · cuenta terminada en ${String(cuenta.numero).slice(-4)} · titular ${cuenta.titular}`
                : "Completa primero banco, tipo y número de cuenta en Empleados."}
            </p>
            <label className="block">
              Referencia del giro bancario
              <input
                required
                maxLength={120}
                className={control}
                value={referencia}
                onChange={(ev) => setReferencia(ev.target.value)}
              />
            </label>
          </>
        )}
        <label className="block">
          Importe efectivamente pagado COP
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            max={
              p
                ? (p.datos.totalCentavos - p.datos.pagadoCentavos) / 100
                : undefined
            }
            className={control}
            value={monto}
            onChange={(ev) => setMonto(ev.target.value)}
          />
        </label>
        <label className="block">
          Fecha real del pago
          <input
            required
            type="date"
            max={hoy()}
            className={control}
            value={fechaPago}
            onChange={(ev) => setFechaPago(ev.target.value)}
          />
        </label>
        <label className="block">
          Soporte PDF del giro (hasta 5 MB; obligatorio en transferencia)
          <input
            type="file"
            required={medio === "TRANSFERENCIA"}
            accept="application/pdf"
            className={control}
            onChange={(ev) => setArchivo(ev.target.files?.[0] || null)}
          />
        </label>
        <p>
          Correo de destino:{" "}
          {e?.datos.email || p?.datos.empleado.email || "Selecciona un periodo"}
        </p>
        <label className="flex gap-2">
          <input
            required
            type="checkbox"
            checked={confirmado}
            onChange={(ev) => setConfirmado(ev.target.checked)}
          />
          El pago ya se realizó y revisé el importe, los conceptos, el soporte y
          el destino. Solicito enviar el comprobante al empleado.
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={
          busy ||
          (!pendiente &&
            (!p || !confirmado || (medio === "TRANSFERENCIA" && !cuenta)))
        }
        className="rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-40"
      >
        {busy
          ? "Registrando…"
          : pendiente
            ? "Reintentar la misma operación"
            : "Registrar pago y enviar comprobante"}
      </button>
    </form>
  );
}
