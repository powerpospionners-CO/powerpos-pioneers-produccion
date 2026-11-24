"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

type Registro = {
  tipo: string;
  id: string;
  estado: string;
  datos: Record<string, any>;
};
const control =
  "mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-white";
const boton =
  "rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-40";
const fechaHoy = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const inicial = {
  tipo: "POLITICA",
  nombre: "",
  versionEtiqueta: "1.0",
  responsable: "",
  nit: "",
  direccion: "",
  domicilio: "",
  telefono: "",
  correo: "",
  contenido: "",
  anteriorId: "",
};
const guiaPolitica = `1. RESPONSABLE Y CANALES
[RAZÓN SOCIAL], NIT [NIT], domicilio [DOMICILIO], atiende solicitudes en [DIRECCIÓN], teléfono [TELÉFONO] y correo [CORREO]. El área de Administración atenderá las solicitudes bajo supervisión del representante legal.

2. ALCANCE Y PRINCIPIOS
Aplica a aspirantes, trabajadores, exempleados y beneficiarios necesarios para obligaciones laborales. Se observarán legalidad, finalidad, libertad, veracidad, transparencia, acceso restringido, seguridad y confidencialidad. No cubre publicidad, videovigilancia ni biometría, que requieren evaluación e información específicas.

3. FINALIDADES
Gestionar selección, vinculación, contratos, funciones, jornada, pagos, deducciones, prestaciones, vacaciones, seguridad social, seguridad y salud en el trabajo, certificaciones, entrega de copias, reclamaciones y requerimientos legales. Se recolectará únicamente información necesaria de identificación, contacto, experiencia, pagos y relación laboral. No se destinará a publicidad sin fundamento y autorización aplicables.

4. AUTORIZACIONES Y DATOS SENSIBLES
Se obtendrá y conservará autorización previa, expresa e informada cuando sea exigible. Se informará sobre datos sensibles y el carácter facultativo de responder preguntas sobre ellos, salvo las excepciones legales. No se implementará biometría amparándose únicamente en esta política. Las historias clínicas ocupacionales estarán bajo custodia legalmente habilitada; el empleador recibirá solo los conceptos y recomendaciones procedentes. La autorización no se confunde con la recepción de esta política.

5. MENORES Y BENEFICIARIOS
Solo se tratarán datos necesarios y procedentes, respetando el interés superior del menor y las reglas de representación, participación y autorización aplicables.

6. ACCESO Y PROVEEDORES
Solo accederán personas autorizadas por sus funciones. Se comunicarán los datos necesarios a entidades, autoridades y proveedores legítimos. Se verificarán contratos, seguridad, confidencialidad, subcontratación y devolución o eliminación de datos con PowerPOS y otros encargados. Las transmisiones y transferencias, incluso internacionales, cumplirán los requisitos aplicables. No se autoriza una divulgación ilimitada.

7. SEGURIDAD
Se implementarán usuarios individuales, permisos por función, custodia física, protección de credenciales, canales seguros, copias de respaldo, recuperación, capacitación, confidencialidad y respuesta a incidentes con comunicaciones legalmente exigibles. No se compartirán expedientes mediante enlaces públicos.

8. DERECHOS
Los titulares podrán conocer, actualizar, rectificar y acceder gratuitamente en términos legales a sus datos; solicitar prueba de autorización, información sobre su uso, revocatoria o supresión cuando proceda. La conservación legal o contractual puede impedir la supresión. Podrán acudir a la SIC tras agotar el trámite previo exigible.

9. CONSULTAS Y RECLAMOS
Se recibirán en los canales indicados, verificando identidad y representación sin exigir datos excesivos. Las consultas se resolverán en 10 días hábiles; de requerirse ampliación se informarán motivo y fecha antes del vencimiento, hasta 5 días hábiles adicionales. Los reclamos se resolverán en 15 días hábiles desde el día siguiente al recibo, ampliables justificadamente hasta 8 días hábiles adicionales con aviso oportuno. Se requerirá subsanar reclamos incompletos dentro de los 5 días siguientes al recibo; tras dos meses sin subsanar se entenderán desistidos. Los reclamos recibidos sin competencia se trasladarán en 2 días hábiles informando al solicitante. Recibido el reclamo completo se anotará reclamo en trámite en máximo 2 días hábiles hasta resolverlo.

10. CONSERVACIÓN
Se conservarán datos durante el vínculo y por los plazos legales de cada clase documental y la atención de obligaciones y controversias. La empresa definirá su tabla de retención laboral, contable, de seguridad social y de SST. No eliminará información sujeta a conservación o controversia. Cumplidas las finalidades y plazos se eliminará de forma segura o anonimizará.

11. DISPONIBILIDAD Y VIGENCIA
Habrá copia gratuita en Administración y mediante solicitud al correo indicado. La vigencia comienza en la fecha de adopción registrada. Las bases durarán lo requerido por sus finalidades y plazos legales. Los cambios sustanciales se comunicarán y las nuevas finalidades que lo requieran se someterán a autorización previa.

BASE NORMATIVA
Ley 1581 de 2012 y Decreto 1074 de 2015. La empresa debe revisar y ejecutar estas medidas antes de adoptar la política.`;
const guiaAviso = `El responsable [RAZÓN SOCIAL], NIT [NIT], trata datos necesarios para vinculación, gestión laboral, nómina, prestaciones, seguridad social, SST y obligaciones legales. Solo tendrán acceso personas y entidades legitimadas; se conservarán según las finalidades y plazos legales. Los titulares podrán conocer, actualizar, rectificar, acceder y ejercer los demás derechos legales; la supresión o revocatoria procederá cuando no exista obligación de conservación. Las solicitudes se recibirán en [CORREO] y [DIRECCIÓN]. La política completa está disponible en [ENLACE O CANAL DE COPIA]. Los datos sensibles se tratarán con las garantías legales. Se ofrecerá alternativa en papel sin impedir la contratación.`;
const guiaContrato = `Prestaciones y seguridad social: el empleador reconocerá afiliaciones, aportes, prestaciones y vacaciones según las bases y plazos legales, separados del salario.

Jornada: se registrará el tiempo efectivamente trabajado y se pagarán horas extras y recargos aplicables. Durante el descanso libre de funciones se garantizará el relevo necesario.

Caja: los faltantes se investigarán respetando el debido proceso; no habrá descuentos automáticos ni autorizaciones generales de descuento.

Continuidad: el contrato reconocerá la fecha real de ingreso y no reiniciará antigüedad ni impondrá un período de prueba retroactivo. Ninguna cláusula implica renuncia, paz y salvo general o desconocimiento de derechos causados.

Datos personales: se informará la política de la empresa y se obtendrán separadamente las autorizaciones exigibles.

Revisión: estas cláusulas son una guía. Deben completarse los datos y condiciones individuales en el editor de contratos y realizarse la revisión laboral antes de emitir y firmar.`;
export default function DocumentosEmpresa({
  empleados,
  config,
  onCambio,
  onUsarAviso,
}: {
  empleados: Registro[];
  config: any;
  onCambio: () => Promise<void>;
  onUsarAviso: (r: Registro) => void;
}) {
  const [data, setData] = useState<{
    documentos: Registro[];
    entregas: Registro[];
  }>({ documentos: [], entregas: [] });
  const [form, setForm] = useState({
    ...inicial,
    responsable: config?.responsable || "",
    correo: config?.correo || "",
  });
  const editor = useRef<HTMLFormElement>(null);
  const [archivoOriginal, setArchivoOriginal] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null),
    [formato, setFormato] = useState("TEXTO"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mensaje, setMensaje] = useState("");
  const [seleccion, setSeleccion] = useState(""),
    [vigencia, setVigencia] = useState(fechaHoy()),
    [revisor, setRevisor] = useState(""),
    [acepta, setAcepta] = useState(false),
    [publicar, setPublicar] = useState(false);
  const cargar = useCallback(
    async () => setData((await api.get("/personal/documentos-empresa")).data),
    [],
  );
  useEffect(() => {
    void cargar().catch((e) =>
      setError(
        String(e.response?.data?.message || "No se pudo cargar la biblioteca"),
      ),
    );
  }, [cargar]);
  const seleccionada = data.documentos.find((r) => r.id === seleccion);
  const politicas = data.documentos.filter(
    (r) => r.datos.tipo === "POLITICA" && r.estado === "ADOPTADA",
  );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMensaje("");
    try {
      await fn();
      await cargar();
      await onCambio();
    } catch (e: any) {
      setError(
        String(e.response?.data?.message || e.message || "No se pudo guardar"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function descargar(id: string) {
    const r = await api.get(`/personal/documentos-empresa/${id}/pdf`, {
      responseType: "blob",
    });
    const u = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = u;
    a.download = "documento-empresa.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }
  const cambiar = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  function cargarGuia() {
    if (
      form.contenido &&
      !window.confirm("¿Sustituir el contenido por la guía editable?")
    )
      return;
    let contenido =
      form.tipo === "POLITICA"
        ? guiaPolitica
        : form.tipo === "AVISO"
          ? guiaAviso
          : guiaContrato;
    for (const [marca, valor] of [
      ["RAZÓN SOCIAL", form.responsable],
      ["NIT", form.nit],
      ["DOMICILIO", form.domicilio],
      ["DIRECCIÓN", form.direccion],
      ["TELÉFONO", form.telefono],
      ["CORREO", form.correo],
    ]) {
      if (valor.trim())
        contenido = contenido.replaceAll(`[${marca}]`, valor.trim());
    }
    cambiar("contenido", contenido);
  }
  return (
    <section className="space-y-5 rounded-xl border border-gray-700 bg-gray-900 p-5">
      <h2 className="text-2xl font-semibold">
        Plantillas y políticas de la empresa
      </h2>
      <p>
        Biblioteca privada de la empresa y sede seleccionadas. Cada cambio crea
        una versión nueva; las anteriores y sus entregas se conservan.
      </p>
      <p className="text-sm text-amber-200">
        Las guías deben adaptarse y revisarse. Guardar una plantilla no firma
        contratos ni acredita cumplimiento legal. Solo una política adoptada y
        expresamente publicada tendrá enlace público.
      </p>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {mensaje && (
        <p role="status" className="text-green-300">
          {mensaje}
        </p>
      )}
      <form
        ref={editor}
        tabIndex={-1}
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            let archivoId = formato === "PDF" ? archivoOriginal : undefined;
            if (formato === "PDF" && !archivo && !archivoId)
              throw Error("Selecciona un PDF");
            if (formato === "PDF" && archivo) {
              const fd = new FormData();
              fd.append("archivo", archivo);
              archivoId = (
                await api.post("/personal/archivos", fd, {
                  headers: { "Content-Type": "multipart/form-data" },
                })
              ).data.id;
            }
            await api.post("/personal/documentos-empresa", {
              ...form,
              contenido: formato === "TEXTO" ? form.contenido : undefined,
              archivoId,
            });
            setMensaje(
              form.tipo === "CONTRATO"
                ? "Modelo guardado. En Contratos, selecciónalo en Aplicar modelo de la empresa."
                : "Borrador guardado. Revísalo antes de adoptar la política.",
            );
            setForm((f) => ({
              ...f,
              nombre: "",
              contenido: "",
              anteriorId: "",
            }));
            setArchivo(null);
            setArchivoOriginal(null);
          });
        }}
        className="space-y-4"
      >
        <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
          <legend className="mb-3 text-xl">
            {form.anteriorId
              ? "Editar documento existente"
              : "Crear plantilla o nueva versión"}
          </legend>
          {form.anteriorId && (
            <div className="rounded-lg border border-orange-700 p-3 md:col-span-2">
              <p>
                Modifica los datos y el contenido. Al guardar se conservará una
                nueva versión en borrador; los documentos ya enviados
                permanecerán intactos.
              </p>
              <button
                type="button"
                className="mt-2 underline"
                onClick={() => {
                  setForm({
                    ...inicial,
                    responsable: config?.responsable || "",
                    correo: config?.correo || "",
                  });
                  setArchivo(null);
                  setArchivoOriginal(null);
                  setFormato("TEXTO");
                  setMensaje("");
                }}
              >
                Cancelar edición
              </button>
            </div>
          )}
          <label>
            Tipo
            <select
              className={control}
              value={form.tipo}
              onChange={(e) => {
                cambiar("tipo", e.target.value);
                cambiar("anteriorId", "");
                setArchivoOriginal(null);
                if (e.target.value === "CONTRATO") setFormato("TEXTO");
              }}
            >
              <option value="POLITICA">Política de datos laborales</option>
              <option value="AVISO">Aviso de privacidad</option>
              <option value="CONTRATO">Modelo de cláusulas de contrato</option>
            </select>
          </label>
          <label>
            Nombre
            <input
              required
              maxLength={200}
              className={control}
              value={form.nombre}
              onChange={(e) => cambiar("nombre", e.target.value)}
            />
          </label>
          <label>
            Versión visible
            <input
              required
              maxLength={60}
              className={control}
              value={form.versionEtiqueta}
              onChange={(e) => cambiar("versionEtiqueta", e.target.value)}
            />
          </label>
          <label>
            Versión anterior
            <select
              className={control}
              value={form.anteriorId}
              onChange={(e) => cambiar("anteriorId", e.target.value)}
            >
              <option value="">Documento nuevo</option>
              {data.documentos
                .filter((r) => r.datos.tipo === form.tipo)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.datos.nombre} · {r.datos.versionEtiqueta}
                  </option>
                ))}
            </select>
          </label>
          {[
            ["responsable", "Razón social legal"],
            ["nit", "NIT"],
            ["direccion", "Dirección de atención"],
            ["domicilio", "Domicilio legal del empleador (municipio)"],
            ["telefono", "Teléfono"],
            ["correo", "Correo de consultas y reclamos"],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                required
                type={k === "correo" ? "email" : "text"}
                className={control}
                value={(form as any)[k]}
                onChange={(e) => cambiar(k, e.target.value)}
              />
            </label>
          ))}
          <label>
            Formato
            <select
              className={control}
              value={formato}
              onChange={(e) => setFormato(e.target.value)}
            >
              <option value="TEXTO">Redactar en el sistema</option>
              {form.tipo !== "CONTRATO" && (
                <option value="PDF">Cargar PDF completo</option>
              )}
            </select>
          </label>
          {formato === "TEXTO" ? (
            <label className="md:col-span-2">
              Contenido completo
              <textarea
                required
                maxLength={30000}
                rows={14}
                className={control}
                value={form.contenido}
                onChange={(e) => cambiar("contenido", e.target.value)}
              />
              <button
                type="button"
                className="mt-2 underline text-orange-300"
                onClick={cargarGuia}
              >
                Cargar guía editable
              </button>
            </label>
          ) : (
            <label className="md:col-span-2">
              {archivoOriginal
                ? "PDF actual conservado. Puedes seleccionar otro para reemplazarlo."
                : "PDF completo, hasta 5 MB"}
              <input
                key={form.anteriorId || "nuevo"}
                required={!archivoOriginal}
                type="file"
                accept="application/pdf"
                className={control}
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              />
            </label>
          )}
          <button className={boton}>
            {form.anteriorId
              ? "Guardar cambios como nueva versión"
              : "Guardar nueva versión"}
          </button>
        </fieldset>
      </form>
      <section className="space-y-3 border-t border-gray-700 pt-4">
        <h3 className="text-xl">Documentos y versiones</h3>
        {data.documentos.length === 0 && (
          <p>Aún no hay documentos. Puedes comenzar con la guía editable.</p>
        )}
        {data.documentos.map((r) => (
          <article
            key={r.id}
            className="space-y-2 rounded-lg border border-gray-700 p-3"
          >
            <strong>
              {r.datos.nombre} · {r.datos.versionEtiqueta}
            </strong>
            <p>
              {r.datos.tipo} · {r.estado}
              {r.datos.vigencia && ` · Vigencia ${r.datos.vigencia}`}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy}
                className="underline"
                onClick={() => void run(() => descargar(r.id))}
              >
                Descargar documento
              </button>
              <button
                disabled={busy}
                className="underline"
                onClick={() => {
                  setForm({
                    ...inicial,
                    ...r.datos,
                    anteriorId: r.id,
                    versionEtiqueta: /^\d+(?:\.\d+)*$/.test(
                      r.datos.versionEtiqueta,
                    )
                      ? r.datos.versionEtiqueta.replace(/\d+$/, (n: string) =>
                          String(Number(n) + 1),
                        )
                      : "",
                    contenido: r.datos.contenido || "",
                  });
                  setFormato(r.datos.archivoId ? "PDF" : "TEXTO");
                  setArchivo(null);
                  setArchivoOriginal(r.datos.archivoId || null);
                  editor.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  editor.current?.focus({ preventScroll: true });
                  setMensaje(
                    "Documento cargado para editar. Revisa la versión y guarda tus cambios. Si es una política, adopta la nueva versión y vincúlala en Privacidad para los próximos envíos.",
                  );
                }}
              >
                {r.datos.tipo === "POLITICA"
                  ? "Editar política"
                  : "Editar documento"}
              </button>
              {r.datos.tipo === "POLITICA" && r.estado === "BORRADOR" && (
                <button
                  className="text-orange-300 underline"
                  onClick={() => {
                    setSeleccion(r.id);
                    setAcepta(false);
                    setPublicar(false);
                  }}
                >
                  Revisar y adoptar
                </button>
              )}
            </div>
            {r.datos.tipo === "AVISO" && r.datos.contenido && (
              <button
                className="text-orange-300 underline"
                onClick={() => onUsarAviso(r)}
              >
                Usar este aviso en Privacidad
              </button>
            )}
            {r.datos.publicada === true && (
              <button
                disabled={busy}
                className="block underline text-red-300"
                onClick={() =>
                  void run(async () => {
                    await api.post(
                      `/personal/documentos-empresa/${r.id}/retirar-enlace`,
                    );
                    setMensaje(
                      "Enlace público retirado. El documento y sus entregas permanecen privados.",
                    );
                  })
                }
              >
                Retirar enlace público
              </button>
            )}
            {r.datos.publicada === true && (
              <p className="break-all">
                Enlace público:{" "}
                <a
                  className="text-orange-300 underline"
                  href={`${String(api.defaults.baseURL).replace(/\/$/, "")}/personal-politicas/${(r as any).empresaId}/${(r as any).sucursalId}/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {`${String(api.defaults.baseURL).replace(/\/$/, "")}/personal-politicas/${(r as any).empresaId}/${(r as any).sucursalId}/${r.id}`}
                </a>
              </p>
            )}
          </article>
        ))}
      </section>
      {seleccionada && seleccionada.estado === "BORRADOR" && (
        <form
          className="space-y-3 rounded-lg border border-orange-700 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.post(
                `/personal/documentos-empresa/${seleccion}/adoptar`,
                { vigencia, revisadaPor: revisor, acepta, publicar },
              );
              setSeleccion("");
              setMensaje(
                "Política adoptada. Ahora vincúlala al aviso de Privacidad.",
              );
            });
          }}
        >
          <h3>
            Adoptar {seleccionada.datos.nombre} ·{" "}
            {seleccionada.datos.versionEtiqueta}
          </h3>
          <fieldset disabled={busy} className="space-y-3">
            <label className="block">
              Revisada por
              <input
                required
                className={control}
                value={revisor}
                onChange={(e) => setRevisor(e.target.value)}
              />
            </label>
            <label className="block">
              Fecha de entrada en vigencia
              <input
                required
                type="date"
                max={fechaHoy()}
                className={control}
                value={vigencia}
                onChange={(e) => setVigencia(e.target.value)}
              />
            </label>
            <label className="flex gap-2">
              <input
                required
                type="checkbox"
                checked={acepta}
                onChange={(e) => setAcepta(e.target.checked)}
              />
              He revisado el documento completo, completado los campos y
              habilitado sus canales y procedimientos. Habrá copia en papel.
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={publicar}
                onChange={(e) => setPublicar(e.target.checked)}
              />
              Publicar exclusivamente esta política mediante un enlace público.
              Confirmo que no contiene datos privados de empleados ni firmas.
            </label>
            <button className={boton}>Adoptar esta versión</button>
          </fieldset>
        </form>
      )}
      <form
        className="space-y-3 border-t border-gray-700 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void run(async () => {
            await api.post(
              `/personal/documentos-empresa/${fd.get("politicaId")}/entregas`,
              {
                empleadoId: fd.get("empleadoId"),
                fecha: fd.get("fecha"),
                medio: fd.get("medio"),
                observacion: fd.get("observacion"),
                confirmado: fd.get("confirmado") === "on",
              },
            );
            setMensaje(
              "Entrega registrada. No se ha firmado ni autorizado en nombre del empleado.",
            );
          });
        }}
      >
        <h3 className="text-xl">Registrar entrega de política al empleado</h3>
        <p className="text-sm">
          Registra una entrega efectivamente realizada; no envía correos ni
          sustituye la autorización del empleado.
        </p>
        <fieldset
          disabled={busy || !politicas.length || !empleados.length}
          className="grid gap-3 md:grid-cols-2"
        >
          <label>
            Empleado
            <select required name="empleadoId" className={control}>
              <option value="">Selecciona</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.datos.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Versión entregada
            <select required name="politicaId" className={control}>
              <option value="">Selecciona</option>
              {politicas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.datos.nombre} · {p.datos.versionEtiqueta}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha real
            <input
              required
              name="fecha"
              type="date"
              max={fechaHoy()}
              defaultValue={fechaHoy()}
              className={control}
            />
          </label>
          <label>
            Medio
            <select required name="medio" className={control}>
              <option value="PAPEL">Copia en papel</option>
              <option value="CORREO">Correo ya enviado</option>
              <option value="PRESENCIAL">Entrega presencial</option>
            </select>
          </label>
          <label className="md:col-span-2">
            Observación o referencia de evidencia
            <textarea name="observacion" maxLength={2000} className={control} />
          </label>
          <label className="md:col-span-2 flex gap-2">
            <input required type="checkbox" name="confirmado" />
            Confirmo que realicé esta entrega. Es una constancia administrativa,
            no una firma del empleado.
          </label>
          <button className={boton}>Registrar entrega</button>
        </fieldset>
      </form>
      <div className="space-y-2">
        {data.entregas.map((r) => (
          <p key={r.id} className="rounded border border-gray-700 p-2">
            {r.datos.empleadoNombre} · {r.datos.nombre} · versión{" "}
            {r.datos.versionEtiqueta} · {r.datos.fecha} · {r.datos.medio}
            <br />
            <span className="text-xs">{r.datos.alcance}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
