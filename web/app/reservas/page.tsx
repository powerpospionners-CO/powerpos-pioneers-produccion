"use client";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/store/authStore";

type Reserva = {
  id: string;
  estado: string;
  fecha: string;
  hora: string;
  personas: number;
  nombre: string;
  telefono: string;
  correo: string;
  nota: string;
  motivo: string;
};
const etiquetas: Record<string, string> = {
  PENDIENTE: "Por confirmar",
  CONFIRMADA: "Confirmada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
  ASISTIO: "Asistió",
  NO_ASISTIO: "No asistió",
};
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default function Reservas() {
  const { usuario } = useAuthStore();
  const [reservas, setReservas] = useState<Reserva[]>([]),
    [filtro, setFiltro] = useState("PROXIMAS"),
    [motivos, setMotivos] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const permitido =
    !!usuario && ["ADMIN_EMPRESA", "GERENTE", "CAJERO"].includes(usuario.rol);
  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get("/tienda-admin/reservas");
      setReservas(data);
      setError("");
    } catch (e: any) {
      setError(e.response?.data?.message || "No se pudieron cargar las reservas");
    }
  }, []);
  useEffect(() => {
    if (!permitido) return;
    void cargar();
    const timer = setInterval(cargar, 15000);
    return () => clearInterval(timer);
  }, [permitido, cargar]);
  async function gestionar(id: string, accion: string) {
    setBusy(id);
    setError("");
    try {
      await api.patch(`/tienda-admin/reservas/${id}`, {
        accion,
        motivo: motivos[id] || undefined,
      });
      await cargar();
    } catch (e: any) {
      setError(e.response?.data?.message || "No se pudo actualizar la reserva");
    } finally {
      setBusy("");
    }
  }
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const visibles = reservas.filter((r) =>
    filtro === "PENDIENTE"
      ? r.estado === "PENDIENTE"
      : filtro === "PROXIMAS"
        ? r.fecha >= hoy && ["PENDIENTE", "CONFIRMADA"].includes(r.estado)
        : true,
  );
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-6xl p-5 md:p-9">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Reservas</h1>
              <p className="mt-2 text-gray-400">
                Solicitudes hechas desde la tienda en línea. Confirma o rechaza
                cada una; el cliente ve el estado con su enlace de seguimiento.
              </p>
            </div>
            <button onClick={cargar} className="rounded-lg border border-gray-600 px-4">
              Actualizar
            </button>
          </div>
          {!permitido ? (
            <p>No tienes acceso a las reservas.</p>
          ) : (
            <>
              {error && (
                <p role="alert" className="my-5 rounded-xl bg-red-950 p-4">
                  {error}
                </p>
              )}
              <label className="my-6 block">
                Mostrar{" "}
                <select
                  className="ml-3 rounded bg-gray-800 p-2"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                >
                  <option value="PROXIMAS">Próximas</option>
                  <option value="PENDIENTE">Por confirmar</option>
                  <option value="TODAS">Todas (últimos 6 meses)</option>
                </select>
              </label>
              {!visibles.length && <p className="text-gray-400">No hay reservas para mostrar.</p>}
              <div className="grid gap-5 lg:grid-cols-2">
                {visibles.map((r) => (
                  <article key={r.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h2 className="text-xl font-bold">{r.nombre}</h2>
                      <span className="rounded-full bg-gray-800 px-3 py-1 text-sm">
                        {etiquetas[r.estado] || r.estado}
                      </span>
                    </div>
                    <p className="text-lg">
                      <span className="capitalize">{fechaLarga(r.fecha)}</span> · {r.hora} · {r.personas}{" "}
                      {r.personas === 1 ? "persona" : "personas"}
                    </p>
                    <p className="text-gray-300">
                      <a className="underline" href={`tel:${r.telefono}`}>{r.telefono}</a>
                      {r.correo && <> · {r.correo}</>}
                    </p>
                    {r.nota && <p className="text-gray-300">Indicaciones: {r.nota}</p>}
                    {r.motivo && <p className="text-gray-400">Motivo: {r.motivo}</p>}
                    {["PENDIENTE", "CONFIRMADA"].includes(r.estado) && (
                      <div className="space-y-3">
                        <input
                          className="w-full rounded-lg border border-gray-700 bg-gray-950 p-2"
                          placeholder="Motivo (obligatorio para rechazar o cancelar)"
                          maxLength={300}
                          value={motivos[r.id] || ""}
                          onChange={(e) => setMotivos({ ...motivos, [r.id]: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          {(r.estado === "PENDIENTE"
                            ? [["CONFIRMAR", "Confirmar"], ["RECHAZAR", "Rechazar"]]
                            : [["ASISTIO", "Asistió"], ["NO_ASISTIO", "No asistió"], ["CANCELAR", "Cancelar"]]
                          ).map(([accion, texto]) => (
                            <button
                              key={accion}
                              disabled={busy === r.id}
                              onClick={() => gestionar(r.id, accion)}
                              className={`rounded-lg px-4 py-2 disabled:opacity-50 ${accion === "CONFIRMAR" || accion === "ASISTIO" ? "bg-teal-700" : "border border-gray-600"}`}
                            >
                              {texto}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
