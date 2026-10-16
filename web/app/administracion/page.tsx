"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import api from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/store/authStore";

type Proveedor = {
  id: number;
  nombre: string;
  documento: string;
  email: string | null;
  telefono: string | null;
  plazoDias: number;
  activo: boolean;
};
type Abono = {
  id: number;
  monto: string;
  referencia: string;
  creadoEn: string;
};
type Cuenta = {
  id: number;
  tipo: "PAGAR" | "COBRAR";
  tercero: string;
  documento: string;
  descripcion: string;
  monto: string;
  saldo: string;
  vencimiento: string;
  anulada: boolean;
  compraGastoId: number | null;
  abonos: Abono[];
};
type Movimiento = {
  id: number;
  tipo: string;
  descripcion: string;
  monto: string;
  fecha: string;
  conciliacionAdministrativa: { referencia: string; fechaBanco: string } | null;
};
type Presupuesto = {
  categoria: string;
  presupuesto: string;
  ejecutado: string;
};
type Resumen = {
  cuentas: { tipo: string; _sum: { saldo: string }; _count: number }[];
  vencidas: { tipo: string; _sum: { saldo: string }; _count: number }[];
};
type Tab = "cuentas" | "proveedores" | "conciliacion" | "presupuestos";
const cop = (valor: string | number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  }).format(Number(valor));
const dia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
    new Date(),
  );
const campo =
  "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white";
const boton =
  "rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-50";
const panel = "rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3";

function Controles() {
  const usuario = useAuthStore((state) => state.usuario);
  const permitido =
    ["ADMIN_EMPRESA", "GERENTE"].includes(usuario?.rol || "") &&
    usuario?.permisos?.administracion === true;
  const [tab, setTab] = useState<Tab>("cuentas");
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [periodo, setPeriodo] = useState(() => dia().slice(0, 7));
  const [desde, setDesde] = useState(() => `${dia().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(dia);
  const [seleccionada, setSeleccionada] = useState<Cuenta | null>(null);
  const [detalleAbono, setDetalleAbono] = useState({
    monto: "",
    referencia: "",
  });
  const claveAbono = useRef("");
  const operacion = useRef(false);

  const informarError = (e: unknown) =>
    setError(
      axios.isAxiosError(e)
        ? String(
            e.response?.data?.message ||
              "No se pudo completar la operación. Verifica la conexión antes de repetirla.",
          )
        : "No se pudo completar la operación.",
    );
  const cargar = useCallback(async () => {
    if (!permitido) return;
    setCargando(true);
    try {
      const [p, c, r] = await Promise.all([
        api.get<Proveedor[]>("/administracion/proveedores"),
        api.get<Cuenta[]>("/administracion/cuentas"),
        api.get<Resumen>("/administracion/resumen"),
      ]);
      setProveedores(p.data);
      setCuentas(c.data);
      setResumen(r.data);
    } catch (e) {
      informarError(e);
    } finally {
      setCargando(false);
    }
  }, [permitido]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function ejecutar(tarea: () => Promise<unknown>, mensaje: string) {
    if (operacion.current) return;
    operacion.current = true;
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      await tarea();
      setAviso(mensaje);
      await cargar();
    } catch (e) {
      informarError(e);
    } finally {
      operacion.current = false;
      setOcupado(false);
    }
  }

  async function crearProveedor(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    await ejecutar(async () => {
      await api.post("/administracion/proveedores", {
        nombre: datos.get("nombre"),
        documento: datos.get("documento"),
        email: datos.get("email"),
        telefono: datos.get("telefono"),
        direccion: datos.get("direccion"),
        plazoDias: Number(datos.get("plazoDias")),
      });
      formulario.reset();
    }, "Proveedor registrado.");
  }

  async function crearCuenta(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    await ejecutar(async () => {
      await api.post("/administracion/cuentas", {
        tipo: datos.get("tipo"),
        tercero: datos.get("tercero"),
        documento: datos.get("documento"),
        descripcion: datos.get("descripcion"),
        monto: datos.get("monto"),
        vencimiento: datos.get("vencimiento"),
      });
      formulario.reset();
    }, "Cuenta registrada. El dinero se registra al guardar cada abono.");
  }

  async function cargarMovimientos() {
    await ejecutar(async () => {
      const respuesta = await api.get<Movimiento[]>(
        "/administracion/movimientos",
        { params: { desde, hasta } },
      );
      setMovimientos(respuesta.data);
    }, "Movimientos actualizados.");
  }

  async function cargarPresupuestos() {
    await ejecutar(async () => {
      const respuesta = await api.get<Presupuesto[]>(
        "/administracion/presupuestos",
        { params: { periodo } },
      );
      setPresupuestos(respuesta.data);
    }, "Presupuesto actualizado.");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navbar />
      <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold">Administración</h1>
          <p className="text-gray-400">
            Proveedores, obligaciones, recaudos, conciliación y presupuesto.
          </p>
        </div>
        {!permitido ? (
          <p role="status" className={panel}>
            Estos controles requieren habilitación para tu empresa y acceso de
            administrador o gerente.
          </p>
        ) : (
          <>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-950 p-3 text-red-200"
              >
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(["PAGAR", "COBRAR"] as const).flatMap((tipo) =>
                [false, true].map((vencido) => {
                  const grupo = (
                    vencido ? resumen?.vencidas : resumen?.cuentas
                  )?.find((r) => r.tipo === tipo);
                  return (
                    <div key={`${tipo}-${vencido}`} className={panel}>
                      <p className="text-sm text-gray-400">
                        {tipo === "PAGAR" ? "Por pagar" : "Por cobrar"}
                        {vencido ? " vencido" : ""}
                      </p>
                      <p className="text-xl font-semibold">
                        {resumen ? cop(grupo?._sum.saldo || 0) : "—"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {grupo?._count || 0} cuenta(s)
                      </p>
                    </div>
                  );
                }),
              )}
            </div>
            <nav
              aria-label="Controles administrativos"
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  ["cuentas", "Cuentas y abonos"],
                  ["proveedores", "Proveedores"],
                  ["conciliacion", "Conciliación"],
                  ["presupuestos", "Presupuestos"],
                ] as [Tab, string][]
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  onClick={() => {
                    setTab(valor);
                    setError("");
                    setAviso("");
                  }}
                  aria-current={tab === valor ? "page" : undefined}
                  className={
                    tab === valor
                      ? boton
                      : "rounded-lg border border-gray-700 px-4 py-2"
                  }
                >
                  {etiqueta}
                </button>
              ))}
            </nav>
            {cargando && <p role="status">Actualizando información…</p>}
            {tab === "proveedores" && (
              <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <form onSubmit={crearProveedor} className={panel}>
                  <h2 className="font-semibold">Nuevo proveedor</h2>
                  <label className="block">
                    Nombre
                    <input
                      name="nombre"
                      required
                      maxLength={250}
                      className={campo}
                    />
                  </label>
                  <label className="block">
                    NIT o documento
                    <input
                      name="documento"
                      required
                      maxLength={40}
                      className={campo}
                    />
                  </label>
                  <label className="block">
                    Correo
                    <input
                      name="email"
                      type="email"
                      maxLength={250}
                      className={campo}
                    />
                  </label>
                  <label className="block">
                    Teléfono
                    <input name="telefono" maxLength={40} className={campo} />
                  </label>
                  <label className="block">
                    Dirección
                    <input name="direccion" maxLength={250} className={campo} />
                  </label>
                  <label className="block">
                    Plazo de pago en días
                    <input
                      name="plazoDias"
                      type="number"
                      min="0"
                      max="3650"
                      defaultValue="0"
                      required
                      className={campo}
                    />
                  </label>
                  <button disabled={ocupado} className={boton}>
                    Guardar proveedor
                  </button>
                </form>
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">
                    Se muestran hasta 500 proveedores.
                  </p>
                  {proveedores.map((p) => (
                    <article className={panel} key={p.id}>
                      <h2 className="font-semibold">
                        {p.nombre} {!p.activo && "(Inactivo)"}
                      </h2>
                      <p>
                        {p.documento} · {p.plazoDias} días de plazo
                      </p>
                      <p className="text-gray-400">
                        {p.email} {p.telefono}
                      </p>
                      <button
                        disabled={ocupado}
                        className="text-orange-400"
                        onClick={() =>
                          void ejecutar(
                            () =>
                              api.patch(`/administracion/proveedores/${p.id}`, {
                                activo: !p.activo,
                              }),
                            "Estado del proveedor actualizado.",
                          )
                        }
                      >
                        {p.activo ? "Desactivar" : "Activar"}
                      </button>
                    </article>
                  ))}
                  {!proveedores.length && !cargando && (
                    <p>No hay proveedores registrados.</p>
                  )}
                </div>
              </section>
            )}
            {tab === "cuentas" && (
              <section className="space-y-4">
                <p className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
                  Registra únicamente obligaciones o cartera que todavía no
                  estén contabilizadas como pagos o recaudos. Este control es
                  independiente del POS y de Compras; no vuelvas a registrar sus
                  ventas o compras pagadas. Los abonos generan movimientos de
                  dinero y no modifican el inventario.
                </p>
                <form
                  onSubmit={crearCuenta}
                  className={`${panel} grid gap-3 md:grid-cols-3`}
                >
                  <label>
                    Tipo
                    <select name="tipo" className={campo}>
                      <option value="PAGAR">Cuenta por pagar</option>
                      <option value="COBRAR">Cuenta por cobrar</option>
                    </select>
                  </label>
                  <label>
                    Tercero
                    <input
                      name="tercero"
                      list="terceros"
                      required
                      maxLength={250}
                      className={campo}
                    />
                    <datalist id="terceros">
                      {proveedores
                        .filter((p) => p.activo)
                        .map((p) => (
                          <option
                            key={p.id}
                            value={`${p.nombre} (${p.documento})`}
                          />
                        ))}
                    </datalist>
                  </label>
                  <label>
                    Referencia única (NIT y documento)
                    <input
                      name="documento"
                      required
                      maxLength={100}
                      className={campo}
                    />
                  </label>
                  <label>
                    Descripción
                    <input
                      name="descripcion"
                      required
                      maxLength={500}
                      className={campo}
                    />
                  </label>
                  <label>
                    Valor pendiente
                    <input
                      name="monto"
                      type="number"
                      required
                      min="0.01"
                      max="99999999.99"
                      step="0.01"
                      className={campo}
                    />
                  </label>
                  <label>
                    Vencimiento
                    <input
                      name="vencimiento"
                      type="date"
                      required
                      className={campo}
                    />
                  </label>
                  <button disabled={ocupado} className={boton}>
                    Registrar cuenta
                  </button>
                </form>
                <p className="text-sm text-gray-400">
                  Hasta 500 cuentas, ordenadas por vencimiento. Los totales
                  superiores incluyen todas las cuentas.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {cuentas.map((c) => (
                    <article key={c.id} className={panel}>
                      <h2 className="font-semibold">
                        {c.tipo === "PAGAR" ? "Pagar a" : "Cobrar a"}{" "}
                        {c.tercero}
                      </h2>
                      <p>
                        {c.documento} · {c.descripcion}
                      </p>
                      <p>
                        Saldo: <strong>{cop(c.saldo)}</strong> de {cop(c.monto)}
                      </p>
                      <p className="text-sm text-gray-400">
                        Vence:{" "}
                        {new Date(c.vencimiento).toLocaleDateString("es-CO", {
                          timeZone: "America/Bogota",
                        })}{" "}
                        ·{" "}
                        {c.anulada
                          ? "Anulada"
                          : Number(c.saldo) === 0
                            ? "Saldada"
                            : "Pendiente"}
                      </p>
                      {!c.anulada && Number(c.saldo) > 0 && (
                        <button
                          disabled={ocupado}
                          className={boton}
                          onClick={() => {
                            claveAbono.current = crypto.randomUUID();
                            setDetalleAbono({ monto: "", referencia: "" });
                            setSeleccionada(c);
                          }}
                        >
                          Registrar abono
                        </button>
                      )}
                      {!c.anulada &&
                        !c.compraGastoId &&
                        !c.abonos.length &&
                        usuario?.rol === "ADMIN_EMPRESA" && (
                          <button
                            disabled={ocupado}
                            className="ml-3 text-red-300"
                            onClick={() => {
                              const motivo = window.prompt(
                                "Motivo de anulación de esta cuenta",
                              );
                              if (motivo)
                                void ejecutar(
                                  () =>
                                    api.post(
                                      `/administracion/cuentas/${c.id}/anular`,
                                      { motivo },
                                    ),
                                  "Cuenta anulada.",
                                );
                            }}
                          >
                            Anular cuenta
                          </button>
                        )}
                      {!!c.abonos.length && (
                        <details>
                          <summary>
                            Historial de abonos ({c.abonos.length})
                          </summary>
                          {c.abonos.map((a) => (
                            <p
                              key={a.id}
                              className="py-1 text-sm text-gray-400"
                            >
                              {new Date(a.creadoEn).toLocaleString("es-CO")} ·{" "}
                              {cop(a.monto)} · {a.referencia}
                            </p>
                          ))}
                        </details>
                      )}
                    </article>
                  ))}
                </div>
                {!cuentas.length && !cargando && (
                  <p>No hay cuentas registradas.</p>
                )}
              </section>
            )}
            {tab === "conciliacion" && (
              <section className={panel}>
                <h2 className="font-semibold">
                  Comparar movimientos con el banco
                </h2>
                <p className="text-sm text-gray-400">
                  Verifica el importe y la referencia contra tu extracto antes
                  de conciliar. Se muestran hasta 1.000 movimientos del periodo.
                  El costo de venta se excluye porque no es un pago bancario.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label>
                    Desde
                    <input
                      type="date"
                      value={desde}
                      onChange={(e) => setDesde(e.target.value)}
                      className={campo}
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      type="date"
                      value={hasta}
                      onChange={(e) => setHasta(e.target.value)}
                      className={campo}
                    />
                  </label>
                  <button
                    disabled={ocupado}
                    onClick={() => void cargarMovimientos()}
                    className={boton}
                  >
                    Consultar
                  </button>
                </div>
                {movimientos.map((m) => (
                  <article
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 py-3"
                  >
                    <div>
                      <p>{m.descripcion}</p>
                      <p className="text-sm text-gray-400">
                        {m.tipo} · {cop(m.monto)} ·{" "}
                        {new Date(m.fecha).toLocaleDateString("es-CO")}
                      </p>
                    </div>
                    {m.conciliacionAdministrativa ? (
                      <p className="text-emerald-400">
                        Conciliado · {m.conciliacionAdministrativa.referencia}
                      </p>
                    ) : (
                      <button
                        disabled={ocupado}
                        className={boton}
                        onClick={() => {
                          const referencia = window.prompt(
                            "Referencia del movimiento en el extracto bancario",
                          );
                          if (!referencia) return;
                          const fechaBanco = window.prompt(
                            "Fecha del banco (AAAA-MM-DD)",
                            dia(),
                          );
                          if (!fechaBanco) return;
                          void ejecutar(async () => {
                            await api.post(
                              `/administracion/movimientos/${m.id}/conciliar`,
                              { referencia, fechaBanco },
                            );
                            const r = await api.get<Movimiento[]>(
                              "/administracion/movimientos",
                              { params: { desde, hasta } },
                            );
                            setMovimientos(r.data);
                          }, "Movimiento conciliado.");
                        }}
                      >
                        Conciliar
                      </button>
                    )}
                  </article>
                ))}
              </section>
            )}
            {tab === "presupuestos" && (
              <section className={panel}>
                <h2 className="font-semibold">
                  Presupuesto mensual de egresos
                </h2>
                <p className="text-sm text-gray-400">
                  Compara límites de gasto con egresos registrados. No
                  representa un estado contable ni compromisos futuros.
                </p>
                <div className="flex items-end gap-3">
                  <label>
                    Mes
                    <input
                      type="month"
                      value={periodo}
                      onChange={(e) => {
                        setPeriodo(e.target.value);
                        setPresupuestos([]);
                      }}
                      className={campo}
                    />
                  </label>
                  <button
                    disabled={ocupado}
                    onClick={() => void cargarPresupuestos()}
                    className={boton}
                  >
                    Consultar
                  </button>
                </div>
                {presupuestos.map((p) => (
                  <div
                    key={p.categoria}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 py-3"
                  >
                    <div>
                      <p>{p.categoria.replaceAll("_", " ")}</p>
                      <p className="text-sm text-gray-400">
                        Presupuesto: {cop(p.presupuesto)} · Ejecutado:{" "}
                        {cop(p.ejecutado)} · Disponible:{" "}
                        {cop(Number(p.presupuesto) - Number(p.ejecutado))}
                      </p>
                    </div>
                    {usuario?.rol === "ADMIN_EMPRESA" && (
                      <button
                        disabled={ocupado}
                        className={boton}
                        onClick={() => {
                          const monto = window.prompt(
                            "Presupuesto del mes (hasta dos decimales, usa punto decimal)",
                            p.presupuesto,
                          );
                          if (!monto) return;
                          void ejecutar(async () => {
                            await api.post("/administracion/presupuestos", {
                              periodo,
                              categoria: p.categoria,
                              monto,
                            });
                            const r = await api.get<Presupuesto[]>(
                              "/administracion/presupuestos",
                              { params: { periodo } },
                            );
                            setPresupuestos(r.data);
                          }, "Presupuesto guardado.");
                        }}
                      >
                        Definir límite
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}
            {seleccionada && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
                <form
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="abono-titulo"
                  className={`${panel} w-full max-w-md bg-gray-950`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ejecutar(async () => {
                      await api.post(
                        `/administracion/cuentas/${seleccionada.id}/abonos`,
                        { ...detalleAbono, clave: claveAbono.current },
                      );
                      setSeleccionada(null);
                    }, "Abono registrado y saldo actualizado.");
                  }}
                >
                  <h2 id="abono-titulo" className="text-lg font-semibold">
                    Abono · {seleccionada.documento}
                  </h2>
                  <p>Saldo: {cop(seleccionada.saldo)}</p>
                  <label className="block">
                    Monto
                    <input
                      autoFocus
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      max={seleccionada.saldo}
                      value={detalleAbono.monto}
                      onChange={(e) =>
                        setDetalleAbono((a) => ({
                          ...a,
                          monto: e.target.value,
                        }))
                      }
                      className={campo}
                    />
                  </label>
                  <label className="block">
                    Referencia del pago
                    <input
                      required
                      maxLength={100}
                      value={detalleAbono.referencia}
                      onChange={(e) =>
                        setDetalleAbono((a) => ({
                          ...a,
                          referencia: e.target.value,
                        }))
                      }
                      className={campo}
                    />
                  </label>
                  {error && (
                    <p role="alert" className="text-red-300">
                      {error}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button disabled={ocupado} className={boton}>
                      Confirmar abono
                    </button>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => setSeleccionada(null)}
                    >
                      Cerrar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function AdministracionPage() {
  return (
    <AuthGuard>
      <Controles />
    </AuthGuard>
  );
}
