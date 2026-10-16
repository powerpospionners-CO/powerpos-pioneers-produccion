"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import axios from "axios";
import api from "@/lib/api";

type Gasto = {
  id: number;
  nombre: string;
  tercero: string;
  categoria: string;
  monto: string;
  diaVencimiento: number;
  activo: boolean;
};
const categorias = [
  "ARRIENDO",
  "SERVICIOS",
  "NOMINA",
  "MANTENIMIENTO",
  "IMPUESTOS",
  "OTROS",
];
const campo =
  "block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2";
const boton = "rounded-lg bg-orange-600 px-4 py-2 disabled:opacity-50";
const dinero = (monto: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  }).format(Number(monto));
const mesActual = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" })
    .format(new Date())
    .slice(0, 7);

export default function GastosRecurrentes({
  administrador,
  alGenerar,
}: {
  administrador: boolean;
  alGenerar: () => Promise<void>;
}) {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [periodo, setPeriodo] = useState(mesActual);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const cargar = useCallback(async () => {
    const r = await api.get<Gasto[]>("/administracion/recurrentes");
    setGastos(r.data);
  }, []);
  const mostrarError = (e: unknown) =>
    setError(
      axios.isAxiosError(e)
        ? String(
            e.response?.data?.message ||
              "No fue posible completar la operación.",
          )
        : "No fue posible completar la operación.",
    );
  useEffect(() => {
    void cargar().catch(mostrarError);
  }, [cargar]);
  async function ejecutar(tarea: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      await tarea();
      await cargar();
    } catch (e) {
      mostrarError(e);
    } finally {
      setOcupado(false);
    }
  }
  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const datos = new FormData(formulario);
    await ejecutar(async () => {
      await api.post("/administracion/recurrentes", {
        nombre: datos.get("nombre"),
        tercero: datos.get("tercero"),
        categoria: datos.get("categoria"),
        monto: datos.get("monto"),
        diaVencimiento: Number(datos.get("dia")),
      });
      formulario.reset();
      setAviso(
        "Plantilla guardada. Todavía no se ha registrado ninguna obligación ni pago.",
      );
    });
  }
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Gastos recurrentes mensuales</h2>
        <p className="mt-2 text-sm text-gray-400">
          Prepara arriendos, servicios y otras obligaciones. Generar un mes crea
          una cuenta por pagar; el dinero solo se descuenta al registrar abonos.
          Si el día no existe en ese mes, vence el último día.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-200">
          {error}
        </p>
      )}
      {aviso && (
        <p
          role="status"
          className="rounded-lg bg-emerald-950 p-3 text-emerald-200"
        >
          {aviso}
        </p>
      )}
      {administrador && (
        <form
          onSubmit={crear}
          className="grid gap-3 rounded-xl border border-gray-800 p-4 md:grid-cols-3"
        >
          <label>
            Nombre de la plantilla
            <input
              required
              name="nombre"
              maxLength={100}
              className={campo}
              placeholder="Arriendo sucursal Centro"
            />
          </label>
          <label>
            Tercero
            <input required name="tercero" maxLength={250} className={campo} />
          </label>
          <label>
            Categoría
            <select name="categoria" className={campo}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor mensual
            <input
              required
              name="monto"
              type="number"
              step="0.01"
              min="0.01"
              max="99999999.99"
              className={campo}
            />
          </label>
          <label>
            Día de vencimiento
            <input
              required
              name="dia"
              type="number"
              min="1"
              max="31"
              step="1"
              className={campo}
            />
          </label>
          <button disabled={ocupado} className={`${boton} self-end`}>
            Guardar plantilla
          </button>
        </form>
      )}
      <label className="block max-w-xs">
        Mes que se generará
        <input
          type="month"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className={campo}
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        {gastos.map((gasto) => (
          <article
            key={gasto.id}
            className="space-y-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4"
          >
            <h3 className="font-semibold">
              {gasto.nombre}
              {!gasto.activo && " (Inactivo)"}
            </h3>
            <p className="text-sm text-gray-400">
              {gasto.tercero} · {gasto.categoria}
            </p>
            <p>
              {dinero(gasto.monto)} · vence el día {gasto.diaVencimiento}
            </p>
            {administrador && (
              <div className="flex flex-wrap gap-3">
                {gasto.activo && (
                  <button
                    disabled={ocupado || !periodo}
                    className={boton}
                    onClick={() =>
                      void ejecutar(async () => {
                        const r = await api.post(
                          `/administracion/recurrentes/${gasto.id}/generar`,
                          { periodo },
                        );
                        setAviso(
                          r.data.creada
                            ? `Obligación ${r.data.cuenta.documento} generada. Puedes pagarla desde Cuentas y abonos.`
                            : `El mes ${periodo} ya tiene una cuenta: ${r.data.cuenta.documento}${r.data.cuenta.anulada ? " (anulada)" : ""}. No se duplicó.`,
                        );
                        await alGenerar();
                      })
                    }
                  >
                    Generar {periodo}
                  </button>
                )}
                <button
                  disabled={ocupado}
                  className="text-orange-300"
                  onClick={() => {
                    const monto = window.prompt(
                      "Nuevo valor mensual. Solo afecta meses que aún no se hayan generado.",
                      gasto.monto,
                    );
                    if (monto)
                      void ejecutar(async () => {
                        await api.patch(
                          `/administracion/recurrentes/${gasto.id}`,
                          { monto },
                        );
                        setAviso(
                          "Valor actualizado. Las obligaciones existentes conservan su importe.",
                        );
                      });
                  }}
                >
                  Cambiar valor
                </button>
                <button
                  disabled={ocupado}
                  className="text-gray-300"
                  onClick={() =>
                    void ejecutar(async () => {
                      await api.patch(
                        `/administracion/recurrentes/${gasto.id}`,
                        { activo: !gasto.activo },
                      );
                      setAviso("Estado de la plantilla actualizado.");
                    })
                  }
                >
                  {gasto.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!gastos.length && (
        <p className="text-sm text-gray-400">
          No hay plantillas registradas. Se muestran hasta 500.
        </p>
      )}
    </section>
  );
}
