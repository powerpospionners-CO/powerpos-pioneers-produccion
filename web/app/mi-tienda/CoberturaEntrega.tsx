"use client";
import { useState } from "react";
type Zona = { id?: string; ciudad?: string; nombre: string; costo: number };
const input =
  "w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
export default function CoberturaEntrega({
  ciudades,
  zonas,
  onChange,
}: {
  ciudades: string[];
  zonas: Zona[];
  onChange: (ciudades: string[], zonas: Zona[]) => void;
}) {
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const cambiar = (i: number, patch: Partial<Zona>) =>
    onChange(
      ciudades,
      zonas.map((z, j) => (i === j ? { ...z, ...patch } : z)),
    );
  function agregarCiudad() {
    const nombre = nueva.trim();
    if (
      !nombre ||
      ciudades.some(
        (c) => c.toLocaleLowerCase("es") === nombre.toLocaleLowerCase("es"),
      )
    ) {
      setError("Escribe una ciudad nueva sin repetir las existentes.");
      return;
    }
    onChange([...ciudades, nombre], zonas);
    setNueva("");
    setError("");
  }
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-5">
      <h2 className="text-xl font-bold">
        Ciudades, zonas y tarifas de entrega
      </h2>
      <div className="space-y-3">
        <h3 className="font-semibold">Ciudades de entrega</h3>
        <p className="text-sm text-gray-400">
          Agrega las ciudades atendidas por esta empresa. El cliente
          seleccionará primero su ciudad y después su zona o barrio.
        </p>
        <div className="flex flex-wrap gap-3">
          {ciudades.map((c) => (
            <div
              key={c}
              className="rounded-lg border border-gray-700 px-3 py-2"
            >
              {c}{" "}
              <button
                type="button"
                className="ml-3 text-red-300 disabled:opacity-30"
                disabled={zonas.some((z) => z.ciudad === c)}
                title={
                  zonas.some((z) => z.ciudad === c)
                    ? "Reasigna o elimina primero las zonas de esta ciudad"
                    : "Quitar ciudad"
                }
                aria-label={`Quitar ciudad ${c}`}
                onClick={() =>
                  onChange(
                    ciudades.filter((v) => v !== c),
                    zonas,
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <label className="grow">
            Nueva ciudad
            <input
              className={input}
              maxLength={80}
              value={nueva}
              placeholder="Ej. Pereira o Dosquebradas"
              onChange={(e) => setNueva(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded-lg border border-teal-700 px-4 py-3"
            disabled={!nueva.trim() || ciudades.length >= 30}
            onClick={agregarCiudad}
          >
            Agregar ciudad
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
      <h3 className="font-semibold">Zonas y tarifas por ciudad</h3>
      {zonas.map((z, i) => (
        <div
          key={z.id || i}
          className="grid gap-3 rounded-lg border border-gray-800 p-4 sm:grid-cols-2"
        >
          <label>
            Ciudad
            <select
              className={input}
              required={ciudades.length > 0}
              value={z.ciudad || ""}
              onChange={(e) => cambiar(i, { ciudad: e.target.value })}
            >
              <option value="">Selecciona ciudad</option>
              {ciudades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zona o barrio
            <input
              className={input}
              required
              maxLength={80}
              value={z.nombre}
              placeholder="Ej. Centro o Todas las zonas"
              onChange={(e) => cambiar(i, { nombre: e.target.value })}
            />
          </label>
          <label>
            Tarifa de domicilio (COP)
            <input
              className={input}
              required
              type="number"
              min={0}
              step="0.01"
              value={z.costo}
              onChange={(e) => cambiar(i, { costo: Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            className="self-end rounded-lg border border-red-900 p-3 text-red-300"
            aria-label={`Eliminar zona ${z.nombre} de ${z.ciudad || "sin ciudad"}`}
            onClick={() =>
              onChange(
                ciudades,
                zonas.filter((_, j) => j !== i),
              )
            }
          >
            Eliminar zona
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-teal-300 underline disabled:opacity-40"
        disabled={zonas.length >= 30}
        onClick={() =>
          onChange(ciudades, [
            ...zonas,
            {
              id: crypto.randomUUID(),
              ciudad: ciudades[0] || "",
              nombre: "Todas las zonas",
              costo: 0,
            },
          ])
        }
      >
        + Agregar zona
      </button>
      <p className="text-sm text-gray-400">
        Usa «Todas las zonas» cuando la misma tarifa aplique a toda la ciudad.
        Guarda la tienda para publicar los cambios.
      </p>
    </section>
  );
}
