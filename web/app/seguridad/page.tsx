"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import api from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { useNotificar } from "@/components/Notificaciones";
import { useAuthStore } from "@/store/authStore";
import EquipoSeguridad from "./EquipoSeguridad";

type Resumen = {
  correoPersonal?: string;
  dosPasos: boolean;
  dosPasosRecomendado: boolean;
  dosPasosObligatorio?: boolean;
  politicaEmpresa?: boolean;
  sesiones: { id: string; actual: boolean; dispositivo: string; ip: string; creadoEn: string }[];
};
const card = "rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4";
const input = "mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
const boton = "rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-50";
const primario = "rounded-lg bg-teal-700 px-4 py-2 disabled:opacity-50";

export default function Seguridad() {
  const { confirmar } = useNotificar();
  const { usuario } = useAuthStore();
  const [resumen, setResumen] = useState<Resumen | null>(null),
    [configurando, setConfigurando] = useState<{ secreto: string; qr: string } | null>(null),
    [contacto, setContacto] = useState({ correo: "", password: "", codigo: "" }),
    [codigo, setCodigo] = useState(""),
    [recuperacion, setRecuperacion] = useState<string[] | null>(null),
    [desactivar, setDesactivar] = useState({ password: "", codigo: "" }),
    [busy, setBusy] = useState(false),
    [mensaje, setMensaje] = useState(""),
    [error, setError] = useState("");
  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/seguridad");
      setResumen(data);
      setContacto((c) => ({ ...c, correo: data.correoPersonal || "" }));
    } catch (e: any) {
      setError(e.response?.data?.message || "No se pudo cargar la seguridad de la cuenta");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  async function accion(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMensaje("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.response?.data?.message || "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-3xl space-y-6 p-5 md:p-9">
          <div>
            <h1 className="text-3xl font-bold">Seguridad de mi cuenta</h1>
            <p className="mt-2 text-gray-400">
              Protege el acceso con un segundo paso y revisa dónde está abierta tu sesión.
            </p>
          </div>
          {resumen?.dosPasosObligatorio && !resumen.dosPasos && (
            <p role="alert" className="rounded-xl border border-amber-600 bg-amber-950/50 p-4">
              Tu cuenta requiere la verificación en dos pasos. Actívala aquí para seguir usando el panel.
            </p>
          )}
          {mensaje && <p role="status" className="rounded-xl bg-teal-900 p-4">{mensaje}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-950 p-4">{error}</p>}
          {resumen && (
            <>
              <section className={card}>
                <h2 className="text-xl font-bold">Correo personal para avisos de seguridad</h2>
                <p className="text-gray-400">Es distinto del correo para iniciar sesión. Aquí recibirás los avisos de nuevos accesos y restablecimiento de verificación en dos pasos. Si no lo configuras, no enviaremos esos avisos al correo de acceso.</p>
                <form className="space-y-3" onSubmit={(e) => {
                  e.preventDefault();
                  void accion(async () => {
                    await api.post("/auth/seguridad/correo-personal", contacto);
                    setContacto((c) => ({ ...c, password: "", codigo: "" }));
                    await cargar();
                    setMensaje("Correo personal guardado para tus avisos de seguridad.");
                  });
                }}>
                  <label className="block">Correo personal<input type="email" autoComplete="email" maxLength={254} className={input} disabled={busy} value={contacto.correo} onChange={(e) => setContacto({ ...contacto, correo: e.target.value })} /></label>
                  <label className="block">Tu contraseña para confirmar<input type="password" required autoComplete="current-password" className={input} disabled={busy} value={contacto.password} onChange={(e) => setContacto({ ...contacto, password: e.target.value })} /></label>
                  {resumen.dosPasos && <label className="block">Código de tu app<input required autoComplete="one-time-code" maxLength={11} className={input} disabled={busy} value={contacto.codigo} onChange={(e) => setContacto({ ...contacto, codigo: e.target.value })} /></label>}
                  <button type="submit" className={primario} disabled={busy}>Guardar correo personal</button>
                </form>
              </section>
              <section className={card}>
                <h2 className="text-xl font-bold">Verificación en dos pasos</h2>
                {resumen.dosPasos ? (
                  <>
                    <p className="text-teal-300">Activa. Al iniciar sesión se pide un código de tu app de autenticación.</p>
                    {resumen.dosPasosObligatorio ? (
                      <p className="text-sm text-gray-400">Es obligatoria para tu cuenta, así que no se puede desactivar.</p>
                    ) : (
                    <form
                      className="space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void accion(async () => {
                          await api.post("/auth/seguridad/2fa/desactivar", desactivar);
                          setDesactivar({ password: "", codigo: "" });
                          setMensaje("Verificación en dos pasos desactivada.");
                          await cargar();
                        });
                      }}
                    >
                      <p className="text-sm text-gray-400">Para desactivarla confirma tu contraseña y un código vigente.</p>
                      <label className="block">Contraseña<input type="password" required autoComplete="current-password" className={input} value={desactivar.password} onChange={(e) => setDesactivar({ ...desactivar, password: e.target.value })} /></label>
                      <label className="block">Código<input required autoComplete="one-time-code" maxLength={11} className={input} value={desactivar.codigo} onChange={(e) => setDesactivar({ ...desactivar, codigo: e.target.value })} /></label>
                      <button className={boton} disabled={busy}>Desactivar</button>
                    </form>
                    )}
                  </>
                ) : configurando ? (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void accion(async () => {
                        const { data } = await api.post("/auth/seguridad/2fa/activar", { codigo: codigo.trim() });
                        setRecuperacion(data.recuperacion);
                        setConfigurando(null);
                        setCodigo("");
                        await cargar();
                      });
                    }}
                  >
                    <ol className="list-decimal space-y-2 pl-5 text-gray-300">
                      <li>Instala Google Authenticator, Microsoft Authenticator u otra app de códigos.</li>
                      <li>Escanea este código QR con la app.</li>
                      <li>Escribe el código de 6 dígitos que muestra la app.</li>
                    </ol>
                    <img src={configurando.qr} alt="Código QR para la app de autenticación" className="h-56 w-56 rounded-lg bg-white p-2" />
                    <p className="text-sm text-gray-400">
                      ¿No puedes escanear? Escribe esta clave en la app: <code className="break-all text-white">{configurando.secreto}</code>
                    </p>
                    <label className="block">Código de la app<input required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" className={input} value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
                    <div className="flex gap-3">
                      <button className={primario} disabled={busy}>Activar</button>
                      <button type="button" className={boton} onClick={() => setConfigurando(null)}>Cancelar</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="text-gray-300">
                      {resumen.dosPasosRecomendado
                        ? "Recomendada para tu rol: aunque alguien conozca tu contraseña, no podrá entrar sin tu teléfono."
                        : "Agrega un segundo paso para que tu contraseña sola no baste para entrar."}
                    </p>
                    <button
                      className={primario}
                      disabled={busy}
                      onClick={() =>
                        void accion(async () => {
                          const { data } = await api.post("/auth/seguridad/2fa/iniciar");
                          setConfigurando({ secreto: data.secreto, qr: await QRCode.toDataURL(data.uri, { width: 320, margin: 1 }) });
                        })
                      }
                    >
                      Activar verificación en dos pasos
                    </button>
                  </>
                )}
                {recuperacion && (
                  <div className="space-y-3 rounded-lg border border-amber-600 bg-amber-950/40 p-4">
                    <p className="font-bold">Guarda estos códigos de recuperación</p>
                    <p className="text-sm text-gray-300">
                      Cada uno sirve una sola vez si pierdes el teléfono. No se volverán a mostrar.
                    </p>
                    <ul className="grid grid-cols-2 gap-2 font-mono">
                      {recuperacion.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className={boton} onClick={() => {
                        const texto = [
                          "PowerPOS - Códigos de recuperación",
                          "Cada código sirve una sola vez para acceder si pierdes tu teléfono.",
                          "Guarda este archivo en un lugar privado. No compartas estos códigos.",
                          "",
                          ...recuperacion,
                          "",
                        ].join("\r\n");
                        const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
                        const enlace = document.createElement("a");
                        enlace.href = url;
                        enlace.download = "PowerPOS-codigos-recuperacion.txt";
                        document.body.appendChild(enlace);
                        enlace.click();
                        enlace.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}>Descargar códigos (.txt)</button>
                      <button type="button" className={boton} onClick={() => setRecuperacion(null)}>Ya los guardé</button>
                      {resumen.dosPasosObligatorio && (
                        <Link href={usuario?.rol === "SUPERADMIN" ? "/superadmin" : "/"} className="rounded-lg bg-teal-700 px-4 py-2">Continuar al panel</Link>
                      )}
                    </div>
                  </div>
                )}
              </section>
              {resumen.politicaEmpresa !== undefined && (
                <EquipoSeguridad politica={resumen.politicaEmpresa} dosPasosPropia={resumen.dosPasos} onCambio={cargar} />
              )}
              <section className={card}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Sesiones abiertas</h2>
                  {resumen.sesiones.length > 1 && (
                    <button
                      className={boton}
                      disabled={busy}
                      onClick={async () => {
                        if (await confirmar("Se cerrarán todas las sesiones excepto esta.", { titulo: "Cerrar otras sesiones", textoConfirmar: "Cerrar sesiones", peligroso: true }))
                          void accion(async () => {
                            await api.post("/auth/seguridad/sesiones/cerrar-otras");
                            setMensaje("Cerramos las demás sesiones.");
                            await cargar();
                          });
                      }}
                    >
                      Cerrar las demás
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-400">
                  Sesiones iniciadas en las últimas 8 horas. Si inicias sesión desde un dispositivo nuevo te avisaremos por correo.
                </p>
                {!resumen.sesiones.length && <p className="text-gray-400">Tu sesión actual empezó antes de activar este registro; aparecerá al volver a iniciar sesión.</p>}
                <ul className="divide-y divide-gray-800">
                  {resumen.sesiones.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span>
                        <strong>{s.dispositivo}</strong>
                        {s.actual && <span className="ml-2 rounded-full bg-teal-800 px-2 py-0.5 text-xs">Esta sesión</span>}
                        <span className="block text-sm text-gray-400">
                          {new Date(s.creadoEn).toLocaleString("es-CO")} · IP {s.ip || "no disponible"}
                        </span>
                      </span>
                      {!s.actual && (
                        <button
                          className={boton}
                          disabled={busy}
                          onClick={() =>
                            void accion(async () => {
                              await api.delete(`/auth/seguridad/sesiones/${s.id}`);
                              setMensaje("Sesión cerrada.");
                              await cargar();
                            })
                          }
                        >
                          Cerrar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
