"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import api from "@/lib/api";
import type { TiendaPublica } from "@/lib/tiendaPublica";
type Config = TiendaPublica["config"];
const input =
  "mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
const boton = "rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-50";
const card = "rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4";
const politicas = [
  ["terminos", "Términos y condiciones", "Quién vende, cómo se confirman precios, pedidos, pagos y entregas."],
  ["envios", "Envíos y entregas", "Zonas, tiempos estimados, costos y qué pasa si no hay quien reciba."],
  ["cambios", "Cambios", "Plazos y condiciones para cambiar un producto."],
  ["devoluciones", "Devoluciones y derecho de retracto", "En ventas a distancia el cliente puede retractarse dentro de los 5 días hábiles siguientes a la entrega, salvo las excepciones de ley (por ejemplo, perecederos). Indica cómo solicitarlo y cómo se reembolsa."],
  ["privacidad", "Privacidad y tratamiento de datos", "Responsable, finalidad del uso de los datos, derechos del titular y canal para ejercerlos."],
] as const;
export default function ComercioWeb({
  config,
  busy,
  onChange,
  onBusy,
  onMensaje,
  onError,
}: {
  config: Config;
  busy: boolean;
  onChange: (k: string, v: unknown) => void;
  onBusy: (v: boolean) => void;
  onMensaje: (v: string) => void;
  onError: (v: string) => void;
}) {
  const [productos, setProductos] = useState<{ id: number; nombre: string }[]>(
      [],
    ),
    [productoId, setProductoId] = useState(0);
  useEffect(() => {
    let activo = true;
    api
      .get("/productos")
      .then((r) => {
        if (activo) setProductos(r.data);
      })
      .catch(() => {
        if (activo)
          onError(
            "No se pudieron cargar los productos para personalizar la web.",
          );
      });
    return () => {
      activo = false;
    };
  }, [onError]);
  const promociones = config.promociones || [],
    testimonios = config.testimonios || [],
    fichas = config.fichasProductos || [];
  const fotos = fichas.find((f) => f.productoId === productoId)?.imagenes || [];
  function actualizarFotos(imagenes: string[]) {
    onChange("fichasProductos", [
      ...fichas.filter((f) => f.productoId !== productoId),
      ...(imagenes.length ? [{ productoId, imagenes }] : []),
    ]);
  }
  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !productoId) return;
    onBusy(true);
    onError("");
    onMensaje("Subiendo foto del producto…");
    try {
      const form = new FormData();
      form.append("imagen", file);
      const { data } = await api.post("/empresa/anuncios/imagen", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      actualizarFotos([...fotos, data.imagen]);
      onMensaje("Foto cargada. Guarda los cambios para publicarla.");
    } catch (error: any) {
      onMensaje("");
      onError(error.response?.data?.message || "No se pudo subir la foto.");
    } finally {
      onBusy(false);
      e.target.value = "";
    }
  }
  return (
    <>
      <section className={card}>
        <h2 className="text-xl font-bold">Productos del inicio</h2>
        <p className="text-gray-400">
          Elige hasta 8 destacados y 8 novedades. Los precios y las existencias
          se toman del catálogo. Deja la selección vacía para ocultar cada
          bloque.
        </p>
        {(["destacadosIds", "novedadesIds"] as const).map((campo) => (
          <fieldset key={campo} disabled={busy}>
            <legend className="font-semibold">
              {campo === "destacadosIds" ? "Destacados" : "Novedades"}
            </legend>
            <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border border-gray-700 p-3">
              {productos.map((p) => (
                <label key={p.id} className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={(config[campo] || []).includes(p.id)}
                    disabled={
                      busy ||
                      (!(config[campo] || []).includes(p.id) &&
                        (config[campo] || []).length >= 8)
                    }
                    onChange={(e) =>
                      onChange(
                        campo,
                        e.target.checked
                          ? [...(config[campo] || []), p.id]
                          : (config[campo] || []).filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.nombre}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </section>
      <section className={card}>
        <h2 className="text-xl font-bold">Fotos adicionales de productos</h2>
        <p className="text-gray-400">
          La foto principal sigue sincronizada con Productos. Aquí puedes añadir
          hasta 6 fotos a su página individual.
        </p>
        <label className="block">
          Producto
          <select
            disabled={busy}
            className={input}
            value={productoId}
            onChange={(e) => setProductoId(Number(e.target.value))}
          >
            <option value={0}>Selecciona un producto</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        {productoId > 0 && (
          <>
            <label className="block">
              Agregar foto
              <input
                className={input}
                disabled={busy || fotos.length >= 6}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={subir}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              {fotos.map((src, i) => (
                <div key={src + i} className="space-y-2">
                  <Image
                    src={src}
                    width={200}
                    height={160}
                    unoptimized
                    className="h-36 w-full object-contain"
                    alt={`Foto adicional ${i + 1}`}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className={boton}
                    onClick={() =>
                      actualizarFotos(fotos.filter((_, n) => n !== i))
                    }
                  >
                    Quitar foto {i + 1}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <section className={card}>
        <h2 className="text-xl font-bold">Promociones</h2>
        <p className="text-gray-400">
          Aparecen en Inicio entre las fechas seleccionadas, según la hora de
          Colombia. Explica las condiciones. Si anuncias un precio especial,
          actualiza también el precio del producto en el catálogo; este anuncio
          no aplica descuentos automáticos.
        </p>
        {promociones.map((p, i) => {
          const cambiar = (campo: string, valor: unknown) =>
            onChange(
              "promociones",
              promociones.map((v, n) =>
                n === i ? { ...v, [campo]: valor } : v,
              ),
            );
          return (
            <div
              key={i}
              className="space-y-3 rounded-lg border border-gray-700 p-4"
            >
              <label className="block">
                Título
                <input
                  required
                  disabled={busy}
                  maxLength={120}
                  className={input}
                  value={p.titulo}
                  onChange={(e) => cambiar("titulo", e.target.value)}
                />
              </label>
              <label className="block">
                Descripción y condiciones
                <textarea
                  required
                  disabled={busy}
                  maxLength={2000}
                  className={input}
                  value={p.detalle}
                  onChange={(e) => cambiar("detalle", e.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["desde", "hasta"] as const).map((campo) => (
                  <label key={campo}>
                    {campo === "desde" ? "Fecha de inicio" : "Fecha de fin"}
                    <input
                      required
                      disabled={busy}
                      type="date"
                      className={input}
                      value={p[campo]}
                      min={campo === "hasta" ? p.desde : undefined}
                      onChange={(e) => cambiar(campo, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <label className="block">
                Producto relacionado
                <select
                  disabled={busy}
                  className={input}
                  value={p.productoId || 0}
                  onChange={(e) =>
                    cambiar("productoId", Number(e.target.value) || null)
                  }
                >
                  <option value={0}>Ver todo el catálogo</option>
                  {productos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy}
                type="button"
                className={boton}
                onClick={() =>
                  onChange(
                    "promociones",
                    promociones.filter((_, n) => n !== i),
                  )
                }
              >
                Quitar promoción
              </button>
            </div>
          );
        })}
        <button
          disabled={busy || promociones.length >= 12}
          type="button"
          className={boton}
          onClick={() =>
            onChange("promociones", [
              ...promociones,
              {
                titulo: "",
                detalle: "",
                desde: "",
                hasta: "",
                productoId: null,
              },
            ])
          }
        >
          Agregar promoción
        </button>
      </section>
      <section className={card}>
        <h2 className="text-xl font-bold">Opiniones de clientes</h2>
        <p className="text-gray-400">
          Publica únicamente testimonios reales con autorización del cliente.
          Usa el nombre que haya autorizado mostrar.
        </p>
        {testimonios.map((p, i) => {
          const cambiar = (campo: string, valor: unknown) =>
            onChange(
              "testimonios",
              testimonios.map((v, n) =>
                n === i ? { ...v, [campo]: valor } : v,
              ),
            );
          return (
            <div
              key={i}
              className="space-y-3 rounded-lg border border-gray-700 p-4"
            >
              <label className="block">
                Nombre público
                <input
                  required
                  disabled={busy}
                  maxLength={100}
                  className={input}
                  value={p.nombre}
                  onChange={(e) => cambiar("nombre", e.target.value)}
                />
              </label>
              <label className="block">
                Testimonio
                <textarea
                  required
                  disabled={busy}
                  maxLength={1000}
                  className={input}
                  value={p.texto}
                  onChange={(e) => cambiar("texto", e.target.value)}
                />
              </label>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={p.autorizado}
                  onChange={(e) => cambiar("autorizado", e.target.checked)}
                />
                Tengo autorización del cliente para publicar este nombre y
                testimonio.
              </label>
              <button
                type="button"
                disabled={busy}
                className={boton}
                onClick={() =>
                  onChange(
                    "testimonios",
                    testimonios.filter((_, n) => n !== i),
                  )
                }
              >
                Quitar testimonio
              </button>
            </div>
          );
        })}
        <button
          type="button"
          disabled={busy || testimonios.length >= 12}
          className={boton}
          onClick={() =>
            onChange("testimonios", [
              ...testimonios,
              { nombre: "", texto: "", autorizado: false },
            ])
          }
        >
          Agregar testimonio
        </button>
      </section>
      <section className={card}>
        <h2 className="text-xl font-bold">Políticas de compra de la tienda</h2>
        <p className="text-gray-400">
          Estos textos se publican para los clientes en Políticas de compra,
          desde el pie de página. Deben corresponder a las condiciones reales de
          tu empresa; la privacidad de clientes es distinta de los expedientes
          laborales.
        </p>
        {politicas.map(([campo, titulo, ayuda]) => (
          <label key={campo} className="block">
            {titulo}
            <span className="mt-1 block text-sm text-gray-400">{ayuda}</span>
            <textarea
              rows={5}
              maxLength={12000}
              disabled={busy}
              className={input}
              value={config.politicas?.[campo] || ""}
              onChange={(e) =>
                onChange("politicas", {
                  envios: "",
                  cambios: "",
                  devoluciones: "",
                  privacidad: "",
                  terminos: "",
                  ...config.politicas,
                  [campo]: e.target.value,
                })
              }
            />
          </label>
        ))}
      </section>
      <section className={card}>
        <h2 className="text-xl font-bold">Datos legales del pie de página</h2>
        <p className="text-gray-400">
          Se muestran al final de cada página de la tienda junto con la
          dirección y el teléfono de la empresa. Revisa que coincidan con el
          RUT.
        </p>
        <label className="block">
          Razón social
          <input
            maxLength={200}
            disabled={busy}
            className={input}
            value={config.razonSocial || ""}
            onChange={(e) => onChange("razonSocial", e.target.value)}
          />
        </label>
        <label className="block">
          Correo de atención al cliente
          <input
            type="email"
            maxLength={200}
            disabled={busy}
            className={input}
            value={config.correoPublico || ""}
            onChange={(e) => onChange("correoPublico", e.target.value)}
          />
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            disabled={busy}
            checked={!!config.mostrarNit}
            onChange={(e) => onChange("mostrarNit", e.target.checked)}
          />
          Publicar el NIT registrado de la empresa
        </label>
        <p className="text-sm text-gray-400">
          Si la empresa está registrada con la cédula de una persona natural,
          decide si deseas publicarla.
        </p>
      </section>
      <section className={card}>
        <h2 className="text-xl font-bold">Medición de visitas</h2>
        <p className="text-gray-400">
          Opcional. Los visitantes ven un aviso y la medición solo se activa si
          la aceptan. Menciona estas herramientas en tu política de privacidad.
        </p>
        <label className="block">
          ID de medición de Google Analytics
          <input
            placeholder="G-XXXXXXXXXX"
            maxLength={20}
            disabled={busy}
            className={input}
            value={config.googleAnalyticsId || ""}
            onChange={(e) =>
              onChange("googleAnalyticsId", e.target.value.trim().toUpperCase())
            }
          />
        </label>
        <label className="block">
          ID de Meta Pixel
          <input
            inputMode="numeric"
            maxLength={20}
            disabled={busy}
            className={input}
            value={config.metaPixelId || ""}
            onChange={(e) => onChange("metaPixelId", e.target.value.trim())}
          />
        </label>
      </section>
    </>
  );
}
