"use client";

import { FormEvent, useEffect, useState } from "react";
import axios from "axios";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";
import ExcelDownload from "@/components/ExcelDownload";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/store/authStore";
import { useTema } from "@/components/ThemeProvider";

type Estadisticas = {
  ventas: number;
  cantidad: number;
  ticketPromedio: number;
  descuentos: number;
  anuladas: number;
  valorAnulado: number;
  variacion: number | null;
  filtro: {
    desde: string;
    hasta: string;
    dias: number;
    sucursalId: number | null;
  };
  anterior: { desde: string; hasta: string; total: number; cantidad: number };
  horas: {
    hora: string;
    total: number;
    promedioDiario: number;
    cantidad: number;
  }[];
  diarias: { fecha: string; total: number; cantidad: number }[];
  sucursales: { id: number; nombre: string; total: number; cantidad: number }[];
  medios: { medio: string; monto: number }[];
  productos: {
    id: number;
    nombre: string;
    cantidad: number;
    subtotal: number;
  }[];
  sucursalesDisponibles: { id: number; nombre: string; activo: boolean }[];
};
const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
    new Date(),
  );
const moneda = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
const tarjeta = "rounded-xl border border-gray-800 bg-gray-900 p-5";
const entrada =
  "mt-1 block rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white";

function EstadisticasContenido() {
  const usuario = useAuthStore((s) => s.usuario);
  const { tema } = useTema();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [sucursalId, setSucursalId] = useState("");
  const [filtro, setFiltro] = useState(() => ({
    desde: hoy(),
    hasta: hoy(),
    sucursalId: "",
  }));
  const [datos, setDatos] = useState<Estadisticas | null>(null);
  const [sucursales, setSucursales] = useState<
    Estadisticas["sucursalesDisponibles"]
  >([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const autorizado = ["ADMIN_EMPRESA", "GERENTE"].includes(usuario?.rol || "");
  useEffect(() => {
    if (!autorizado) return;
    let activo = true;
    const controlador = new AbortController();
    setCargando(true);
    setError("");
    api
      .get<Estadisticas>("/reportes/estadisticas", {
        params: filtro,
        signal: controlador.signal,
      })
      .then((r) => {
        if (activo) {
          setDatos(r.data);
          setSucursales(r.data.sucursalesDisponibles);
        }
      })
      .catch((e: unknown) => {
        if (activo) {
          setDatos(null);
          setError(
            axios.isAxiosError(e)
              ? String(
                  e.response?.data?.message ||
                    "No se pudieron cargar las estadísticas.",
                )
              : "No se pudieron cargar las estadísticas.",
          );
        }
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
      controlador.abort();
    };
  }, [autorizado, usuario?.empresaId, filtro]);
  const consultar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setFiltro({ desde, hasta, sucursalId });
  };
  const claro = tema === "claro";
  const colorEje = claro ? "#475569" : "#a1a1aa";
  const tooltip = {
    backgroundColor: claro ? "#fff" : "#18181b",
    border: "1px solid #52525b",
    borderRadius: 8,
    color: claro ? "#0f172a" : "#fff",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <header>
          <h1 className="text-2xl font-bold">Estadísticas del negocio</h1>
          <p className="mt-1 text-sm text-gray-400">
            Ventas por hora, sucursal, producto y medio de pago. Fechas en hora
            de Colombia.
          </p>
        {autorizado && <div className="mt-3"><ExcelDownload url="/reportes/estadisticas/exportar" filename={`estadisticas-${datos?.filtro.desde || desde}-${datos?.filtro.hasta || hasta}.xlsx`} disabled={cargando || !datos} params={datos ? { desde: datos.filtro.desde, hasta: datos.filtro.hasta, ...(datos.filtro.sucursalId ? { sucursalId: datos.filtro.sucursalId } : {}) } : undefined} /></div>}
        </header>
        {!autorizado ? (
          <p role="alert">
            Solo el administrador y el gerente pueden consultar estas
            estadísticas.
          </p>
        ) : (
          <>
            <form
              onSubmit={consultar}
              className={`${tarjeta} flex flex-wrap items-end gap-3`}
            >
              <div className="flex w-full flex-wrap gap-2" aria-label="Periodos rápidos">
                {(['Hoy', 'Esta semana', 'Este mes', 'Este año'] as const).map((periodo) => <button key={periodo} type="button" disabled={cargando} className="rounded-lg border border-gray-700 px-3 py-2 text-sm disabled:opacity-50" onClick={() => {
                  const fin = hoy();
                  let inicio = fin;
                  if (periodo === 'Esta semana') { const fecha = new Date(`${fin}T00:00:00Z`); fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay() + 6) % 7); inicio = fecha.toISOString().slice(0, 10); }
                  if (periodo === 'Este mes') inicio = `${fin.slice(0, 7)}-01`;
                  if (periodo === 'Este año') inicio = `${fin.slice(0, 4)}-01-01`;
                  setDesde(inicio); setHasta(fin); setFiltro({ desde: inicio, hasta: fin, sucursalId });
                }}>{periodo}</button>)}
              </div>
              <label className="text-sm">
                Desde
                <input
                  className={entrada}
                  required
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Hasta
                <input
                  className={entrada}
                  required
                  type="date"
                  min={desde}
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Sucursal
                <select
                  className={entrada}
                  value={sucursalId}
                  onChange={(e) => setSucursalId(e.target.value)}
                >
                  <option value="">Consolidado de la empresa</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                      {s.activo ? "" : " (inactiva)"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={cargando}
                className="rounded-lg bg-orange-600 px-4 py-2 disabled:opacity-50"
              >
                {cargando ? "Consultando…" : "Consultar"}
              </button>
            </form>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-950 p-3 text-red-200"
              >
                {error}
              </p>
            )}
            {datos && (
              <>
                <p className="text-sm text-gray-400">
                  Datos del {datos.filtro.desde} al {datos.filtro.hasta} ·{" "}
                  {datos.filtro.sucursalId
                    ? sucursales.find((s) => s.id === datos.filtro.sucursalId)
                        ?.nombre
                    : "Todas las sucursales"}
                  {cargando ? " · Actualizando…" : ""}
                </p>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Ventas registradas", moneda(datos.ventas)],
                    ["Cantidad de ventas", String(datos.cantidad)],
                    ["Ticket promedio", moneda(datos.ticketPromedio)],
                    ["Descuentos aplicados", moneda(datos.descuentos)],
                  ].map(([nombre, valor]) => (
                    <article key={nombre} className={tarjeta}>
                      <p className="text-sm text-gray-400">{nombre}</p>
                      <p className="mt-2 text-2xl font-bold">{valor}</p>
                    </article>
                  ))}
                </section>
                <section className="grid gap-3 md:grid-cols-3">
                  <article className={tarjeta}>
                    <h2 className="font-semibold">
                      Comparación con periodo anterior
                    </h2>
                    <p className="mt-2 text-xl">
                      {datos.variacion === null
                        ? "Sin base de comparación"
                        : `${datos.variacion > 0 ? "+" : ""}${datos.variacion}%`}
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      {datos.anterior.desde} a {datos.anterior.hasta}:{" "}
                      {moneda(datos.anterior.total)} · {datos.anterior.cantidad}{" "}
                      ventas
                    </p>
                  </article>
                  <article className={tarjeta}>
                    <h2 className="font-semibold">Ventas anuladas</h2>
                    <p className="mt-2 text-xl">
                      {datos.anuladas} · {moneda(datos.valorAnulado)}
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      Excluidas de las ventas y gráficas. Se agrupan por la
                      fecha original de la venta.
                    </p>
                  </article>
                  <article className={tarjeta}>
                    <h2 className="font-semibold">
                      Lectura de los indicadores
                    </h2>
                    <p className="mt-2 text-sm text-gray-400">
                      Las ventas incluyen domicilio y descuentos. Son
                      operaciones del POS; no representan facturación
                      electrónica validada ni utilidad contable.
                    </p>
                  </article>
                </section>
                {!datos.cantidad && (
                  <p role="status" className={tarjeta}>
                    No hay ventas vigentes en el periodo seleccionado.
                  </p>
                )}
                <section className="grid gap-4 lg:grid-cols-2">
                  <article className={tarjeta}>
                    <h2 className="mb-3 font-semibold">Ventas por hora</h2>
                    <p className="mb-3 text-xs text-gray-400">
                      Acumulado del periodo y promedio diario; incluye días sin
                      ventas.
                    </p>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={datos.horas}>
                          <CartesianGrid
                            stroke={claro ? "#e2e8f0" : "#27272a"}
                            strokeDasharray="3 3"
                          />
                          <XAxis
                            dataKey="hora"
                            stroke={colorEje}
                            minTickGap={20}
                          />
                          <YAxis
                            stroke={colorEje}
                            tickFormatter={(v: number) =>
                              `${Math.round(v / 1000)} mil`
                            }
                          />
                          <Tooltip contentStyle={tooltip} />
                          <Legend />
                          <Line
                            dataKey="total"
                            name="Ventas del periodo ($)"
                            stroke="#f97316"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            dataKey="promedioDiario"
                            name="Promedio diario ($)"
                            stroke="#14b8a6"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                  <article className={tarjeta}>
                    <h2 className="mb-3 font-semibold">Ventas por día</h2>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={datos.diarias}>
                          <CartesianGrid
                            stroke={claro ? "#e2e8f0" : "#27272a"}
                            strokeDasharray="3 3"
                          />
                          <XAxis
                            dataKey="fecha"
                            stroke={colorEje}
                            minTickGap={35}
                          />
                          <YAxis
                            stroke={colorEje}
                            tickFormatter={(v: number) =>
                              `${Math.round(v / 1000)} mil`
                            }
                          />
                          <Tooltip contentStyle={tooltip} />
                          <Bar
                            dataKey="total"
                            name="Ventas ($)"
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                  <article className={tarjeta}>
                    <h2 className="mb-3 font-semibold">Ventas por sucursal</h2>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={datos.sucursales} layout="vertical">
                          <CartesianGrid
                            stroke={claro ? "#e2e8f0" : "#27272a"}
                          />
                          <XAxis
                            type="number"
                            stroke={colorEje}
                            tickFormatter={(v: number) =>
                              `${Math.round(v / 1000)} mil`
                            }
                          />
                          <YAxis
                            type="category"
                            dataKey="nombre"
                            width={120}
                            stroke={colorEje}
                          />
                          <Tooltip contentStyle={tooltip} />
                          <Bar
                            dataKey="total"
                            name="Ventas ($)"
                            fill="#14b8a6"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                  <article className={tarjeta}>
                    <h2 className="mb-3 font-semibold">Medios de pago</h2>
                    <p className="mb-3 text-xs text-gray-400">
                      Los pagos mixtos se distribuyen entre sus medios.
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400">
                          <th className="pb-3">Medio</th>
                          <th className="pb-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.medios.map((m) => (
                          <tr
                            className="border-t border-gray-800"
                            key={m.medio}
                          >
                            <td className="py-3">{m.medio}</td>
                            <td className="text-right">{moneda(m.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-700 font-semibold">
                          <td className="pt-3">Total</td>
                          <td className="pt-3 text-right">
                            {moneda(
                              datos.medios.reduce(
                                (total, m) => total + m.monto,
                                0,
                              ),
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </article>
                </section>
                <section className={tarjeta}>
                  <h2 className="font-semibold">
                    Diez productos con mayor subtotal de venta
                  </h2>
                  <p className="my-2 text-xs text-gray-400">
                    Subtotales antes del descuento general y sin domicilio.
                    Incluyen adicionales; no son utilidad. Las cantidades de
                    granel se registran en su unidad base.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400">
                          <th className="py-3">Producto</th>
                          <th className="text-right">Cantidad registrada</th>
                          <th className="text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.productos.map((p) => (
                          <tr className="border-t border-gray-800" key={p.id}>
                            <td className="py-3">{p.nombre}</td>
                            <td className="text-right">
                              {p.cantidad.toLocaleString("es-CO")}
                            </td>
                            <td className="text-right">{moneda(p.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
export default function EstadisticasPage() {
  return (
    <AuthGuard>
      <EstadisticasContenido />
    </AuthGuard>
  );
}
