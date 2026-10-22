"use client";
import { useState } from "react";
import api from "@/lib/api";
type Evento = {
  id: number;
  descripcion: string;
  creadoEn: string;
  usuario?: { nombre: string };
};
export default function RegistroAperturaLlave({ cajaId }: { cajaId: number }) {
  const [abierto, setAbierto] = useState(false),
    [motivo, setMotivo] = useState(""),
    [error, setError] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [mensaje, setMensaje] = useState(""),
    [eventos, setEventos] = useState<Evento[]>([]);
  const mostrar = async () => {
    setAbierto(true);
    setError("");
    setMensaje("");
    try {
      const r = await api.get("/caja/eventos");
      setEventos(
        r.data
          .filter((e: Evento) => e.descripcion.startsWith("APERTURA CON LLAVE"))
          .slice(0, 8),
      );
    } catch {
      setEventos([]);
    }
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setError("");
    try {
      await api.post("/caja/apertura-con-llave", {
        cajaId,
        motivo: motivo.trim(),
      });
      setMotivo("");
      setMensaje(
        "Apertura registrada. El aviso se enviará a los administradores que tengan activadas las alertas de caja.",
      );
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          "No se pudo guardar. Conserva el motivo e intenta de nuevo cuando haya conexión.",
      );
    } finally {
      setOcupado(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={mostrar}
        className="ml-3 rounded-lg border border-amber-500/40 px-3 py-1 text-xs font-semibold text-amber-200"
      >
        Registrar apertura con llave
      </button>
      {abierto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-llave"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5 text-left text-gray-200"
          >
            <h2 id="titulo-llave" className="text-lg font-bold text-white">
              Apertura del cajón con llave
            </h2>
            <p className="my-3 text-sm text-gray-400">
              Registra una apertura que ya ocurrió. Tu usuario, la sede y la
              fecha quedarán en el historial. Este formulario no abre el cajón
              ni detecta la llave automáticamente.
            </p>
            {mensaje ? (
              <p
                role="status"
                className="rounded-lg bg-green-950 p-3 text-sm text-green-200"
              >
                {mensaje}
              </p>
            ) : (
              <form onSubmit={guardar}>
                <label className="text-sm">
                  Motivo
                  <textarea
                    required
                    minLength={5}
                    maxLength={300}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-800 p-3 text-white"
                    placeholder="Ejemplo: retirar un comprobante atascado"
                  />
                </label>
                {error && (
                  <p role="alert" className="my-2 text-sm text-red-300">
                    {error}
                  </p>
                )}
                <button
                  disabled={ocupado || motivo.trim().length < 5}
                  className="mt-3 w-full rounded-lg bg-orange-500 p-3 font-semibold text-white disabled:opacity-50"
                >
                  {ocupado
                    ? "Registrando…"
                    : "Registrar y avisar al administrador"}
                </button>
              </form>
            )}
            {!!eventos.length && (
              <div className="mt-4 border-t border-gray-700 pt-3">
                <h3 className="text-sm font-semibold">Reportes recientes</h3>
                {eventos.map((e) => (
                  <p key={e.id} className="mt-2 text-xs text-gray-400">
                    {new Date(e.creadoEn).toLocaleString("es-CO", {
                      timeZone: "America/Bogota",
                    })}{" "}
                    · {e.usuario?.nombre}
                    <br />
                    {e.descripcion}
                  </p>
                ))}
              </div>
            )}
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setAbierto(false)}
              className="mt-4 w-full rounded-lg bg-gray-800 p-3"
            >
              Cerrar
            </button>
          </section>
        </div>
      )}
    </>
  );
}
