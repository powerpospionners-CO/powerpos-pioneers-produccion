"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import api from "@/lib/api";
import OrigenesProductos from "@/components/OrigenesProductos";

interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: string | number;
  imagen: string | null;
  disponible: boolean;
  ventaGranel?: boolean;
  unidadGranel?: string | null;
  categoria?: { nombre: string };
}
const input =
  "mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
const boton = "rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-50";
const moneda = (n: string | number) =>
  Number(n).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  });
function mensajeError(error: unknown) {
  const message = axios.isAxiosError(error)
    ? error.response?.data?.message
    : undefined;
  return Array.isArray(message)
    ? message.join(". ")
    : typeof message === "string"
      ? message
      : "No fue posible completar la operación. Intenta de nuevo.";
}

export default function ProductosTienda() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [original, setOriginal] = useState<Producto | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    precio: "",
    disponible: true,
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [quitarImagen, setQuitarImagen] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const bloqueo = useRef(false);
  const peticion = useRef(0);
  const editor = useRef<HTMLFormElement>(null);
  const selectorArchivo = useRef<HTMLInputElement>(null);
  const productoEditadoId = original?.id;
  const invalidarCarga = useCallback(() => {
    ++peticion.current;
  }, []);
  const cargar = useCallback(async () => {
    const actual = ++peticion.current;
    try {
      const { data } = await api.get<Producto[]>("/productos");
      if (actual === peticion.current) setProductos(data);
    } catch (error) {
      if (actual === peticion.current) setMensaje(mensajeError(error));
    } finally {
      if (actual === peticion.current) setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar();
    const focus = () => {
      if (!bloqueo.current) void cargar();
    };
    window.addEventListener("focus", focus);
    return () => {
      invalidarCarga();
      window.removeEventListener("focus", focus);
    };
  }, [cargar, invalidarCarga]);
  useEffect(() => {
    if (!archivo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(archivo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);
  useEffect(() => {
    if (productoEditadoId) {
      editor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      editor.current
        ?.querySelector<HTMLInputElement>("input[name=nombre]")
        ?.focus({ preventScroll: true });
    }
  }, [productoEditadoId]);
  async function editar(id: number) {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(true);
    setMensaje("");
    try {
      const { data } = await api.get<Producto>(`/productos/${id}`);
      setOriginal(data);
      setForm({
        nombre: data.nombre,
        descripcion: data.descripcion || "",
        precio: String(data.precio),
        disponible: data.disponible,
      });
      setArchivo(null);
      setQuitarImagen(false);
      if (selectorArchivo.current) selectorArchivo.current.value = "";
    } catch (error) {
      setMensaje(mensajeError(error));
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }
  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    if (!original || bloqueo.current) return;
    const precio = Number(form.precio);
    if (
      !form.nombre.trim() ||
      !form.precio.trim() ||
      !Number.isFinite(precio) ||
      precio < 0
    ) {
      setMensaje("Escribe un nombre y un precio válido, mayor o igual a cero.");
      return;
    }
    bloqueo.current = true;
    setOcupado(true);
    setMensaje("");
    let datosGuardados = false;
    try {
      // Envía únicamente los campos editados para conservar otros cambios del catálogo.
      const cambios: Record<string, unknown> = {};
      if (form.nombre.trim() !== original.nombre)
        cambios.nombre = form.nombre.trim();
      if (form.descripcion !== (original.descripcion || ""))
        cambios.descripcion = form.descripcion;
      if (precio !== Number(original.precio)) cambios.precio = precio;
      if (form.disponible !== original.disponible)
        cambios.disponible = form.disponible;
      if (quitarImagen) cambios.imagen = null;
      let actualizado = original;
      if (Object.keys(cambios).length) {
        const { data } = await api.patch<Producto>(
          `/productos/${original.id}`,
          cambios,
        );
        actualizado = data;
        setOriginal(data);
        datosGuardados = true;
      }
      if (archivo) {
        const body = new FormData();
        body.append("imagen", archivo);
        const { data } = await api.post<{ imagen: string }>(
          `/productos/${original.id}/imagen`,
          body,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        actualizado = { ...actualizado, imagen: data.imagen };
      }
      ++peticion.current;
      setProductos((lista) =>
        lista.map((p) => (p.id === actualizado.id ? actualizado : p)),
      );
      setOriginal(null);
      setArchivo(null);
      setQuitarImagen(false);
      setMensaje(
        "Producto guardado en Productos y en tu tienda web. Las páginas abiertas se actualizan en un máximo de 30 segundos o al recargarlas.",
      );
    } catch (error) {
      if (datosGuardados) {
        await cargar();
        setMensaje(
          `El precio y los detalles se guardaron, pero la imagen no se pudo subir. Puedes reintentar sin cerrar el editor. ${mensajeError(error)}`,
        );
      } else setMensaje(mensajeError(error));
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }
  const texto = busqueda.trim().toLocaleLowerCase("es");
  const filtrados = productos.filter((p) =>
    `${p.nombre} ${p.descripcion || ""} ${p.categoria?.nombre || ""}`
      .toLocaleLowerCase("es")
      .includes(texto),
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / 24));
  const paginaActual = Math.min(pagina, paginas);
  return (
    <section
      className="mt-8 space-y-5 rounded-xl border border-gray-800 bg-gray-900/60 p-6"
      aria-labelledby="productos-tienda-titulo"
    >
      <h2 id="productos-tienda-titulo" className="text-xl font-bold">
        Productos de tu tienda
      </h2>
      <p className="text-sm text-gray-400">
        Edita el nombre, precio, detalles y foto. Son los mismos productos que
        administras en Productos: cualquier cambio se comparte con tu página
        web.
      </p>
      {mensaje && (
        <p role="status" className="rounded-lg border border-gray-600 p-3">
          {mensaje}
        </p>
      )}
      {original && (
        <form
          ref={editor}
          onSubmit={guardar}
          className="scroll-mt-6 rounded-xl border border-teal-700 p-5"
        >
          <h3 className="mb-4 text-lg font-bold">Editar {original.nombre}</h3>
        <OrigenesProductos productoId={original.id} />
        <fieldset disabled={ocupado} className="space-y-4">
            <label className="block">
              Nombre
              <input
                name="nombre"
                className={input}
                required
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>
            <label className="block">
              Precio de venta (COP)
              {original.ventaGranel && (
                <span className="block text-sm text-amber-200">
                  Precio por{" "}
                  {original.unidadGranel === "ml" ||
                  original.unidadGranel === "l"
                    ? "mililitro (ml)"
                    : "gramo (g)"}
                  , igual que en Productos.
                </span>
              )}
              <input
                className={input}
                type="number"
                required
                min="0"
                step="0.01"
                value={form.precio}
                onChange={(e) => setForm({ ...form, precio: e.target.value })}
              />
            </label>
            <label className="block">
              Detalles del producto
              <textarea
                className={input}
                rows={4}
                value={form.descripcion}
                onChange={(e) =>
                  setForm({ ...form, descripcion: e.target.value })
                }
              />
            </label>
            <label className="block">
              Imagen del producto
              <input
                ref={selectorArchivo}
                className={input}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (
                    !/^image\/(jpeg|png|webp|gif)$/.test(file.type) ||
                    file.size > 8 * 1024 * 1024
                  ) {
                    setMensaje(
                      "Selecciona una imagen JPG, PNG, WEBP o GIF de máximo 8 MB.",
                    );
                    e.target.value = "";
                    return;
                  }
                  setArchivo(file);
                  setQuitarImagen(false);
                  setMensaje("");
                }}
              />
              <span className="text-sm text-gray-400">
                JPG, PNG, WEBP o GIF. Máximo 8 MB. Se guardará también en
                Productos al guardar el producto.
              </span>
            </label>
            {(preview || (!quitarImagen && original.imagen)) && (
              <img
                src={preview || original.imagen!}
                alt={`Vista previa de ${form.nombre}`}
                className="h-40 w-40 rounded-lg bg-white object-contain"
              />
            )}
            {(archivo || original.imagen) && (
              <button
                type="button"
                className={boton}
                onClick={() => {
                  setArchivo(null);
                  setQuitarImagen(true);
                  if (selectorArchivo.current)
                    selectorArchivo.current.value = "";
                }}
              >
                Quitar imagen
              </button>
            )}
            {quitarImagen && (
              <p className="text-sm text-amber-200">
                La imagen se quitará de Productos y de la tienda al guardar.
              </p>
            )}
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.disponible}
                onChange={(e) =>
                  setForm({ ...form, disponible: e.target.checked })
                }
              />
              Disponible para la venta
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-lg bg-teal-700 px-5 py-3 font-bold">
                {ocupado ? "Guardando…" : "Guardar producto"}
              </button>
              <button
                type="button"
                className={boton}
                onClick={() => {
                  setOriginal(null);
                  setArchivo(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          Buscar productos
          <input
            className={input}
            type="search"
            placeholder="Nombre, categoría o detalles"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
          />
        </label>
        <button
          type="button"
          className={boton}
          disabled={ocupado || cargando}
          onClick={() => {
            setMensaje("");
            setCargando(true);
            void cargar();
          }}
        >
          Actualizar lista
        </button>
      </div>
      <p className="text-sm text-gray-400">
        {cargando ? "Cargando productos…" : `${filtrados.length} productos`}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtrados
          .slice((paginaActual - 1) * 24, paginaActual * 24)
          .map((p) => (
            <article
              key={p.id}
              className="flex flex-col gap-3 rounded-lg border border-gray-700 p-4"
            >
              {p.imagen ? (
                <img
                  src={p.imagen}
                  alt={p.nombre}
                  loading="lazy"
                  className="h-36 w-full rounded bg-white object-contain"
                />
              ) : (
                <div className="flex h-36 items-center justify-center rounded bg-gray-800 text-gray-400">
                  Sin imagen
                </div>
              )}
              <h3 className="font-bold">{p.nombre}</h3>
              <p className="text-sm text-gray-400">{p.categoria?.nombre}</p>
              <p>
                {moneda(p.precio)}
                {p.ventaGranel
                  ? ` / ${p.unidadGranel === "ml" || p.unidadGranel === "l" ? "ml" : "g"}`
                  : ""}
              </p>
              <p className="line-clamp-2 text-sm text-gray-300">
                {p.descripcion || "Sin detalles"}
              </p>
              <p className="text-sm">
                {p.disponible ? "Disponible" : "Agotado"}
              </p>
              <button
                type="button"
                className={`${boton} mt-auto`}
                disabled={ocupado || original !== null}
                onClick={() => void editar(p.id)}
                aria-label={`Editar ${p.nombre}`}
              >
                Editar producto
              </button>
            </article>
          ))}
      </div>
      {!cargando && !filtrados.length && (
        <p>
          {productos.length
            ? "No se encontraron productos con esa búsqueda."
            : "Todavía no tienes productos. Crea el primero desde Productos para mostrarlo aquí y en tu tienda."}
        </p>
      )}
      {paginas > 1 && (
        <nav
          aria-label="Páginas de productos"
          className="flex items-center justify-between gap-3"
        >
          <button
            type="button"
            className={boton}
            disabled={paginaActual === 1}
            onClick={() => setPagina(paginaActual - 1)}
          >
            Anterior
          </button>
          <span>
            {paginaActual} de {paginas}
          </span>
          <button
            type="button"
            className={boton}
            disabled={paginaActual === paginas}
            onClick={() => setPagina(paginaActual + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
}
