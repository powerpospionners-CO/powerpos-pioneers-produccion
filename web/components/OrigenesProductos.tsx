"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
type Origen = { id: string; nombre: string };
const campo = "rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
export default function OrigenesProductos({
  productoId,
}: {
  productoId?: number;
}) {
  const [origenes, setOrigenes] = useState<Origen[]>([]);
  const [seleccion, setSeleccion] = useState("");
  const [nombre, setNombre] = useState("");
  const [editando, setEditando] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [busy, setBusy] = useState(false);
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    let activo = true;
    setCargado(false);
    async function cargar() {
      try {
        const [o, p] = await Promise.all([
          api.get("/productos/origenes"),
          productoId
            ? api.get(`/productos/${productoId}`)
            : Promise.resolve(null),
        ]);
        if (activo) {
          setOrigenes(o.data);
          setSeleccion(p?.data.origenId || "");
          setCargado(true);
        }
      } catch {
        if (activo)
          setMensaje(
            "No se pudieron cargar los orígenes. Recarga para reintentar.",
          );
      }
    }
    void cargar();
    const actualizar = () => void cargar();
    window.addEventListener("powerpos:origenes", actualizar);
    return () => {
      activo = false;
      window.removeEventListener("powerpos:origenes", actualizar);
    };
  }, [productoId]);
  async function guardar(asignar = false) {
    if (busy) return;
    setBusy(true);
    setMensaje("");
    try {
      if (asignar) {
        await api.patch(`/productos/${productoId}/origen`, {
          origenId: seleccion || null,
        });
        setMensaje(
          "Origen del producto guardado. Ya está disponible en el filtro de tu tienda.",
        );
      } else {
        const { data } = editando
          ? await api.patch(`/productos/origenes/${editando}`, { nombre })
          : await api.post("/productos/origenes", { nombre });
        setOrigenes(data);
        setNombre("");
        setEditando("");
        setMensaje(
          "Origen guardado para tu empresa. Al renombrarlo se actualizan todos sus productos.",
        );
        window.dispatchEvent(new Event("powerpos:origenes"));
      }
    } catch (e: any) {
      setMensaje(e.response?.data?.message || "No se pudo guardar el origen");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border border-gray-700 p-4">
      <h3 className="font-bold">
        {productoId ? "Origen del producto" : "Orígenes de tu empresa"}
      </h3>
      <p className="text-sm text-gray-400">
        Crea tus propios orígenes, por ejemplo Mexicano o Colombiano. Solo se
        muestran en tu catálogo cuando los asignas a productos. No se deducen
        del nombre ni de la foto.
      </p>
      {mensaje && <p role="status">{mensaje}</p>}
      {productoId ? (
        <div className="flex flex-wrap gap-2">
          <label>
            Origen
            <select
              className={`${campo} ml-2`}
              value={seleccion}
              disabled={!cargado || busy}
              onChange={(e) => setSeleccion(e.target.value)}
            >
              <option value="">Sin origen</option>
              {origenes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={campo}
            disabled={!cargado || busy}
            onClick={() => void guardar(true)}
          >
            Guardar origen
          </button>
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {origenes.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={campo}
                disabled={busy}
                onClick={() => {
                  setEditando(o.id);
                  setNombre(o.nombre);
                }}
              >
                {o.nombre} · Editar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="flex-1">
          {editando ? "Renombrar origen" : "Nuevo origen"}
          <input
            className={`${campo} mt-1 w-full`}
            maxLength={60}
            value={nombre}
            disabled={busy || !cargado}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del origen"
          />
        </label>
        <button
          type="button"
          className={`${campo} self-end`}
          disabled={busy || !cargado || !nombre.trim()}
          onClick={() => void guardar()}
        >
          {editando ? "Guardar nombre" : "Crear origen"}
        </button>
        {editando && (
          <button
            type="button"
            className={campo}
            onClick={() => {
              setEditando("");
              setNombre("");
            }}
          >
            Cancelar edición
          </button>
        )}
      </div>
      {productoId && (
        <p className="text-sm text-gray-400">
          El origen se guarda con su propio botón. Puedes renombrarlo en Mi
          tienda → Orígenes de tu empresa.
        </p>
      )}
    </section>
  );
}
