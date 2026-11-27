"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useNotificar } from "@/components/Notificaciones";

const input = "mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
const boton = "rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-50";
const card = "rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4";
type Resumen = {
  correoDisponible: boolean;
  suscriptoresConCorreo: number;
  plantillas: { id: string; nombre: string; asunto: string; mensaje: string }[];
  cupones: { codigo: string; descripcion: string }[];
  historial: { id: string; asunto: string; destinatarios: number; enviados: number; fallidos: number; estado: string; fecha: string }[];
};

// Campañas por correo a los suscriptores del boletín (solo quienes autorizaron recibir novedades).
export default function CampanasCorreo() {
  const { confirmar } = useNotificar();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [form, setForm] = useState({ segmento: "TODOS", dias: 30, asunto: "", mensaje: "", cupon: "" });
  const [destinatarios, setDestinatarios] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const cargar = () => api.get("/tienda-admin/campanas").then(({ data }) => setResumen(data)).catch(() => setResumen(null));
  useEffect(() => { void cargar(); }, []);
  useEffect(() => {
    setDestinatarios(null);
    const t = setTimeout(() => api.post("/tienda-admin/campanas/vista-previa", { segmento: form.segmento, dias: form.dias }).then(({ data }) => setDestinatarios(data.destinatarios)).catch(() => setDestinatarios(null)), 300);
    return () => clearTimeout(t);
  }, [form.segmento, form.dias]);
  if (!resumen) return null;
  const usarPlantilla = (id: string) => {
    const p = resumen.plantillas.find((x) => x.id === id);
    if (p) setForm({ ...form, asunto: p.asunto, mensaje: p.mensaje });
  };
  const enviar = async () => {
    if (!(await confirmar(`Se enviará "${form.asunto}" a ${destinatarios ?? 0} suscriptores. Después debes esperar 12 horas para otra campaña.`, { titulo: "Enviar campaña", textoConfirmar: "Enviar" }))) return;
    setOcupado(true); setAviso(null);
    try {
      const { data } = await api.post("/tienda-admin/campanas", { ...form, cupon: form.cupon || undefined }, { timeout: 600000 });
      setAviso({ ok: true, texto: `Campaña enviada: ${data.enviados} correos entregados al servidor${data.fallidos ? `, ${data.fallidos} con error` : ""}.` });
      setForm({ ...form, asunto: "", mensaje: "" });
      void cargar();
    } catch (e: any) {
      setAviso({ ok: false, texto: e?.response?.data?.message || "No se pudo enviar la campaña" });
    } finally { setOcupado(false); }
  };
  const listo = form.asunto.trim().length >= 5 && form.mensaje.trim().length >= 10 && !!destinatarios;
  return (
    <section className={card}>
      <h2 className="text-xl font-bold">Campañas por correo</h2>
      <p className="text-gray-400">Envía novedades, promociones o un &quot;te extrañamos&quot; a los suscriptores de tu boletín. Solo reciben quienes autorizaron tus novedades, y cada correo trae su enlace para darse de baja.</p>
      {!resumen.correoDisponible && <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">El correo del sistema no está configurado; no se pueden enviar campañas.</p>}
      <p className="text-sm text-gray-400">Suscriptores con correo: <strong className="text-white">{resumen.suscriptoresConCorreo}</strong></p>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm text-gray-300">Plantilla
          <select className={input} defaultValue="" onChange={(e) => usarPlantilla(e.target.value)}>
            <option value="">Escribir desde cero</option>
            {resumen.plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-300">¿A quién?
          <select className={input} value={form.segmento} onChange={(e) => setForm({ ...form, segmento: e.target.value })}>
            <option value="TODOS">Todos los suscriptores</option>
            <option value="NUEVOS">Suscritos en los últimos días</option>
            <option value="ANTIGUOS">Suscritos hace más tiempo</option>
          </select>
        </label>
        {form.segmento !== "TODOS" && (
          <label className="text-sm text-gray-300">Días
            <input type="number" min={1} max={365} className={input} value={form.dias} onChange={(e) => setForm({ ...form, dias: Number(e.target.value) || 1 })} />
          </label>
        )}
      </div>
      <label className="block text-sm text-gray-300">Asunto
        <input className={input} maxLength={120} placeholder="Ej.: Te extrañamos en {empresa}" value={form.asunto} onChange={(e) => setForm({ ...form, asunto: e.target.value })} />
      </label>
      <label className="block text-sm text-gray-300">Mensaje
        <textarea className={`${input} min-h-32`} maxLength={2000} placeholder="Puedes usar {nombre} y {empresa}." value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} />
      </label>
      <label className="block text-sm text-gray-300">Cupón (opcional)
        <select className={input} value={form.cupon} onChange={(e) => setForm({ ...form, cupon: e.target.value })}>
          <option value="">Sin cupón</option>
          {resumen.cupones.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo}{c.descripcion ? ` · ${c.descripcion}` : ""}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={ocupado || !listo || !resumen.correoDisponible} onClick={() => void enviar()} className="rounded-lg bg-orange-500 px-4 py-2 font-bold text-white disabled:opacity-50">
          {ocupado ? "Enviando…" : `Enviar a ${destinatarios ?? "…"} suscriptores`}
        </button>
        <span className="text-xs text-gray-500">Máximo 2.000 correos por campaña y una campaña cada 12 horas.</span>
      </div>
      {aviso && <p role="status" className={aviso.ok ? "text-teal-300" : "text-red-300"}>{aviso.texto}</p>}

      {resumen.historial.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-gray-500"><th className="px-4 py-3 font-medium">Campaña</th><th className="px-4 py-3 font-medium">Fecha</th><th className="px-4 py-3 text-right font-medium">Enviados</th><th className="px-4 py-3 text-right font-medium">Con error</th></tr></thead>
            <tbody>
              {resumen.historial.map((h) => (
                <tr key={h.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 text-white">{h.asunto}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(h.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.enviados} de {h.destinatarios}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.fallidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
