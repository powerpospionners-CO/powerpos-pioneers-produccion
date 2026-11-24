"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import SelectorArchivoPersonal from "@/components/SelectorArchivoPersonal";
import AlertaSistema from "@/components/AlertaSistema";
import { iniciarGuardado, terminarCarga } from "@/lib/cargas";
import api from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import DocumentosEmpresa from "@/components/DocumentosEmpresa";
import PagoNomina from "@/components/PagoNomina";
import EditorContratos from "@/components/EditorContratos";
import { useAuthStore } from "@/store/authStore";

type Registro = {
  copia?: string;
  comprobanteCorreo?: string;
  id: string;
  tipo: string;
  estado: string;
  datos: Record<string, any>;
}; // Las estructuras documentales provienen del expediente cifrado.
type Campo = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: string | boolean;
  optional?: boolean;
  sugerencias?: string[];
};
const money = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(
    (n || 0) / 100,
  );
const estado = (s: string) => s.replaceAll("_", " ");
const hoy = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const boton =
  "rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-40";
const control =
  "w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-white";
function Formulario({
  title,
  campos,
  onSubmit,
  submitLabel = "Guardar",
}: {
  title: string;
  submitLabel?: string;
  campos: Campo[];
  onSubmit: (d: Record<string, any>) => Promise<void>;
}) {
  const operacion = useRef("");
  const [subidas, setSubidas] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      d: Record<string, any> = {};
    setBusy(true);
    setError("");
    const proceso = iniciarGuardado();
    try {
      for (const c of campos) {
        const v = fd.get(c.name);
        if (c.type === "checkbox") d[c.name] = v === "on";
        else if (c.type === "file") {
          if (!v && !c.optional)
            throw Error(
              `Selecciona y termina de subir el documento: ${c.label}`,
            );
          d[c.name] = v || undefined;
        } else d[c.name] = v || undefined;
      }
      operacion.current ||= crypto.randomUUID();
      d.idempotencia = operacion.current;
      await onSubmit(d);
      operacion.current = "";
    } catch (e: any) {
      setError(
        String(e.response?.data?.message || e.message || "No se pudo guardar"),
      );
    } finally {
      terminarCarga(proceso);
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5"
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <fieldset
        disabled={busy || subidas > 0}
        className="grid gap-4 md:grid-cols-2"
      >
        {campos.map((c) => (
          <label
            key={c.name}
            className={
              c.type === "textarea" || c.type === "checkbox"
                ? "md:col-span-2 text-sm"
                : "text-sm"
            }
          >
            {c.type === "checkbox" ? (
              <span className="flex gap-3">
                <input
                  name={c.name}
                  type="checkbox"
                  required={!c.optional}
                  defaultChecked={c.value === true}
                />
                {c.label}
              </span>
            ) : (
              <>
                {c.label}
                {c.type === "textarea" ? (
                  <textarea
                    className={control}
                    name={c.name}
                    required={!c.optional}
                    defaultValue={String(c.value || "")}
                    rows={4}
                  />
                ) : c.options ? (
                  <select
                    className={control}
                    name={c.name}
                    required={!c.optional}
                    defaultValue={String(c.value || "")}
                  >
                    <option value="">Selecciona</option>
                    {c.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : c.type === "file" ? (
                  <SelectorArchivoPersonal
                    name={c.name}
                    required={!c.optional}
                    className={control}
                    onOcupado={(ocupado) =>
                      setSubidas((n) => Math.max(0, n + (ocupado ? 1 : -1)))
                    }
                  />
                ) : (
                  <input
                    className={control}
                    name={c.name}
                    type={c.type || "text"}
                    list={c.sugerencias ? `lista-${c.name}` : undefined}
                    required={!c.optional}
                    defaultValue={String(c.value || "")}
                    step={c.type === "number" ? "0.01" : undefined}
                    min={c.type === "number" ? "0" : undefined}
                    autoComplete={
                      c.type === "password" ? "current-password" : undefined
                    }
                  />
                )}
              </>
            )}
            {c.sugerencias && (
              <datalist id={`lista-${c.name}`}>
                {c.sugerencias.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <button className={boton} disabled={busy || subidas > 0}>
        {subidas > 0
          ? "Subiendo documento…"
          : busy
            ? "Guardando…"
            : submitLabel}
      </button>
    </form>
  );
}
export default function Personal() {
  return (
    <AuthGuard>
      <Contenido />
    </AuthGuard>
  );
}
function Contenido() {
  const usuario = useAuthStore((s) => s.usuario),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [mensaje, setMensaje] = useState(""),
    [tab, setTab] = useState("empleados"),
    [avisoPlantilla, setAvisoPlantilla] = useState<Registro | null>(null),
    [editar, setEditar] = useState<Registro | null>(null),
    [accion, setAccion] = useState<Registro | null>(null),
    [historial, setHistorial] = useState<any>(null),
    [ocupado, setOcupado] = useState(false),
    [conceptos, setConceptos] = useState([
      {
        tipo: "DEVENGADO",
        nombre: "Salario del periodo",
        monto: "",
        fundamento: "",
        soporteId: "",
      },
    ]);
  const cargar = useCallback(async () => {
    try {
      setData((await api.get("/personal")).data);
      setError("");
    } catch (e: any) {
      setError(
        String(e.response?.data?.message || "No fue posible cargar Personal"),
      );
    }
  }, []);
  useEffect(() => {
    if (usuario?.rol === "ADMIN_EMPRESA") void cargar();
  }, [cargar, usuario?.rol]);
  async function guardar(ruta: string, d: Record<string, any>, patch = false) {
    setMensaje("");
    await (patch ? api.patch(ruta, d) : api.post(ruta, d));
    setMensaje("Guardado.");
    setEditar(null);
    setAccion(null);
    await cargar();
  }
  async function ejecutar(
    fn: () => Promise<any>,
    ok = "Operación completada.",
  ) {
    setOcupado(true);
    setMensaje("");
    setError("");
    try {
      await fn();
      setMensaje(ok);
      await cargar();
    } catch (e: any) {
      setError(String(e.response?.data?.message || e.message));
    } finally {
      setOcupado(false);
    }
  }
  async function descargar(id: string, tipo = "paquete") {
    const r = await api.get(`/personal/${id}/${tipo}`, {
        responseType: "blob",
      }),
      url = URL.createObjectURL(r.data),
      a = document.createElement("a");
    a.href = url;
    a.download =
      tipo === "documento" ? "documento.pdf" : "documento-laboral.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const empleados: Registro[] = data?.empleados || [],
    periodos: Registro[] = data?.periodos || [],
    pagos: Registro[] = data?.pagos || [],
    plantillas: Registro[] = data?.plantillas || [],
    contratos: Registro[] = data?.contratos || [];
  const opciones = empleados.map((e) => ({
    value: e.id,
    label: e.datos.nombre + (e.estado === "RETIRADO" ? " (retirado)" : ""),
  }));
  const camposEmpleado: Campo[] = [
    { name: "nombre", label: "Nombre completo", value: editar?.datos.nombre },
    {
      name: "identificacion",
      label: "Identificación",
      value: editar?.datos.identificacion,
    },
    {
      name: "cargo",
      label: "Cargo",
      value: editar?.datos.cargo,
      sugerencias: data?.cargosEmpresa || [],
    },
    {
      name: "email",
      label: "Correo personal del empleado (él debe controlarlo)",
      type: "email",
      value: editar?.datos.email,
    },
    {
      name: "ingreso",
      label: "Fecha real de ingreso",
      type: "date",
      value: editar?.datos.ingreso,
    },
    {
      name: "salario",
      label: "Salario básico mensual COP (sin auxilio de transporte)",
      type: "number",
      value: editar ? String(editar.datos.salarioCentavos / 100) : "",
    },
    {
      name: "frecuencia",
      label: "Frecuencia de pago",
      options: ["QUINCENAL", "MENSUAL", "SEMANAL"].map((value) => ({
        value,
        label: value,
      })),
      value: editar?.datos.frecuencia,
    },
    {
      name: "domicilio",
      label: "Domicilio del empleado (para completar contratos)",
      optional: true,
      value: editar?.datos.domicilio,
    },
    {
      name: "funciones",
      label:
        "Funciones específicas (para contratos; si está vacío se usa la plantilla)",
      type: "textarea",
      optional: true,
      value: editar?.datos.funciones,
    },
    {
      name: "lugarServicio",
      label:
        "Lugar de trabajo del empleado (opcional si usa el de la plantilla)",
      optional: true,
      value: editar?.datos.lugarServicio,
    },
    {
      name: "eps",
      label: "EPS del empleado",
      optional: true,
      value: editar?.datos.eps,
    },
    {
      name: "fondoPensiones",
      label: "Fondo de pensiones del empleado",
      optional: true,
      value: editar?.datos.fondoPensiones,
    },
    {
      name: "banco",
      label: "Banco de la cuenta de nómina (ejemplo: Davivienda)",
      optional: true,
      value: editar?.datos.cuentaNomina?.banco,
    },
    {
      name: "tipoCuenta",
      label: "Tipo de cuenta de nómina",
      optional: true,
      value: editar?.datos.cuentaNomina?.tipo,
      options: [
        { value: "AHORROS", label: "Ahorros" },
        { value: "CORRIENTE", label: "Corriente" },
      ],
    },
    {
      name: "numeroCuenta",
      label: "Número de cuenta del empleado (se guarda cifrado)",
      optional: true,
      value: editar?.datos.cuentaNomina?.numero,
    },
    {
      name: "activo",
      label: "Empleado activo",
      type: "checkbox",
      optional: true,
      value: editar ? editar.estado === "ACTIVO" : true,
    },
  ];
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-950 p-4 text-gray-100 md:p-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <h1 className="text-3xl font-bold">Personal y pagos</h1>
          <p className="text-gray-400">
            Expedientes privados de esta sede. Registra los pagos reales,
            entrega su soporte y permite que cada empleado confirme o presente
            diferencias.
          </p>
          {usuario?.rol !== "ADMIN_EMPRESA" ? (
            <p role="alert">
              Solo el administrador de la empresa puede acceder a estos
              expedientes.
            </p>
          ) : (
            <>
              {error && <AlertaSistema tipo="error">{error}</AlertaSistema>}
              {mensaje && <AlertaSistema tipo="exito">{mensaje}</AlertaSistema>}
              {data && (
                <>
                  <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-4 text-sm">
                    Nómina electrónica DIAN: <strong>sin conectar</strong>. Los
                    comprobantes internos no acreditan transmisión DIAN. Los
                    conceptos deben revisarse con el responsable de nómina y los
                    contratos con asesoría jurídica.{" "}
                    {!data.correoConfigurado && (
                      <p className="mt-2">
                        Correo institucional pendiente de configurar: aún no se
                        pueden enviar invitaciones ni códigos.
                      </p>
                    )}
                  </div>
                  <nav
                    aria-label="Secciones de Personal"
                    className="flex flex-wrap gap-2"
                  >
                    {[
                      ["empleados", "Empleados"],
                      ["pagos", "Periodos y pagos"],
                      ["contratos", "Contratos"],
                      ["config", "Privacidad"],
                      ["afiliaciones", "Configuración laboral"],
                      ["plantillas", "Plantillas y políticas"],
                    ].map(([v, l]) => (
                      <button
                        type="button"
                        key={v}
                        className={
                          tab === v
                            ? boton
                            : "rounded-lg border border-gray-700 px-4 py-2"
                        }
                        onClick={() => {
                          setTab(v);
                          setAccion(null);
                          setHistorial(null);
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </nav>
                  {tab === "plantillas" && (
                    <DocumentosEmpresa
                      empleados={empleados}
                      config={data.config}
                      onCambio={cargar}
                      onUsarAviso={(r) => {
                        setAvisoPlantilla(r);
                        setTab("config");
                      }}
                    />
                  )}
                  {tab === "config" && (
                    <section className="space-y-4">
                      <p>
                        Vincula el aviso resumido con la política completa.
                        Puedes crearla o cargarla en{" "}
                        <button
                          type="button"
                          className="text-orange-300 underline"
                          onClick={() => setTab("plantillas")}
                        >
                          Plantillas y políticas
                        </button>
                        . Usa una versión adoptada del sistema o un enlace
                        externo HTTPS.
                      </p>
                      {data.config?.politicaId && (
                        <button
                          type="button"
                          className="text-orange-300 underline"
                          onClick={() =>
                            void ejecutar(async () => {
                              const r = await api.get(
                                `/personal/documentos-empresa/${data.config.politicaId}/pdf`,
                                { responseType: "blob" },
                              );
                              const u = URL.createObjectURL(r.data);
                              const a = document.createElement("a");
                              a.href = u;
                              a.download = "politica-completa.pdf";
                              a.click();
                              setTimeout(() => URL.revokeObjectURL(u), 30000);
                            })
                          }
                        >
                          Consultar política completa vinculada
                        </button>
                      )}
                      {(data.politicas || [])
                        .filter(
                          (p: Registro) =>
                            p.id === data.config?.politicaId &&
                            p.datos.publicada,
                        )
                        .map((p: any) => (
                          <p key={p.id} className="break-all">
                            Enlace público de la política:{" "}
                            <a
                              className="text-orange-300 underline"
                              href={`${String(api.defaults.baseURL).replace(/\/$/, "")}/personal-politicas/${p.empresaId}/${p.sucursalId}/${p.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >{`${String(api.defaults.baseURL).replace(/\/$/, "")}/personal-politicas/${p.empresaId}/${p.sucursalId}/${p.id}`}</a>
                          </p>
                        ))}
                      {data.config?.enlacePolitica && (
                        <a
                          className="block text-orange-300 underline"
                          href={data.config.enlacePolitica}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Consultar política completa en su enlace externo
                        </a>
                      )}
                      <Formulario
                        key={`${data.config?.version || "config"}-${avisoPlantilla?.id || ""}`}
                        title="Aviso de privacidad del empleador"
                        campos={[
                          {
                            name: "responsable",
                            label: "Razón social y responsable del tratamiento",
                            value:
                              avisoPlantilla?.datos.responsable ||
                              data.config?.responsable,
                          },
                          {
                            name: "correo",
                            label:
                              "Correo para consultas, correcciones y reclamaciones",
                            type: "email",
                            value:
                              avisoPlantilla?.datos.correo ||
                              data.config?.correo,
                          },
                          {
                            name: "politica",
                            label:
                              "Aviso revisado: finalidades laborales, derechos, canal de atención, acceso, conservación y entrega de copias",
                            type: "textarea",
                            value:
                              avisoPlantilla?.datos.contenido ||
                              data.config?.politica,
                          },
                          {
                            name: "politicaId",
                            label:
                              "Política completa del sistema (versión adoptada)",
                            optional: true,
                            value: data.config?.politicaId,
                            options: (data.politicas || []).map(
                              (p: Registro) => ({
                                value: p.id,
                                label: `${p.datos.nombre} · ${p.datos.versionEtiqueta}`,
                              }),
                            ),
                          },
                          {
                            name: "enlacePolitica",
                            label:
                              "O enlace externo HTTPS a la política completa (deja vacío si elegiste una política del sistema)",
                            type: "url",
                            optional: true,
                            value: data.config?.enlacePolitica,
                          },
                          {
                            name: "acepta",
                            label:
                              "He revisado el aviso aplicable a mi empresa y brindaré una alternativa en papel, sin impedir la contratación.",
                            type: "checkbox",
                          },
                        ]}
                        onSubmit={(d) => guardar("/personal/configuracion", d)}
                      />
                      <p className="text-sm text-gray-400">
                        Esta revisión es del administrador. No firma ni autoriza
                        el tratamiento en nombre del empleado. La política y su
                        versión se incluyen en las nuevas invitaciones privadas.
                      </p>
                    </section>
                  )}
                  {tab === "empleados" && (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <section className="space-y-3">
                        <h2 className="text-xl font-semibold">
                          Empleados de la sede
                        </h2>
                        {!empleados.length && (
                          <p>
                            Aún no hay empleados. Configura primero Privacidad.
                          </p>
                        )}
                        {empleados.map((e) => (
                          <article
                            className="rounded-xl border border-gray-800 p-4"
                            key={e.id}
                          >
                            <strong>{e.datos.nombre}</strong>
                            <p>
                              {e.datos.cargo} · {estado(e.estado)}
                            </p>
                            <p className="text-sm text-gray-400">
                              {e.datos.email} · {money(e.datos.salarioCentavos)}
                            </p>
                            <button
                              type="button"
                              className="mt-2 text-orange-400 underline"
                              onClick={() => setEditar(e)}
                            >
                              Editar expediente
                            </button>
                          </article>
                        ))}
                        {editar && (
                          <button type="button" onClick={() => setEditar(null)}>
                            Cancelar edición
                          </button>
                        )}
                      </section>
                      <Formulario
                        key={editar?.id || "nuevo"}
                        title={
                          editar ? "Editar empleado" : "Registrar empleado"
                        }
                        campos={camposEmpleado}
                        onSubmit={(d) =>
                          guardar(
                            `/personal/empleados${editar ? "/" + editar.id : ""}`,
                            d,
                            !!editar,
                          )
                        }
                      />
                    </div>
                  )}
                  {tab === "pagos" && (
                    <>
                      <div className="grid gap-6 lg:grid-cols-2">
                        <section className="space-y-4">
                          <h2 className="text-xl">Conceptos del periodo</h2>
                          <p className="text-sm text-gray-400">
                            Valores del periodo, no del mes completo. Incluye
                            las novedades, aportes y retenciones que determine
                            el responsable de nómina. No se calculan
                            automáticamente.
                          </p>
                          {conceptos.map((c, i) => (
                            <div
                              key={i}
                              className="space-y-2 rounded-lg border border-gray-700 p-3"
                            >
                              <label>
                                Tipo
                                <select
                                  className={control}
                                  value={c.tipo}
                                  onChange={(e) =>
                                    setConceptos((cs) =>
                                      cs.map((x, j) =>
                                        j === i
                                          ? { ...x, tipo: e.target.value }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  <option>DEVENGADO</option>
                                  <option>DEDUCCION</option>
                                </select>
                              </label>
                              {(
                                [
                                  "nombre",
                                  "monto",
                                  ...(c.tipo === "DEDUCCION"
                                    ? ["fundamento"]
                                    : []),
                                ] as const
                              ).map((k) => (
                                <label className="block" key={k}>
                                  {k === "monto"
                                    ? "Importe COP"
                                    : k === "nombre"
                                      ? "Concepto"
                                      : "Fundamento legal o autorización expresa"}
                                  <input
                                    className={control}
                                    value={c[k as keyof typeof c]}
                                    onChange={(e) =>
                                      setConceptos((cs) =>
                                        cs.map((x, j) =>
                                          j === i
                                            ? { ...x, [k]: e.target.value }
                                            : x,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              ))}
                              {c.tipo === "DEDUCCION" && (
                                <label className="block">
                                  Soporte PDF de la deducción
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f)
                                        void ejecutar(async () => {
                                          const fd = new FormData();
                                          fd.append("archivo", f);
                                          const r = await api.post(
                                            "/personal/archivos",
                                            fd,
                                            {
                                              headers: {
                                                "Content-Type":
                                                  "multipart/form-data",
                                              },
                                            },
                                          );
                                          setConceptos((cs) =>
                                            cs.map((x, j) =>
                                              j === i
                                                ? { ...x, soporteId: r.data.id }
                                                : x,
                                            ),
                                          );
                                        }, "Soporte adjuntado.");
                                    }}
                                  />
                                  {c.soporteId && <span> Adjuntado</span>}
                                </label>
                              )}
                              <button
                                type="button"
                                className="text-red-300"
                                onClick={() =>
                                  setConceptos((cs) =>
                                    cs.filter((_, j) => j !== i),
                                  )
                                }
                              >
                                Quitar concepto
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className={boton}
                            onClick={() =>
                              setConceptos((cs) => [
                                ...cs,
                                {
                                  tipo: "DEVENGADO",
                                  nombre: "",
                                  monto: "",
                                  fundamento: "",
                                  soporteId: "",
                                },
                              ])
                            }
                          >
                            Agregar concepto
                          </button>
                        </section>
                        <Formulario
                          title="Crear periodo revisado"
                          campos={[
                            {
                              name: "empleadoId",
                              label: "Empleado",
                              options: opciones,
                            },
                            { name: "desde", label: "Desde", type: "date" },
                            { name: "hasta", label: "Hasta", type: "date" },
                            {
                              name: "fechaProgramada",
                              label: "Fecha programada del pago",
                              type: "date",
                            },
                            {
                              name: "revisado",
                              label:
                                "El responsable de nómina revisó los conceptos, novedades y fundamentos de cada deducción.",
                              type: "checkbox",
                            },
                          ]}
                          onSubmit={(d) =>
                            guardar("/personal/periodos", { ...d, conceptos })
                          }
                        />
                      </div>
                      <div className="grid gap-6 lg:grid-cols-2">
                        <PagoNomina
                          periodos={periodos}
                          empleados={empleados}
                          onRegistrado={async (mensaje) => {
                            setMensaje(mensaje);
                            await cargar();
                          }}
                        />
                        <section className="space-y-3">
                          <h2 className="text-xl">Saldo por periodo</h2>
                          {periodos.map((p) => (
                            <article
                              className="rounded-lg border border-gray-800 p-3"
                              key={p.id}
                            >
                              <strong>{p.datos.empleado.nombre}</strong>
                              <p>
                                {p.datos.desde} al {p.datos.hasta}
                              </p>
                              <p>
                                Neto {money(p.datos.totalCentavos)} · registrado{" "}
                                {money(p.datos.pagadoCentavos)} · saldo{" "}
                                {money(
                                  p.datos.totalCentavos -
                                    p.datos.pagadoCentavos,
                                )}
                              </p>
                            </article>
                          ))}
                        </section>
                      </div>
                    </>
                  )}
                  {tab === "afiliaciones" && (
                    <section className="space-y-4">
                      <p>
                        Registra las entidades a las que el empleador afilia a
                        su personal. La EPS y el fondo de pensiones se registran
                        por separado en cada empleado.
                      </p>
                      <Formulario
                        key={JSON.stringify(data.afiliacionesEmpresa || {})}
                        title="Afiliaciones del empleador"
                        campos={[
                          {
                            name: "cajaCompensacion",
                            label:
                              "Caja de compensación familiar del empleador",
                            optional: true,
                            value: data.afiliacionesEmpresa?.cajaCompensacion,
                          },
                          {
                            name: "arl",
                            label: "ARL del empleador",
                            optional: true,
                            value: data.afiliacionesEmpresa?.arl,
                          },
                        ]}
                        onSubmit={(d) =>
                          guardar("/personal/afiliaciones-empresa", d)
                        }
                      />
                    </section>
                  )}
                  {tab === "contratos" && (
                    <>
                      <EditorContratos
                        empleados={empleados}
                        onEmitido={cargar}
                      />
                      <details className="rounded-xl border border-gray-700 p-4">
                        <summary className="cursor-pointer font-semibold">
                          Cargar plantillas o contratos externos en PDF
                        </summary>
                        <div className="grid gap-6 lg:grid-cols-2">
                          <Formulario
                            title="Subir plantilla revisada"
                            campos={[
                              {
                                name: "nombre",
                                label: "Nombre y versión de la plantilla",
                              },
                              {
                                name: "archivoId",
                                label: "Plantilla original PDF (hasta 5 MB)",
                                type: "file",
                              },
                              {
                                name: "revisadaPor",
                                label:
                                  "Nombre del asesor jurídico que la revisó",
                              },
                              {
                                name: "revisadaEn",
                                label: "Fecha real de revisión",
                                type: "date",
                              },
                              {
                                name: "alcance",
                                label:
                                  "Alcance de revisión y condiciones de uso",
                                type: "textarea",
                              },
                              {
                                name: "revisada",
                                label:
                                  "La plantilla fue revisada jurídicamente; subirla no genera un contrato firmado.",
                                type: "checkbox",
                              },
                            ]}
                            onSubmit={(d) => guardar("/personal/plantillas", d)}
                          />
                          <section className="space-y-3">
                            <h2 className="text-xl">Plantillas revisadas</h2>
                            {plantillas.map((p) => (
                              <article
                                className="rounded-lg border border-gray-800 p-4"
                                key={p.id}
                              >
                                <strong>{p.datos.nombre}</strong>
                                <p>
                                  {p.datos.revisadaPor} · {p.datos.revisadaEn}
                                </p>
                                <button
                                  type="button"
                                  className="text-orange-400 underline"
                                  onClick={() =>
                                    void ejecutar(() =>
                                      descargar(p.id, "documento"),
                                    )
                                  }
                                >
                                  Descargar original
                                </button>
                              </article>
                            ))}
                            <p className="text-sm text-gray-400">
                              Completa el PDF para cada empleado y haz revisar
                              su texto antes de cargarlo. La firma registrará la
                              fecha real; no se puede firmar retroactivamente ni
                              hacer renunciar al trabajador a sus derechos.
                            </p>
                          </section>
                        </div>
                        <p
                          className="my-4 rounded-lg border border-orange-700 p-4"
                          role="note"
                        >
                          Este formulario conserva el PDF tal como lo cargas.
                          Seleccionar al empleado no reemplaza campos como{" "}
                          {"{{trabajador_nombre}}"} dentro del archivo. Para
                          completar sus datos automáticamente, utiliza el
                          generador de contratos de arriba. Si cargas un PDF
                          externo, debe contener ya el nombre, la identificación
                          y todas las condiciones individuales, sin campos
                          pendientes.
                        </p>
                        <Formulario
                          title="Registrar contrato completo revisado"
                          campos={[
                            {
                              name: "empleadoId",
                              label: "Empleado",
                              options: opciones,
                            },
                            {
                              name: "plantillaId",
                              label: "Plantilla revisada utilizada",
                              options: plantillas.map((p) => ({
                                value: p.id,
                                label: p.datos.nombre,
                              })),
                            },
                            {
                              name: "archivoId",
                              label:
                                "PDF ya completado con los datos del empleado (hasta 5 MB)",
                              type: "file",
                            },
                            {
                              name: "tipo",
                              label: "Modalidad",
                              options: [
                                { value: "INDEFINIDO", label: "Indefinido" },
                                { value: "FIJO", label: "Término fijo" },
                                { value: "OBRA_LABOR", label: "Obra o labor" },
                              ],
                            },
                            {
                              name: "inicio",
                              label: "Inicio real pactado",
                              type: "date",
                            },
                            {
                              name: "fin",
                              label: "Fin (obligatorio para término fijo)",
                              type: "date",
                              optional: true,
                            },
                            {
                              name: "obra",
                              label:
                                "Obra o labor precisa (obligatoria para esa modalidad)",
                              type: "textarea",
                              optional: true,
                            },
                            {
                              name: "funciones",
                              label: "Funciones revisadas",
                              type: "textarea",
                            },
                            { name: "lugar", label: "Lugar de trabajo" },
                            {
                              name: "salario",
                              label: "Salario mensual pactado COP",
                              type: "number",
                            },
                            {
                              name: "revisadaPor",
                              label:
                                "Responsable de revisión del contrato individual",
                            },
                            {
                              name: "revisado",
                              label:
                                "El PDF individual coincide con estos datos y ha sido revisado jurídicamente, incluyendo modalidad, plazos, remuneración, jornada, prestaciones y anexos aplicables.",
                              type: "checkbox",
                            },
                          ]}
                          onSubmit={(d) => guardar("/personal/contratos", d)}
                        />
                      </details>
                    </>
                  )}
                  {(tab === "pagos" || tab === "contratos") && (
                    <section className="space-y-3">
                      <h2 className="text-xl">
                        {tab === "pagos"
                          ? "Comprobantes de pagos"
                          : "Contratos individuales"}
                      </h2>
                      {(tab === "pagos" ? pagos : contratos).map((r) => (
                        <article
                          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-800 p-4"
                          key={r.id}
                        >
                          <div>
                            <strong>{r.datos.empleado.nombre}</strong>
                            <p>
                              {r.tipo === "PAGO"
                                ? money(r.datos.montoCentavos)
                                : r.datos.tipo}{" "}
                              · {estado(r.estado)}
                            </p>
                            <p className="text-sm text-gray-400">
                              {r.datos.fechaPago || r.datos.inicio}
                            </p>
                            {r.tipo === "PAGO" && (
                              <p className="text-sm text-gray-300">
                                Comprobante inicial por correo:{" "}
                                {estado(
                                  r.comprobanteCorreo || "SIN_ENVIO_AUTOMATICO",
                                )}
                              </p>
                            )}
                            <p
                              className={
                                r.copia === "PENDIENTE"
                                  ? "text-sm text-amber-300"
                                  : "text-sm text-gray-400"
                              }
                            >
                              Copia por correo:{" "}
                              {estado(r.copia || "SIN_ENVIO_REGISTRADO")}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm">
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                void ejecutar(() =>
                                  descargar(r.id, "documento"),
                                )
                              }
                            >
                              Leer PDF
                            </button>
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                void ejecutar(() => descargar(r.id))
                              }
                            >
                              Descargar evidencias
                            </button>
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                void ejecutar(async () =>
                                  setHistorial(
                                    (
                                      await api.get(
                                        `/personal/${r.id}/historial`,
                                      )
                                    ).data,
                                  ),
                                )
                              }
                            >
                              Historial
                            </button>
                            {r.estado === "PENDIENTE_EMPLEADOR" && (
                              <button
                                type="button"
                                className="text-orange-400"
                                onClick={() => setAccion(r)}
                              >
                                Firmar como empleador
                              </button>
                            )}
                            {[
                              "REGISTRADO_SIN_CONFIRMAR",
                              "PENDIENTE_EMPLEADO",
                            ].includes(r.estado) && (
                              <button
                                type="button"
                                className="text-orange-400"
                                disabled={ocupado}
                                onClick={() =>
                                  void ejecutar(
                                    () => api.post(`/personal/${r.id}/invitar`),
                                    "Invitación enviada al correo del empleado. El código no es visible para el administrador.",
                                  )
                                }
                              >
                                Enviar al empleado
                              </button>
                            )}
                            {[
                              "FIRMADO",
                              "RECIBIDO_FIRMADO",
                              "EN_REVISION",
                            ].includes(r.estado) && (
                              <button
                                type="button"
                                disabled={ocupado}
                                onClick={() =>
                                  void ejecutar(
                                    () => api.post(`/personal/${r.id}/copia`),
                                    "Copia enviada al correo autorizado.",
                                  )
                                }
                              >
                                Reenviar copia
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </section>
                  )}
                  {accion && (
                    <Formulario
                      key={accion.id}
                      title={`Firmar como empleador y enviar a ${accion.datos.empleado.email}: ${accion.datos.empleado.nombre}`}
                      submitLabel="Firmar y enviar enlace"
                      campos={[
                        {
                          name: "nombre",
                          label: "Nombre del representante autorizado",
                        },
                        {
                          name: "identificacion",
                          label: "Identificación del representante",
                        },
                        {
                          name: "facultad",
                          label: "Calidad o facultad de representación",
                        },
                        {
                          name: "password",
                          label: "Tu contraseña actual de PowerPOS",
                          type: "password",
                        },
                        {
                          name: "acepta",
                          label:
                            "He leído el PDF exacto, tengo facultad para representar al empleador y acepto su contenido. La fecha de firma es la actual.",
                          type: "checkbox",
                        },
                      ]}
                      onSubmit={async (d) => {
                        const r = (
                          await api.post(
                            `/personal/${accion.id}/firmar-enviar`,
                            d,
                          )
                        ).data;
                        setMensaje(r.mensaje);
                        setAccion(null);
                        await cargar();
                      }}
                    />
                  )}
                  {historial && (
                    <section className="rounded-xl border border-gray-700 p-4">
                      <h2 className="text-xl">Historial protegido</h2>
                      {Object.entries(historial).map(([k, rs]) => (
                        <div key={k}>
                          <h3 className="mt-3 font-semibold capitalize">{k}</h3>
                          {(rs as Registro[]).map((r) => (
                            <p key={r.id} className="py-1 text-sm">
                              {r.datos.fecha} ·{" "}
                              {r.datos.accion ||
                                r.datos.calidad ||
                                estado(r.estado)}{" "}
                              {r.datos.nombre || ""} {r.datos.reclamo || ""}{" "}
                              {r.datos.pendiente ? " · entrega pendiente" : ""}
                            </p>
                          ))}
                        </div>
                      ))}
                    </section>
                  )}
                  <p className="text-xs text-gray-500">
                    La vista muestra hasta los últimos 500 registros por
                    sección. No borres expedientes al retirar a una persona;
                    conserva los soportes conforme a la política de tu empresa.
                    El empleado puede optar por documentos en papel y pedir
                    copias.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
