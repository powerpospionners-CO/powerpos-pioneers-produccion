"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/store/authStore";
import ProductosTienda from "./ProductosTienda";
const input =
  "w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white";
const card = "rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "powerpospioneers.com";
export default function MiTienda() {
  const { usuario } = useAuthStore();
  const [config, setConfig] = useState<any>(null),
    [sucursales, setSucursales] = useState<any[]>([]),
    [mensaje, setMensaje] = useState(""),
    [busy, setBusy] = useState(false),
    [origin, setOrigin] = useState(""),
    [esProduccion, setEsProduccion] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    setEsProduccion(window.location.hostname.endsWith(ROOT_DOMAIN));
    if (usuario?.rol !== "ADMIN_EMPRESA") return;
    Promise.all([
      api.get("/tienda-admin/configuracion"),
      api.get("/sucursales"),
    ])
      .then(([c, s]) => {
        setConfig(c.data);
        setSucursales(s.data);
      })
      .catch((e) =>
        setMensaje(
          e.response?.data?.message || "No fue posible cargar la tienda",
        ),
      );
  }, [usuario?.rol]);
  const cambiar = (k: string, v: unknown) =>
    setConfig((c: any) => ({ ...c, tienda: { ...c.tienda, [k]: v } }));
  async function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMensaje('Analizando los colores del logo…');
    try {
      const form = new FormData(); form.append('logo', file);
      const { data } = await api.post('/empresa/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setConfig((c: any) => ({ ...c, tienda: { ...c.tienda, paletaLogo: data.paleta, ...(c.tienda.coloresAutomaticos !== false ? { color: data.paleta.principal } : {}) } }));
      setMensaje('Logo guardado. Sus colores ya están disponibles en tu tienda.');
    } catch (error: any) { setMensaje(error.response?.data?.message || 'No se pudo analizar el logo'); }
    finally { setBusy(false); e.target.value = ''; }
  }
  async function subirPortada(e: React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0];if(!file)return;
    setBusy(true);setMensaje('Subiendo imagen de portada…');
    try {const form=new FormData();form.append('imagen',file);const {data}=await api.post('/empresa/anuncios/imagen',form,{headers:{'Content-Type':'multipart/form-data'}});cambiar('portada',data.imagen);setMensaje('Portada cargada. Guarda los cambios para publicarla en tu tienda.');}
    catch(error:any){setMensaje(error.response?.data?.message||'No se pudo subir la portada');}
    finally{setBusy(false);e.target.value='';}
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMensaje("");
    try {
      const { data } = await api.patch("/tienda-admin/configuracion", {
        slug: config.slug,
        tienda: config.tienda,
      });
      setConfig(data);
      setMensaje("Cambios guardados. La tienda ya usa esta información.");
    } catch (e: any) {
      setMensaje(e.response?.data?.message || "No fue posible guardar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-5xl p-5 md:p-10">
          <h1 className="text-3xl font-bold">Tu tienda web</h1>
          <p className="my-3 text-gray-400">
            Tu marca, tus productos y tus pedidos, conectados con PowerPOS.
          </p>
          {mensaje && (
            <p
              role="status"
              className="my-4 rounded-lg border border-gray-600 p-4"
            >
              {mensaje}
            </p>
          )}
          {usuario?.rol !== "ADMIN_EMPRESA" ? (
            <p>
              Esta configuración corresponde al administrador de la empresa.
            </p>
          ) : (
            config && (
              <form onSubmit={guardar} className="space-y-6">
                <fieldset disabled={busy} className="space-y-6">
                  <section className={card}>
                    <h2 className="text-xl font-bold">Enlace de tu empresa</h2>
                    <p className="text-gray-400">
                      Se crea automáticamente al registrar la empresa. Puedes
                      personalizar su dirección.
                    </p>
                    <label className="block">
                      Nombre del enlace
                      <input
                        className={input}
                        required
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        value={config.slug}
                        onChange={(e) =>
                          setConfig({ ...config, slug: e.target.value })
                        }
                      />
                    </label>
                    <a
                      className="block break-all text-teal-300 underline"
                      href={
                        esProduccion
                          ? `https://${config.slug}.${ROOT_DOMAIN}`
                          : `/tienda/${config.slug}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {esProduccion
                        ? `${config.slug}.${ROOT_DOMAIN}`
                        : `${origin}/tienda/${config.slug}`}{" "}
                      ↗
                    </a>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={config.tienda.publicada}
                        onChange={(e) => cambiar("publicada", e.target.checked)}
                      />
                      Mostrar tienda al público
                    </label>
                    <p className="text-sm text-gray-400">
                      El enlace funciona en el dominio donde esté desplegado
                      PowerPOS. Cambiarlo invalida el enlace anterior.
                    </p>
                  </section>
                  <section className={card}>
                    <h2 className="text-xl font-bold">Diseño e información</h2>
                    <p className="text-sm text-gray-400">Todas las tiendas conservan la misma plantilla. Aquí personalizas sus textos, imágenes y colores.</p>
                    <label className="block">Imagen de portada<input className={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={subirPortada}/><span className="text-sm text-gray-400">Usa una fotografía horizontal con espacio libre a la izquierda para el título. Máximo 8 MB.</span></label>
                    <label className="block">Logo de tu empresa<input className={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={subirLogo} /><span className="text-sm text-gray-400">Sube tu logo para obtener los colores de tu marca. Máximo 8 MB.</span></label>
                    <label className="flex items-center gap-3"><input type="checkbox" checked={config.tienda.coloresAutomaticos !== false} onChange={e => { cambiar('coloresAutomaticos', e.target.checked); if (e.target.checked && config.tienda.paletaLogo) cambiar('color', config.tienda.paletaLogo.principal); }} />Usar automáticamente los colores de mi logo</label>
                    {config.tienda.paletaLogo && <div className="flex gap-3">{Object.values(config.tienda.paletaLogo as Record<string, string>).map((color, i) => <span key={i} className="rounded-lg border border-gray-600 px-4 py-2" style={{borderLeft:`20px solid ${color}`}}>{color}</span>)}</div>}
                    <p className="text-gray-400">
                      El nombre, logo y contacto se toman de{" "}
                      <a
                        href="/configuracion"
                        className="text-teal-300 underline"
                      >
                        Configuración de empresa
                      </a>
                      .
                    </p>
                    {[
                      ["titulo", "Título principal"],
                      ["antetitulo", "Frase sobre el título principal"],
                      ["portadaEtiqueta", "Etiqueta sobre la portada"],
                      ["portadaTexto", "Texto sobre la portada"],
                      ["descripcion", "Descripción del negocio"],
                      ["sobreNosotros", "Sobre nosotros (historia, qué los hace diferentes, etc.)"],
                      ["horario", "Horario de atención"],
                      ["portada", "URL HTTPS de la imagen de portada"],
                      [
                        "whatsapp",
                        "WhatsApp con indicativo de país, sin + (ej. 573001234567)",
                      ],
                    ].map(([k, label]) => (
                      <label key={k} className="block">
                        {label}
                        {k === "descripcion" || k === "sobreNosotros" ? (
                          <textarea
                            maxLength={2000}
                            className={input}
                            rows={k === "sobreNosotros" ? 6 : 4}
                            value={config.tienda[k] || ""}
                            onChange={(e) => cambiar(k, e.target.value)}
                          />
                        ) : (
                          <input
                            maxLength={500}
                            className={input}
                            type={k === "portada" ? "url" : "text"}
                            value={config.tienda[k] || ""}
                            onChange={(e) => cambiar(k, e.target.value)}
                          />
                        )}
                      </label>
                    ))}
                    <label className="flex items-center gap-4">
                      Color de marca
                      <input
                        type="color"
                        disabled={config.tienda.coloresAutomaticos !== false}
                        value={config.tienda.color}
                        onChange={(e) => cambiar("color", e.target.value)}
                      />
                    </label>
                  </section>
                  <section className={card}>
                    <h2 className="text-xl font-bold">Redes sociales</h2>
                    <p className="text-gray-400">
                      Pega el usuario o el enlace completo de cada red — se muestran como iconos en tu tienda.
                    </p>
                    {[
                      ["facebook", "Facebook (usuario o enlace)"],
                      ["instagram", "Instagram (usuario o enlace)"],
                      ["tiktok", "TikTok (usuario o enlace)"],
                    ].map(([k, label]) => (
                      <label key={k} className="block">
                        {label}
                        <input
                          maxLength={500}
                          className={input}
                          type="text"
                          placeholder="ej. mi.negocio"
                          value={config.tienda[k]}
                          onChange={(e) => cambiar(k, e.target.value)}
                        />
                      </label>
                    ))}
                  </section>
                  <section className={card}>
                    <h2 className="text-xl font-bold">Productos y precios</h2>
                    <p className="text-gray-400">
                      La tienda utiliza el mismo catálogo del POS. Actualiza
                      nombres, imágenes, descripciones, precios y disponibilidad
                      en Productos.
                    </p>
                    <a
                      className="inline-block rounded-lg bg-teal-800 px-5 py-3"
                      href="/productos"
                    >
                      Administrar catálogo →
                    </a>
                  </section>
                  <section className={card}>
                    <h2 className="text-xl font-bold">Pedidos y domicilios</h2>
                    <label className="flex gap-3 items-center">
                      <input
                        type="checkbox"
                        checked={config.tienda.pedidosHabilitados}
                        onChange={(e) =>
                          cambiar("pedidosHabilitados", e.target.checked)
                        }
                      />
                      Recibir pedidos desde la web
                    </label>
                    <label className="block">
                      Sucursal que recibe los pedidos
                      <select
                        className={input}
                        value={config.tienda.sucursalId}
                        onChange={(e) =>
                          cambiar("sucursalId", Number(e.target.value))
                        }
                      >
                        <option value={0}>Selecciona una sucursal</option>
                        {sucursales.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      Compra mínima de productos (COP)
                      <input
                        className={input}
                        type="number"
                        min={0}
                        step="0.01"
                        value={config.tienda.minimo}
                        onChange={(e) =>
                          cambiar("minimo", Number(e.target.value))
                        }
                      />
                    </label>
                    <h3 className="font-semibold">
                      Zonas y tarifas de entrega
                    </h3>
                    {config.tienda.zonas.map((z: any, i: number) => (
                      <div
                        className="grid gap-3 sm:grid-cols-[1fr_160px_auto]"
                        key={i}
                      >
                        <label>
                          Zona
                          <input
                            required
                            className={input}
                            value={z.nombre}
                            onChange={(e) =>
                              cambiar(
                                "zonas",
                                config.tienda.zonas.map((v: any, j: number) =>
                                  j === i
                                    ? { ...v, nombre: e.target.value }
                                    : v,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Tarifa COP
                          <input
                            required
                            type="number"
                            min={0}
                            step="0.01"
                            className={input}
                            value={z.costo}
                            onChange={(e) =>
                              cambiar(
                                "zonas",
                                config.tienda.zonas.map((v: any, j: number) =>
                                  j === i
                                    ? { ...v, costo: Number(e.target.value) }
                                    : v,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-red-300"
                          onClick={() =>
                            cambiar(
                              "zonas",
                              config.tienda.zonas.filter(
                                (_: unknown, j: number) => j !== i,
                              ),
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-teal-300 underline"
                      onClick={() =>
                        cambiar("zonas", [
                          ...config.tienda.zonas,
                          { nombre: "", costo: 0 },
                        ])
                      }
                    >
                      + Agregar zona
                    </button>
                    <p className="text-sm text-gray-400">
                      Cada pedido queda pendiente de revisión en Domicilios.
                      WhatsApp abre una conversación con tu empresa y no crea
                      una venta automáticamente.
                    </p>
                  </section>
                  <button
                    className="rounded-lg bg-orange-600 px-7 py-3 font-bold"
                    disabled={busy}
                  >
                    {busy ? "Guardando…" : "Guardar tienda"}
                  </button>
                </fieldset>
              </form>
            )
          )}
          {usuario?.rol === "ADMIN_EMPRESA" && <ProductosTienda />}
        </main>
      </div>
    </AuthGuard>
  );
}
