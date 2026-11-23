"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
type Seccion = { titulo: string; contenido: string };
type Registro = {
  id: string;
  version?: number;
  creadoEn?: string;
  estado: string;
  datos: Record<string, any>;
};
const input =
  "mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-white";
const button =
  "rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-40";
const inicial = {
  empleadoId: "",
  tipo: "INDEFINIDO",
  inicio: "",
  fin: "",
  obra: "",
  domicilioEmpleado: "",
  domicilioEmpresa: "",
  lugarCelebracion: "",
  lugarContratacion: "",
  lugarServicio: "",
  cargo: "",
  funciones: "",
  salario: "",
  frecuencia: "QUINCENAL",
  formaPago: "",
  jornada: "",
  descansos: "",
  especieMonto: "0",
  especieDetalle: "",
  terminacion:
    "La duración, los preavisos y la terminación se sujetan a la modalidad pactada y a las disposiciones laborales aplicables, sin renuncia a los derechos mínimos del trabajador.",
};
const campos = [
  ["inicio", "Inicio pactado", "date"],
  ["domicilioEmpleado", "Domicilio del trabajador", "text"],
  ["domicilioEmpresa", "Domicilio del empleador", "text"],
  ["lugarCelebracion", "Lugar de celebración", "text"],
  ["lugarContratacion", "Lugar donde se contrata al trabajador", "text"],
  ["lugarServicio", "Lugar de prestación del servicio", "text"],
  ["cargo", "Cargo", "text"],
  ["funciones", "Naturaleza del trabajo y funciones", "textarea"],
  [
    "salario",
    "Salario básico mensual total COP (incluye el componente en especie)",
    "number",
  ],
  ["formaPago", "Forma de pago del salario", "textarea"],
  [
    "jornada",
    "Jornada: horas semanales, horario y distribución revisados",
    "textarea",
  ],
  ["descansos", "Descansos, turnos y condiciones aplicables", "textarea"],
  [
    "especieMonto",
    "Valor mensual estimado del salario en especie COP (0 si no existe)",
    "number",
  ],
  [
    "terminacion",
    "Duración, preaviso y terminación según modalidad",
    "textarea",
  ],
];
export default function EditorContratos({
  empleados,
  onEmitido,
}: {
  empleados: Registro[];
  onEmitido: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(null),
    [form, setForm] = useState<Record<string, string>>({ ...inicial }),
    [actual, setActual] = useState<Registro | null>(null),
    [clausulas, setClausulas] = useState<Seccion[]>([]),
    [anexos, setAnexos] = useState<Seccion[]>([]),
    [modeloId, setModeloId] = useState(""),
    [nombreModelo, setNombreModelo] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mensaje, setMensaje] = useState(""),
    [dirty, setDirty] = useState(false),
    [revisor, setRevisor] = useState(""),
    [fechaRevision, setFechaRevision] = useState(""),
    [alcance, setAlcance] = useState(""),
    [aceptaRevision, setAceptaRevision] = useState(false),
    [aceptaEmitir, setAceptaEmitir] = useState(false),
    [versiones, setVersiones] = useState<Registro[]>([]);
  const cargar = useCallback(async () => {
    const r = (await api.get("/personal/editor")).data;
    setData(r);
    return r;
  }, []);
  useEffect(() => {
    void cargar()
      .then((r) => {
        setClausulas(r.guia);
        setForm((f) => ({
          ...f,
          domicilioEmpresa: r.empresa?.direccion || "",
        }));
      })
      .catch((e) =>
        setError(
          String(e.response?.data?.message || "No se pudo cargar el editor"),
        ),
      );
  }, [cargar]);
  useEffect(() => {
    if (!dirty) return;
    const prevenir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", prevenir);
    return () => window.removeEventListener("beforeunload", prevenir);
  }, [dirty]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMensaje("");
    try {
      await fn();
    } catch (e: any) {
      let msg = e.response?.data?.message;
      if (e.response?.data instanceof Blob) {
        try {
          msg = JSON.parse(await e.response.data.text()).message;
        } catch {}
      }
      setError(String(msg || e.message));
    } finally {
      setBusy(false);
    }
  }
  function elegir(r: Registro | null) {
    if (
      dirty &&
      !window.confirm(
        "Hay cambios sin guardar. ¿Quieres descartarlos para cambiar de borrador?",
      )
    )
      return;
    setActual(r);
    setDirty(false);
    setVersiones([]);
    setAceptaRevision(false);
    setAceptaEmitir(false);
    setError("");
    setMensaje("");
    if (r) {
      const d = r.datos;
      setForm({
        ...inicial,
        ...d,
        salario: String(d.salarioCentavos / 100),
        especieMonto: String(d.especieCentavos / 100),
      });
      setClausulas(d.clausulas.map((c: Seccion) => ({ ...c })));
      setAnexos(d.anexos.map((c: Seccion) => ({ ...c })));
      setModeloId(d.modeloId || "");
    } else {
      setForm({ ...inicial, domicilioEmpresa: data?.empresa?.direccion || "" });
      setClausulas(data?.guia || []);
      setAnexos([]);
      setModeloId("");
    }
  }
  function cambiar(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
    setAceptaRevision(false);
    setAceptaEmitir(false);
  }
  async function guardar(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const payload = {
        ...form,
        clausulas,
        anexos,
        modeloId: modeloId || undefined,
        versionEsperada: actual?.version,
      };
      const r = (
        actual
          ? await api.patch(`/personal/editor/borradores/${actual.id}`, payload)
          : await api.post("/personal/editor/borradores", payload)
      ).data;
      setActual(r);
      setDirty(false);
      setAceptaRevision(false);
      setAceptaEmitir(false);
      setMensaje(
        "Borrador guardado. Cualquier revisión anterior quedó invalidada por el cambio.",
      );
      await cargar();
    });
  }
  async function descargar(id: string, tipo = "pdf") {
    const r = await api.get(`/personal/editor/borradores/${id}/${tipo}`, {
        responseType: "blob",
      }),
      url = URL.createObjectURL(r.data),
      a = document.createElement("a");
    a.href = url;
    a.download =
      tipo === "revisado"
        ? "contrato-original-revisado.pdf"
        : "borrador-contrato.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function listaSecciones(
    titulo: string,
    items: Seccion[],
    set: (x: Seccion[]) => void,
  ) {
    return (
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{titulo}</h3>
        {items.map((c, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-gray-700 p-3"
          >
            <label className="block text-sm">
              Título
              <input
                className={input}
                value={c.titulo}
                maxLength={150}
                required
                onChange={(e) => {
                  set(
                    items.map((x, j) =>
                      j === i ? { ...x, titulo: e.target.value } : x,
                    ),
                  );
                  setDirty(true);
                }}
              />
            </label>
            <label className="block text-sm">
              Texto completo
              <textarea
                className={input}
                rows={4}
                value={c.contenido}
                maxLength={4000}
                required
                onChange={(e) => {
                  set(
                    items.map((x, j) =>
                      j === i ? { ...x, contenido: e.target.value } : x,
                    ),
                  );
                  setDirty(true);
                }}
              />
            </label>
            <button
              type="button"
              className="text-red-300"
              onClick={() => {
                set(items.filter((_, j) => j !== i));
                setDirty(true);
              }}
            >
              Quitar sección
            </button>
          </div>
        ))}
        <button
          className="rounded-lg border border-gray-600 px-4 py-2"
          type="button"
          onClick={() => {
            set([...items, { titulo: "", contenido: "" }]);
            setDirty(true);
          }}
        >
          Agregar{" "}
          {titulo === "Cláusulas adicionales" ? "cláusula" : "anexo de texto"}
        </button>
      </section>
    );
  }
  const emitido = actual?.estado === "EMITIDO";
  return (
    <section className="space-y-5 rounded-xl border border-orange-700/60 bg-gray-900 p-5">
      <header>
        <h2 className="text-2xl font-semibold">Crear contrato en el sistema</h2>
        <p className="mt-2 text-sm text-gray-300">
          Completa los datos, redacta las cláusulas y anexos, descarga el
          borrador y registra la revisión jurídica de esa versión. Emitirlo crea
          el original para el proceso de firmas; todavía no lo firma.
        </p>
        <p className="mt-2 text-sm text-amber-200">
          La guía inicial es orientativa. Revisa modalidad, jornada,
          remuneración, salario en especie, prestaciones y terminación con tu
          asesor. El editor no certifica la legalidad de las cláusulas ni
          liquida la nómina.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-lg bg-red-950 p-3">
          {error}
        </p>
      )}
      {mensaje && (
        <p role="status" className="rounded-lg bg-green-950 p-3">
          {mensaje}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm">
          Abrir borrador guardado
          <select
            className={input}
            value={actual?.id || ""}
            disabled={busy}
            onChange={(e) =>
              elegir(
                data?.borradores.find(
                  (r: Registro) => r.id === e.target.value,
                ) || null,
              )
            }
          >
            <option value="">Nuevo contrato</option>
            {data?.borradores.map((r: Registro) => (
              <option key={r.id} value={r.id}>
                {r.datos.empleado.nombre} · {r.estado} · versión {r.version}
              </option>
            ))}
          </select>
        </label>
        <button className={button} disabled={busy} onClick={() => elegir(null)}>
          Nuevo borrador
        </button>
      </div>
      <form className="space-y-5" onSubmit={guardar}>
        <fieldset disabled={busy || emitido} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              Empleado
              <select
                className={input}
                value={form.empleadoId}
                disabled={!!actual}
                required
                onChange={(e) => {
                  const emp = empleados.find((r) => r.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    empleadoId: e.target.value,
                    cargo: emp?.datos.cargo || "",
                    salario: emp ? String(emp.datos.salarioCentavos / 100) : "",
                    domicilioEmpleado: "",
                  }));
                  setDirty(true);
                }}
              >
                <option value="">Selecciona un empleado</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.datos.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Modalidad
              <select
                className={input}
                value={form.tipo}
                onChange={(e) => cambiar("tipo", e.target.value)}
              >
                <option value="INDEFINIDO">Indefinido</option>
                <option value="FIJO">Término fijo</option>
                <option value="OBRA_LABOR">Obra o labor</option>
              </select>
            </label>
            {campos.map(([k, l, t]) => (
              <label
                key={k}
                className={
                  t === "textarea" ? "text-sm md:col-span-2" : "text-sm"
                }
              >
                {l}
                {t === "textarea" ? (
                  <textarea
                    className={input}
                    rows={3}
                    required
                    value={form[k]}
                    onChange={(e) => cambiar(k, e.target.value)}
                  />
                ) : (
                  <input
                    className={input}
                    type={t}
                    step={t === "number" ? "0.01" : undefined}
                    min={t === "number" ? "0" : undefined}
                    required
                    value={form[k]}
                    onChange={(e) => cambiar(k, e.target.value)}
                  />
                )}
              </label>
            ))}
            <label className="text-sm">
              Periodicidad de pago
              <select
                className={input}
                value={form.frecuencia}
                onChange={(e) => cambiar("frecuencia", e.target.value)}
              >
                <option>SEMANAL</option>
                <option>QUINCENAL</option>
                <option>MENSUAL</option>
              </select>
            </label>
            {form.tipo === "FIJO" && (
              <label className="text-sm">
                Fecha final pactada
                <input
                  className={input}
                  type="date"
                  required
                  value={form.fin}
                  onChange={(e) => cambiar("fin", e.target.value)}
                />
              </label>
            )}
            {form.tipo === "OBRA_LABOR" && (
              <label className="text-sm md:col-span-2">
                Obra o labor precisa y detallada
                <textarea
                  className={input}
                  required
                  rows={3}
                  value={form.obra}
                  onChange={(e) => cambiar("obra", e.target.value)}
                />
              </label>
            )}
            {Number(form.especieMonto) > 0 && (
              <label className="text-sm md:col-span-2">
                Detalle, estimación y condiciones del salario en especie
                <textarea
                  className={input}
                  rows={3}
                  required
                  value={form.especieDetalle}
                  onChange={(e) => cambiar("especieDetalle", e.target.value)}
                />
              </label>
            )}
          </div>
          <div className="rounded-lg border border-gray-700 p-4">
            <label className="text-sm">
              Aplicar modelo de la empresa (sustituye cláusulas y anexos de
              texto)
              <select
                className={input}
                value={modeloId}
                onChange={(e) => {
                  const m = data?.modelos.find(
                    (r: Registro) => r.id === e.target.value,
                  );
                  if (
                    m &&
                    window.confirm(
                      "¿Sustituir las cláusulas y anexos actuales por los de este modelo?",
                    )
                  ) {
                    setModeloId(m.id);
                    setClausulas(
                      m.datos.clausulas.map((c: Seccion) => ({ ...c })),
                    );
                    setAnexos(m.datos.anexos.map((c: Seccion) => ({ ...c })));
                    setDirty(true);
                  }
                }}
              >
                <option value="">Guía inicial / texto propio</option>
                {data?.modelos.map((m: Registro) => (
                  <option key={m.id} value={m.id}>
                    {m.datos.nombre} · {String(m.creadoEn || "").slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-gray-400">
              Variables admitidas en cláusulas y anexos:{" "}
              {data?.variables.map((v: string) => `{{${v}}}`).join(", ")}. Se
              sustituyen por los datos de este contrato.
            </p>
          </div>
          {listaSecciones("Cláusulas adicionales", clausulas, setClausulas)}
          {listaSecciones(
            "Anexos de texto incluidos en el PDF",
            anexos,
            setAnexos,
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 text-sm">
              Nombre del modelo reutilizable
              <input
                className={input}
                value={nombreModelo}
                onChange={(e) => setNombreModelo(e.target.value)}
                placeholder="Ejemplo: Auxiliar de tienda · revisión noviembre 2026"
              />
            </label>
            <button
              type="button"
              className="rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-40"
              disabled={!nombreModelo.trim()}
              onClick={() =>
                void run(async () => {
                  await api.post("/personal/editor/modelos", {
                    nombre: nombreModelo,
                    anteriorId: modeloId || undefined,
                    clausulas,
                    anexos,
                  });
                  setMensaje(
                    "Modelo guardado como una nueva versión. Cada contrato individual debe revisarse.",
                  );
                  await cargar();
                })
              }
            >
              Guardar nueva versión del modelo
            </button>
          </div>
          <button className={button}>
            {actual ? "Guardar nueva versión del borrador" : "Guardar borrador"}
          </button>
          <span className="ml-3 text-sm text-amber-200">
            {dirty
              ? "Cambios sin guardar"
              : actual
                ? `Guardado · ${actual.estado}`
                : ""}
          </span>
        </fieldset>
      </form>
      {actual && (
        <div className="flex flex-wrap gap-4 text-sm">
          <button
            disabled={busy || dirty}
            className="text-orange-300 underline disabled:opacity-40"
            onClick={() => void run(() => descargar(actual.id))}
          >
            Descargar borrador PDF
          </button>
          {actual.datos.revision && (
            <button
              disabled={busy || dirty}
              className="text-orange-300 underline disabled:opacity-40"
              onClick={() => void run(() => descargar(actual.id, "revisado"))}
            >
              Descargar original revisado
            </button>
          )}
          <button
            disabled={busy}
            className="text-orange-300 underline"
            onClick={() =>
              void run(async () =>
                setVersiones(
                  (
                    await api.get(
                      `/personal/editor/borradores/${actual.id}/historial`,
                    )
                  ).data,
                ),
              )
            }
          >
            Ver versiones anteriores
          </button>
        </div>
      )}
      {actual && !emitido && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form
            className="space-y-3 rounded-lg border border-gray-700 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = (
                  await api.post(
                    `/personal/editor/borradores/${actual.id}/revisar`,
                    {
                      versionEsperada: actual.version,
                      revisadaPor: revisor,
                      revisadaEn: fechaRevision,
                      alcance,
                      acepta: aceptaRevision,
                    },
                  )
                ).data;
                setActual(r);
                setMensaje(
                  "Revisión registrada. Descarga el original revisado antes de emitir para firmas.",
                );
                await cargar();
              });
            }}
          >
            <h3 className="font-semibold">Registrar revisión jurídica</h3>
            <fieldset
              className="space-y-3"
              disabled={busy || dirty || actual.estado !== "BORRADOR"}
            >
              <label className="block text-sm">
                Responsable de revisión
                <input
                  className={input}
                  required
                  value={revisor}
                  onChange={(e) => setRevisor(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Fecha real de revisión
                <input
                  className={input}
                  type="date"
                  required
                  value={fechaRevision}
                  onChange={(e) => setFechaRevision(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Alcance y observaciones de revisión
                <textarea
                  className={input}
                  required
                  rows={3}
                  value={alcance}
                  onChange={(e) => setAlcance(e.target.value)}
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={aceptaRevision}
                  onChange={(e) => setAceptaRevision(e.target.checked)}
                />
                Esta versión completa fue revisada jurídicamente, incluidos los
                datos, las cláusulas y los anexos. La guía por sí sola no
                equivale a una revisión.
              </label>
              <button className={button}>
                Registrar revisión de esta versión
              </button>
            </fieldset>
          </form>
          <section className="space-y-3 rounded-lg border border-gray-700 p-4">
            <h3 className="font-semibold">Emitir original para firmas</h3>
            <p className="text-sm">
              {actual.datos.revision
                ? `Revisión: ${actual.datos.revision.revisadaPor} · ${actual.datos.revision.revisadaEn}`
                : "Falta la revisión jurídica del borrador guardado."}
            </p>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={aceptaEmitir}
                onChange={(e) => setAceptaEmitir(e.target.checked)}
                disabled={busy || dirty || actual.estado !== "REVISADO"}
              />
              He descargado y leído el original revisado; confirmo su emisión
              para firmas. No se firmará automáticamente ni se cambiará después
              su contenido.
            </label>
            <button
              className={button}
              disabled={
                busy || dirty || actual.estado !== "REVISADO" || !aceptaEmitir
              }
              onClick={() =>
                void run(async () => {
                  await api.post(
                    `/personal/editor/borradores/${actual.id}/emitir`,
                    { versionEsperada: actual.version, acepta: true },
                  );
                  const r = await cargar();
                  setActual(
                    r.borradores.find((b: Registro) => b.id === actual.id),
                  );
                  setMensaje(
                    "Original emitido. Continúa abajo con la firma del empleador y el envío al empleado.",
                  );
                  await onEmitido();
                })
              }
            >
              Emitir contrato para firmas
            </button>
          </section>
        </div>
      )}
      {emitido && (
        <p className="rounded-lg bg-green-950 p-3">
          Este borrador ya tiene un original emitido. Sus firmas y copias se
          gestionan en la lista de contratos individuales.
        </p>
      )}
      {versiones.length > 0 && (
        <section>
          <h3 className="font-semibold">Versiones conservadas</h3>
          {versiones.map((r) => (
            <p className="py-1 text-sm" key={r.id}>
              Versión {r.datos.version} · {r.datos.estado} ·{" "}
              {r.datos.contenido.fechaElaboracion}. La información de esa
              versión permanece protegida en el expediente.
              <button
                className="ml-3 text-orange-300 underline"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    descargar(actual!.id, `versiones/${r.datos.version}/pdf`),
                  )
                }
              >
                Descargar esta versión
              </button>
            </p>
          ))}
        </section>
      )}
    </section>
  );
}
