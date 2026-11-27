"use client";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

type Miembro = { id: number; nombre: string; email: string; rol: string; dosPasos: boolean; propio: boolean };
type Pendiente = { tipo: "politica"; exigir: boolean } | { tipo: "restablecer"; id: number; nombre: string };
const card = "rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4";
const input = "mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
const boton = "rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-50";
const ROLES: Record<string, string> = { ADMIN_EMPRESA: "Administrador", GERENTE: "Gerente", CAJERO: "Cajero", COCINERO: "Cocinero", DOMICILIARIO: "Domiciliario", DISTRIBUIDOR: "Distribuidor" };

// Solo para el administrador de la empresa: exigir 2FA y restablecerla a quien perdió el teléfono.
export default function EquipoSeguridad({ politica, dosPasosPropia, onCambio }: { politica: boolean; dosPasosPropia: boolean; onCambio: () => Promise<void> }) {
  const [equipo, setEquipo] = useState<Miembro[] | null>(null),
    [pendiente, setPendiente] = useState<Pendiente | null>(null),
    [confirmacion, setConfirmacion] = useState({ password: "", codigo: "" }),
    [busy, setBusy] = useState(false),
    [mensaje, setMensaje] = useState(""),
    [error, setError] = useState("");
  const cargar = useCallback(async () => {
    try {
      setEquipo((await api.get("/auth/seguridad/equipo")).data);
    } catch (e: any) {
      setError(e.response?.data?.message || "No se pudo cargar el equipo");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const pedir = (p: Pendiente) => {
    setPendiente(p);
    setConfirmacion({ password: "", codigo: "" });
    setError("");
    setMensaje("");
  };
  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!pendiente) return;
    setBusy(true);
    setError("");
    try {
      if (pendiente.tipo === "politica") {
        await api.post("/auth/seguridad/politica", { exigir: pendiente.exigir, ...confirmacion });
        setMensaje(pendiente.exigir ? "Ahora los gerentes también deben usar la verificación en dos pasos." : "La verificación en dos pasos vuelve a ser opcional para los gerentes.");
        await onCambio();
      } else {
        await api.post(`/auth/seguridad/equipo/${pendiente.id}/restablecer-2fa`, confirmacion);
        setMensaje(`Restablecimos la verificación de ${pendiente.nombre}. Cerramos sus sesiones. El aviso se envía a su correo personal si está configurado.`);
        await cargar();
      }
      setPendiente(null);
    } catch (e: any) {
      setError(e.response?.data?.message || "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={card}>
      <h2 className="text-xl font-bold">Seguridad del equipo</h2>
      {mensaje && <p role="status" className="rounded-lg bg-teal-900 p-3">{mensaje}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-950 p-3">{error}</p>}
      <label className="flex gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={politica}
          disabled={busy || (!politica && !dosPasosPropia)}
          onChange={(e) => pedir({ tipo: "politica", exigir: e.target.checked })}
        />
        <span>
          Exigir la verificación en dos pasos también a los gerentes
          <span className="block text-sm text-gray-400">
            {!politica && !dosPasosPropia
              ? "Primero activa tu propia verificación en dos pasos."
              : "Quien no la tenga solo podrá entrar a esta página hasta activarla. Aplica en todas las sedes."}
          </span>
        </span>
      </label>

      {pendiente && (
        <form onSubmit={confirmar} className="space-y-3 rounded-lg border border-amber-600 bg-amber-950/30 p-4">
          <p className="font-bold">
            {pendiente.tipo === "politica"
              ? pendiente.exigir ? "Exigir la verificación en dos pasos" : "Volver opcional la verificación en dos pasos"
              : `Restablecer la verificación de ${pendiente.nombre}`}
          </p>
          {pendiente.tipo === "restablecer" && (
            <p className="text-sm text-gray-300">
              Hazlo solo si confirmaste con esa persona que perdió el teléfono y sus códigos. Cerraremos sus sesiones y deberá activarla de nuevo.
            </p>
          )}
          <p className="text-sm text-gray-400">Confirma que eres tú.</p>
          <label className="block">Tu contraseña<input type="password" required autoComplete="current-password" className={input} value={confirmacion.password} onChange={(e) => setConfirmacion({ ...confirmacion, password: e.target.value })} /></label>
          {dosPasosPropia && (
            <label className="block">Código de tu app<input required autoComplete="one-time-code" maxLength={11} className={input} value={confirmacion.codigo} onChange={(e) => setConfirmacion({ ...confirmacion, codigo: e.target.value })} /></label>
          )}
          <div className="flex gap-3">
            <button className="rounded-lg bg-teal-700 px-4 py-2 disabled:opacity-50" disabled={busy}>Confirmar</button>
            <button type="button" className={boton} onClick={() => setPendiente(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div>
        <h3 className="font-bold">Usuarios</h3>
        {!equipo && !error && <p className="text-gray-400">Cargando…</p>}
        <ul className="divide-y divide-gray-800">
          {equipo?.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <strong>{m.nombre}</strong> <span className="text-sm text-gray-400">· {ROLES[m.rol] || m.rol}</span>
                <span className="block text-sm text-gray-400">{m.email}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className={m.dosPasos ? "text-teal-300" : "text-gray-400"}>{m.dosPasos ? "2FA activa" : "Sin 2FA"}</span>
                {m.dosPasos && !m.propio && (
                  <button type="button" className={boton} disabled={busy} onClick={() => pedir({ tipo: "restablecer", id: m.id, nombre: m.nombre })}>
                    Restablecer
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
