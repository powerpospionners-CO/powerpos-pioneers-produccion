"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import axios from "axios";
import api from "@/lib/api";

type Producto = {
  id: number;
  nombre: string;
  stockActual: number;
  controlaStock: boolean;
  esCombo: boolean;
};
type Linea = {
  productoId: number;
  productoNombre: string;
  stockEsperado: number;
  stockContado: string;
};
type Conteo = {
  id: number;
  descripcion: string;
  estado: string;
  creadoEn: string;
  motivoResolucion: string | null;
  detalles: {
    productoId: number;
    productoNombre: string;
    stockEsperado: number;
    stockContado: number;
  }[];
};
const campo = "rounded-lg border border-gray-700 bg-gray-950 px-3 py-2";
const boton = "rounded-lg bg-orange-600 px-4 py-2 disabled:opacity-50";

export default function ConteosInventario({
  administrador,
}: {
  administrador: boolean;
}) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [descripcion, setDescripcion] = useState("");
  const [productoId, setProductoId] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const cargar = useCallback(async () => {
    const [p, c] = await Promise.all([
      api.get<Producto[]>("/productos"),
      api.get<Conteo[]>("/administracion/conteos"),
    ]);
    setProductos(p.data.filter((p) => p.controlaStock && !p.esCombo));
    setConteos(c.data);
  }, []);
  const mostrarError = (e: unknown) =>
    setError(
      axios.isAxiosError(e)
        ? String(
            e.response?.data?.message || "No se pudo completar la operación.",
          )
        : "No se pudo completar la operación.",
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
    await ejecutar(async () => {
      await api.post("/administracion/conteos", {
        descripcion,
        items: lineas.map((l) => ({
          productoId: l.productoId,
          stockEsperado: l.stockEsperado,
          stockContado: Number(l.stockContado),
        })),
      });
      setLineas([]);
      setDescripcion("");
      setAviso(
        "Conteo enviado para aprobación. No se modificaron existencias todavía.",
      );
    });
  }
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Conteos físicos y aprobación</h2>
        <p className="mt-2 text-sm text-amber-200">
          Cuenta el inventario actual de la empresa en su sede. Suspende ventas,
          compras y ajustes de los productos contados hasta resolver el conteo.
          Si el stock cambia, el sistema exigirá contar otra vez. Las cantidades
          deben estar en la unidad base, incluidos gramos o mililitros para
          granel.
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
      <form
        onSubmit={crear}
        className="space-y-3 rounded-xl border border-gray-800 p-4"
      >
        <label className="block">
          Descripción
          <input
            className={`${campo} block w-full`}
            required
            maxLength={500}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex-1">
            Producto
            <select
              className={`${campo} block w-full`}
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
            >
              <option value="">Selecciona un producto</option>
              {productos
                .filter((p) => !lineas.some((l) => l.productoId === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · sistema: {p.stockActual}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={ocupado || !productoId || lineas.length >= 200}
            className={`${boton} self-end`}
            onClick={() => {
              const p = productos.find((p) => p.id === Number(productoId));
              if (p)
                setLineas((actuales) => [
                  ...actuales,
                  {
                    productoId: p.id,
                    productoNombre: p.nombre,
                    stockEsperado: p.stockActual,
                    stockContado: "",
                  },
                ]);
              setProductoId("");
            }}
          >
            Agregar
          </button>
        </div>
        {lineas.map((l) => (
          <div
            key={l.productoId}
            className="flex flex-wrap items-center gap-3 border-t border-gray-800 py-3"
          >
            <div className="flex-1">
              <p>{l.productoNombre}</p>
              <p className="text-xs text-gray-400">
                Sistema al iniciar: {l.stockEsperado}
                {l.stockContado !== "" &&
                  ` · Diferencia: ${Number(l.stockContado) - l.stockEsperado}`}
              </p>
            </div>
            <label className="text-sm">
              Contado físicamente
              <input
                required
                type="number"
                min="0"
                max="9999999"
                step="1"
                value={l.stockContado}
                onChange={(e) =>
                  setLineas((actuales) =>
                    actuales.map((a) =>
                      a.productoId === l.productoId
                        ? { ...a, stockContado: e.target.value }
                        : a,
                    ),
                  )
                }
                className={`${campo} block w-36`}
              />
            </label>
            <button
              type="button"
              disabled={ocupado}
              className="text-red-300"
              onClick={() =>
                setLineas((actuales) =>
                  actuales.filter((a) => a.productoId !== l.productoId),
                )
              }
            >
              Quitar
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <button disabled={ocupado || !lineas.length} className={boton}>
            Enviar para aprobación
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() =>
              void ejecutar(async () => {
                await cargar();
                setLineas([]);
                setAviso(
                  "Stock actualizado. Vuelve a seleccionar y contar los productos.",
                );
              })
            }
          >
            Actualizar stock y reiniciar selección
          </button>
        </div>
      </form>
      <p className="text-sm text-gray-400">
        Últimos 100 conteos. Solo el administrador puede aprobar o rechazar.
      </p>
      {conteos.map((c) => (
        <article
          key={c.id}
          className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/50 p-4"
        >
          <h3 className="font-semibold">
            #{c.id} · {c.descripcion} · {c.estado}
          </h3>
          <p className="text-xs text-gray-400">
            {new Date(c.creadoEn).toLocaleString("es-CO")}
            {c.motivoResolucion && ` · ${c.motivoResolucion}`}
          </p>
          {c.detalles.map((d) => (
            <p key={d.productoId} className="text-sm">
              {d.productoNombre}: sistema {d.stockEsperado} → contado{" "}
              {d.stockContado} · diferencia {d.stockContado - d.stockEsperado}
            </p>
          ))}
          {administrador && c.estado === "PENDIENTE" && (
            <div className="flex gap-3">
              {[true, false].map((aprobar) => (
                <button
                  key={String(aprobar)}
                  disabled={ocupado}
                  className={
                    aprobar
                      ? boton
                      : "rounded-lg border border-red-800 px-4 py-2 text-red-300"
                  }
                  onClick={() => {
                    const motivo = window.prompt(
                      aprobar
                        ? "Motivo de aprobación: se ajustarán las existencias y quedará historial."
                        : "Motivo de rechazo",
                    );
                    if (motivo)
                      void ejecutar(async () => {
                        await api.post(
                          `/administracion/conteos/${c.id}/resolver`,
                          { aprobar, motivo },
                        );
                        setAviso(
                          aprobar
                            ? "Conteo aprobado. Existencias e historial actualizados."
                            : "Conteo rechazado. Las existencias se conservaron.",
                        );
                      });
                  }}
                >
                  {aprobar ? "Aprobar y ajustar stock" : "Rechazar"}
                </button>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
