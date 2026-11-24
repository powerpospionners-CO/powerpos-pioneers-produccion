"use client";
export type HorarioDia = {
  dia: number;
  abierto: boolean;
  apertura: string;
  cierre: string;
};
const dias = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const horas = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4),
    m = String((i % 4) * 15).padStart(2, "0");
  return {
    value: `${String(h).padStart(2, "0")}:${m}`,
    label: `${h % 12 || 12}:${m} ${h < 12 ? "a. m." : "p. m."}`,
  };
});
const input =
  "w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white disabled:opacity-40";
export default function HorariosAtencion({
  value,
  anterior,
  onChange,
}: {
  value: HorarioDia[] | null;
  anterior: string;
  onChange: (v: HorarioDia[]) => void;
}) {
  const rows =
    value ||
    dias.map((_, dia) => ({ dia, abierto: false, apertura: "", cierre: "" }));
  function cambiar(dia: number, patch: Partial<HorarioDia>) {
    onChange(rows.map((h) => (h.dia === dia ? { ...h, ...patch } : h)));
  }
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold">Horario de atención</h2>
      <p className="text-gray-400">
        Selecciona los días de atención y las horas de apertura y cierre. Los
        días sin marcar aparecerán cerrados.
      </p>
      {!value && anterior && (
        <p>
          Horario anterior: {anterior}. Se conserva hasta que configures los
          selectores.
        </p>
      )}
      {rows.map((h) => (
        <div
          key={h.dia}
          className="grid gap-3 rounded-lg border border-gray-800 p-3 sm:grid-cols-[140px_1fr_1fr]"
        >
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={h.abierto}
              onChange={(e) => cambiar(h.dia, { abierto: e.target.checked })}
            />
            {dias[h.dia]}
            {!h.abierto && (
              <span className="text-xs text-gray-400">Cerrado</span>
            )}
          </label>
          {(["apertura", "cierre"] as const).map((campo) => (
            <label key={campo}>
              {campo === "apertura" ? "Abre" : "Cierra"}
              <select
                aria-label={`${campo === "apertura" ? "Apertura" : "Cierre"} ${dias[h.dia]}`}
                className={input}
                disabled={!h.abierto}
                required={h.abierto}
                value={h[campo]}
                onChange={(e) => cambiar(h.dia, { [campo]: e.target.value })}
              >
                <option value="">Selecciona hora</option>
                {horas.map((hora) => (
                  <option key={hora.value} value={hora.value}>
                    {hora.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {h.abierto && h.apertura && h.cierre && h.cierre < h.apertura && (
            <p className="text-sm text-gray-400 sm:col-span-3">
              El cierre corresponde al día siguiente.
            </p>
          )}
        </div>
      ))}
      <button
        type="button"
        className="text-teal-300 underline disabled:opacity-40"
        disabled={!rows[0].abierto || !rows[0].apertura || !rows[0].cierre}
        onClick={() =>
          onChange(
            rows.map((h, i) => (i >= 1 && i <= 5 ? { ...rows[0], dia: i } : h)),
          )
        }
      >
        Copiar horario del lunes a martes–sábado
      </button>
      <p className="text-sm text-gray-400">
        El horario se publica en la tienda y lo utiliza el asistente para
        responder consultas.
      </p>
    </section>
  );
}
