"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/store/authStore";
const field = "mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 p-3";
export default function Fidelizacion() {
  const { usuario } = useAuthStore();
  const [config, setConfig] = useState<any>(null),
    [categorias, setCategorias] = useState<any[]>([]),
    [productos, setProductos] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (usuario?.rol !== "ADMIN_EMPRESA") return;
    Promise.all([
      api.get("/tienda-admin/configuracion"),
      api.get("/categorias"),
      api.get("/productos"),
    ])
      .then(([c, cat, p]) => {
        setConfig(c.data);
        setCategorias(cat.data);
        setProductos(p.data);
      })
      .catch(() => setMessage("No se pudo cargar la configuración."));
  }, [usuario?.rol]);
  const set = (key: string, value: unknown) =>
    setConfig((c: any) => ({
      ...c,
      fidelizacion: { ...c.fidelizacion, [key]: value },
    }));
  const toggle = (key: string, id: number) =>
    set(
      key,
      config.fidelizacion[key].includes(id)
        ? config.fidelizacion[key].filter((n: number) => n !== id)
        : [...config.fidelizacion[key], id],
    );
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.patch("/tienda-admin/configuracion", {
        fidelizacion: config.fidelizacion,
      });
      setConfig(data);
      setMessage("Reglas guardadas. Se aplicarán a las nuevas ventas.");
    } catch (e: any) {
      setMessage(e.response?.data?.message || "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-4xl p-6 md:p-10">
          <h1 className="text-3xl font-bold">Fidelización a tu medida</h1>
          <p className="my-4 text-gray-400">
            Define las reglas de tu empresa. Los saldos existentes se conservan;
            cambiar el valor del punto modifica su valor en futuros canjes.
          </p>
          {message && (
            <p
              role="status"
              className="my-4 rounded border border-gray-600 p-4"
            >
              {message}
            </p>
          )}
          {usuario?.rol !== "ADMIN_EMPRESA" ? (
            <p>Solo el administrador puede configurar los puntos.</p>
          ) : (
            config && (
              <form onSubmit={guardar}>
                <fieldset
                  disabled={busy}
                  className="space-y-7 rounded-xl border border-gray-800 bg-gray-900/50 p-6"
                >
                  <label className="flex gap-3 items-center">
                    <input
                      type="checkbox"
                      checked={config.fidelizacion.habilitado}
                      onChange={(e) => set("habilitado", e.target.checked)}
                    />
                    Activar fidelización
                  </label>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <label>
                      Compra elegible necesaria para ganar 1 punto (COP)
                      <input
                        className={field}
                        required
                        type="number"
                        min={config.fidelizacion.habilitado ? 0.01 : 0}
                        step="0.01"
                        value={config.fidelizacion.compraPorPunto}
                        onChange={(e) =>
                          set("compraPorPunto", Number(e.target.value))
                        }
                      />
                    </label>
                    <label>
                      Descuento al canjear 1 punto (COP)
                      <input
                        className={field}
                        required
                        type="number"
                        min={config.fidelizacion.habilitado ? 0.01 : 0}
                        step="0.01"
                        value={config.fidelizacion.valorPunto}
                        onChange={(e) =>
                          set("valorPunto", Number(e.target.value))
                        }
                      />
                    </label>
                  </div>
                  <p className="rounded-lg bg-gray-800 p-4 text-sm">
                    {config.fidelizacion.habilitado &&
                    config.fidelizacion.compraPorPunto > 0
                      ? `Una compra elegible de $${Number(config.fidelizacion.compraPorPunto * 10).toLocaleString("es-CO")} genera 10 puntos. Canjearlos descontaría $${Number(config.fidelizacion.valorPunto * 10).toLocaleString("es-CO")}.`
                      : "Sin reglas activadas, las nuevas ventas no suman puntos automáticamente."}
                  </p>
                  <section>
                    <h2 className="text-xl font-bold">
                      Categorías que NO generan puntos
                    </h2>
                    <p className="my-2 text-sm text-gray-400">
                      Por ejemplo, marca Bebidas y deja Comidas sin marcar. Las
                      subcategorías se configuran individualmente.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {categorias.map((c) => (
                        <label
                          key={c.id}
                          className="flex gap-3 rounded bg-gray-800 p-3"
                        >
                          <input
                            type="checkbox"
                            checked={config.fidelizacion.categoriasExcluidas.includes(
                              c.id,
                            )}
                            onChange={() => toggle("categoriasExcluidas", c.id)}
                          />
                          {c.nombre}
                        </label>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h2 className="text-xl font-bold">
                      Productos que NO generan puntos
                    </h2>
                    <p className="my-2 text-sm text-gray-400">
                      Estas exclusiones se suman a las categorías anteriores.
                    </p>
                    <div className="grid max-h-80 gap-3 overflow-y-auto sm:grid-cols-2">
                      {productos.map((p) => (
                        <label
                          key={p.id}
                          className="flex gap-3 rounded bg-gray-800 p-3"
                        >
                          <input
                            type="checkbox"
                            checked={config.fidelizacion.productosExcluidos.includes(
                              p.id,
                            )}
                            onChange={() => toggle("productosExcluidos", p.id)}
                          />
                          {p.nombre}
                        </label>
                      ))}
                    </div>
                  </section>
                  <p className="text-sm text-gray-400">
                    Solo se calculan puntos en ventas con un cliente
                    identificado. El domicilio no genera puntos. Los descuentos
                    se reparten proporcionalmente entre los productos y se
                    redondea hacia abajo al punto entero. Los adicionales siguen
                    la regla del producto principal.
                  </p>
                  <button className="rounded-lg bg-orange-600 px-6 py-3 font-bold">
                    {busy ? "Guardando…" : "Guardar reglas de puntos"}
                  </button>
                </fieldset>
              </form>
            )
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
