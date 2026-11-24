"use client";
import { useState } from "react";
import api from "@/lib/api";
type Registro = { id: string; estado: string; datos: Record<string, any> };
const control =
  "mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-white";
const boton =
  "rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-40";
const claveCargo = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-CO")
    .replace(/\s+/g, " ");
const campos = [
  ["razonSocial", "Razón social legal del empleador"],
  ["domicilioEmpresa", "Domicilio del empleador"],
  ["lugarCelebracion", "Lugar de celebración"],
  ["lugarContratacion", "Lugar de contratación"],
  ["lugarServicio", "Dirección de trabajo habitual"],
  ["formaPago", "Forma de pago y fechas quincenales o mensuales"],
  ["jornada", "Jornada y distribución del horario"],
  ["descansos", "Descansos y turnos"],
  [
    "funciones",
    "Funciones habituales (se usan si el expediente no tiene funciones específicas)",
  ],
];
export default function ContratosAutomaticos({
  data,
  empleados,
  onPreparado,
  onCambio,
  bloquear,
}: {
  data: any;
  empleados: Registro[];
  onPreparado: (r: Registro) => Promise<void>;
  onCambio: () => Promise<any>;
  bloquear: boolean;
}) {
  const [empleadoId, setEmpleadoId] = useState(""),
    [tipo, setTipo] = useState("INDEFINIDO"),
    [fin, setFin] = useState(""),
    [obra, setObra] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mensaje, setMensaje] = useState(""),
    [perfilCargo, setPerfilCargo] = useState(""),
    [usarGeneral, setUsarGeneral] = useState(false),
    [confirmarGeneral, setConfirmarGeneral] = useState(false);
  const ultimo = data?.plantillasModalidad?.[0]?.datos;
  const [perfil, setPerfil] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      campos.map(([k]) => [
        k,
        ([
          "razonSocial",
          "domicilioEmpresa",
          "lugarCelebracion",
          "lugarContratacion",
          "formaPago",
        ].includes(k)
          ? ultimo?.[k]
          : "") ||
          (k === "razonSocial"
            ? data?.privacidad?.responsable || data?.empresa?.nombre || ""
            : k === "domicilioEmpresa" || k === "lugarServicio"
              ? data?.empresa?.direccion || ""
              : ""),
      ]),
    ),
  );
  const emp = empleados.find((e) => e.id === empleadoId);
  const especifica = data?.plantillasModalidad?.find(
    (p: Registro) =>
      p.datos.tipo === tipo &&
      p.datos.perfilCargo &&
      claveCargo(p.datos.perfilCargo) === claveCargo(emp?.datos.cargo || ""),
  );
  const general = data?.plantillasModalidad?.find(
    (p: Registro) => p.datos.tipo === tipo && !p.datos.perfilCargo,
  );
  const plantilla = especifica || (usarGeneral ? general : null);
  const perfilesGuardados: Registro[] = (
    data?.plantillasModalidad || []
  ).filter(
    (p: Registro, i: number, todos: Registro[]) =>
      p.datos.perfilCargo &&
      todos.findIndex(
        (x) =>
          claveCargo(x.datos.perfilCargo || "") ===
          claveCargo(p.datos.perfilCargo),
      ) === i,
  );
  function nuevoCargo(nombre: string) {
    setPerfilCargo(nombre);
    setPerfil((p) => ({
      ...p,
      funciones: "",
      jornada: "",
      descansos: "",
      lugarServicio: "",
    }));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMensaje("");
    try {
      await fn();
    } catch (e: any) {
      setError(
        String(
          e.response?.data?.message || e.message || "No se pudo completar",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-orange-700 bg-gray-900 p-5">
      <h2 className="text-2xl font-semibold">
        Contratos digitales por modalidad
      </h2>
      <p>
        Configura las condiciones por cargo. Cada perfil tiene sus tres
        modalidades y conserva sus propias funciones, jornada y lugar de
        trabajo. Después selecciona al empleado y la modalidad: su nombre,
        identificación, correo, ingreso, cargo, salario y periodicidad se toman
        del expediente.
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
      <details open={!data?.plantillasModalidad?.length}>
        <summary className="cursor-pointer font-semibold">
          Configurar plantillas por cargo
        </summary>
        <form
          className="mt-3 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.post("/personal/editor/plantillas-modalidad", {
                ...perfil,
                perfilCargo,
                aplicarATodas: true,
              });
              await onCambio();
              setMensaje(
                `Plantillas guardadas para ${perfilCargo}. Los demás cargos y sus versiones se conservan.`,
              );
            });
          }}
        >
          <fieldset
            disabled={busy || bloquear}
            className="grid gap-3 md:grid-cols-2"
          >
            <label className="md:col-span-2">
              Editar un perfil guardado
              <select
                className={control}
                defaultValue=""
                onChange={(e) => {
                  const p = data.plantillasModalidad.find(
                    (r: Registro) => r.id === e.target.value,
                  );
                  if (p) {
                    setPerfilCargo(p.datos.perfilCargo);
                    setPerfil(
                      Object.fromEntries(
                        campos.map(([k]) => [k, p.datos[k] || ""]),
                      ),
                    );
                  } else nuevoCargo("");
                }}
              >
                <option value="">Crear un perfil nuevo</option>
                {perfilesGuardados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.datos.perfilCargo}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              Cargo del perfil (usa el mismo nombre registrado en Empleados)
              <input
                required
                maxLength={200}
                list="cargos-contratos"
                className={control}
                value={perfilCargo}
                onChange={(e) => nuevoCargo(e.target.value)}
              />
              <datalist id="cargos-contratos">
                {Array.from(
                  new Set<string>([
                    ...perfilesGuardados.map((p) =>
                      String(p.datos.perfilCargo),
                    ),
                    ...empleados.map((e) => String(e.datos.cargo)),
                  ]),
                ).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            {emp && (
              <button
                type="button"
                className="text-left text-orange-300 underline"
                onClick={() => nuevoCargo(emp.datos.cargo)}
              >
                Usar el cargo del empleado seleccionado: {emp.datos.cargo}
              </button>
            )}
            <label className="md:col-span-2">
              Ejemplos opcionales de funciones (no son cargos registrados en tu
              empresa)
              <select
                className={control}
                defaultValue=""
                onChange={(e) => {
                  const g = data.guiasCargos.find(
                    (g: any) => g.nombre === e.target.value,
                  );
                  if (g) {
                    if (!perfilCargo) nuevoCargo(g.nombre);
                    setPerfil((p) => ({ ...p, funciones: g.funciones }));
                  }
                }}
              >
                <option value="">
                  Selecciona una guía o redacta tus funciones
                </option>
                {(data.guiasCargos || []).map((g: any) => (
                  <option key={g.nombre} value={g.nombre}>
                    {g.nombre}
                  </option>
                ))}
              </select>
            </label>
            {campos.map(([k, l]) => (
              <label
                key={k}
                className={
                  k === "funciones" || k === "jornada" || k === "descansos"
                    ? "md:col-span-2"
                    : ""
                }
              >
                {l}
                <textarea
                  required
                  className={control}
                  maxLength={
                    k === "funciones"
                      ? 3000
                      : k === "jornada" || k === "descansos"
                        ? 2000
                        : k === "formaPago"
                          ? 1000
                          : k === "domicilioEmpresa" || k === "lugarServicio"
                            ? 500
                            : 300
                  }
                  rows={k === "jornada" || k === "funciones" ? 3 : 2}
                  value={perfil[k]}
                  onChange={(e) =>
                    setPerfil((p) => ({ ...p, [k]: e.target.value }))
                  }
                />
              </label>
            ))}
            <p className="md:col-span-2 text-sm text-amber-200">
              Las condiciones deben reflejar el trabajo real. Los textos base
              incluyen prestaciones, recargos, privacidad, custodia, continuidad
              y firma electrónica. No crean períodos de prueba retroactivos ni
              renuncias a derechos.
            </p>
            <button className={boton}>
              Guardar las tres modalidades de este cargo
            </button>
          </fieldset>
        </form>
      </details>
      <form
        className="space-y-3 border-t border-gray-700 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = (
              await api.post("/personal/editor/preparar", {
                empleadoId,
                plantillaId: plantilla.id,
                confirmarPerfilGeneral: !especifica && confirmarGeneral,
                fin: tipo === "FIJO" ? fin : undefined,
                obra: tipo === "OBRA_LABOR" ? obra : undefined,
              })
            ).data;
            await onPreparado(r);
            setMensaje(
              "Contrato completado y guardado como borrador. Continúa con la lectura, revisión y emisión que aparecen abajo.",
            );
          });
        }}
      >
        <fieldset
          disabled={busy || bloquear}
          className="grid gap-3 md:grid-cols-2"
        >
          <label>
            Empleado
            <select
              className={control}
              required
              value={empleadoId}
              onChange={(e) => {
                setEmpleadoId(e.target.value);
                setUsarGeneral(false);
                setConfirmarGeneral(false);
              }}
            >
              <option value="">Selecciona un empleado</option>
              {empleados
                .filter((e) => e.estado === "ACTIVO")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.datos.nombre}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Tipo de contrato
            <select
              className={control}
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value);
                setUsarGeneral(false);
                setConfirmarGeneral(false);
                setFin("");
                setObra("");
              }}
            >
              <option value="INDEFINIDO">Término indefinido</option>
              <option value="FIJO">Término fijo</option>
              <option value="OBRA_LABOR">Obra o labor determinada</option>
            </select>
          </label>
          {emp && (
            <div className="md:col-span-2 rounded-lg border border-gray-700 p-3">
              <strong>{emp.datos.nombre}</strong>
              <p>
                {emp.datos.cargo} · Ingreso {emp.datos.ingreso} · Salario básico
                COP {(emp.datos.salarioCentavos / 100).toLocaleString("es-CO")}{" "}
                · {emp.datos.frecuencia}
              </p>
              <p>Correo del enlace de firma: {emp.datos.email}</p>
              <p>
                Domicilio:{" "}
                {emp.datos.domicilio || "Falta completar en Empleados"}
              </p>
            </div>
          )}
          {emp && !especifica && (
            <div className="md:col-span-2 space-y-2 rounded-lg border border-amber-700 p-3">
              <p>
                No hay un perfil específico para «{emp.datos.cargo}» en esta
                modalidad. Configúralo arriba para completar sus condiciones.
              </p>
              {general && (
                <>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={usarGeneral}
                      onChange={(e) => {
                        setUsarGeneral(e.target.checked);
                        setConfirmarGeneral(false);
                      }}
                    />
                    Mostrar la plantilla anterior sin cargo para una revisión
                    expresa
                  </label>
                  {usarGeneral && (
                    <>
                      <p className="whitespace-pre-wrap">
                        Funciones: {general.datos.funciones}
                        <br />
                        Jornada: {general.datos.jornada}
                        <br />
                        Descansos: {general.datos.descansos}
                        <br />
                        Lugar: {general.datos.lugarServicio}
                      </p>
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={confirmarGeneral}
                          onChange={(e) =>
                            setConfirmarGeneral(e.target.checked)
                          }
                        />
                        Revisé expresamente estas condiciones y corresponden a
                        este empleado. No estoy aplicando las de otro puesto.
                      </label>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {especifica && (
            <div className="md:col-span-2 rounded-lg border border-gray-700 p-3">
              <p>
                Perfil seleccionado automáticamente:{" "}
                <strong>{especifica.datos.perfilCargo}</strong>
              </p>
              <p className="whitespace-pre-wrap">
                Funciones: {emp?.datos.funciones || especifica.datos.funciones}
                <br />
                Jornada: {especifica.datos.jornada}
                <br />
                Descansos: {especifica.datos.descansos}
                <br />
                Lugar:{" "}
                {emp?.datos.lugarServicio || especifica.datos.lugarServicio}
              </p>
            </div>
          )}
          {tipo === "FIJO" && (
            <label>
              Fecha final pactada
              <input
                required
                type="date"
                min={emp?.datos.ingreso}
                value={fin}
                onChange={(e) => setFin(e.target.value)}
                className={control}
              />
            </label>
          )}
          {tipo === "OBRA_LABOR" && (
            <label className="md:col-span-2">
              Obra o labor precisa, alcance y condición verificable de
              terminación
              <textarea
                required
                minLength={30}
                maxLength={3000}
                rows={4}
                className={control}
                value={obra}
                onChange={(e) => setObra(e.target.value)}
              />
            </label>
          )}
          {tipo !== "INDEFINIDO" && (
            <p className="md:col-span-2 text-sm text-amber-200">
              Esta modalidad requiere condiciones específicas por escrito. Para
              relaciones ya iniciadas utiliza la revisión individual del editor;
              la selección no cambia retroactivamente su naturaleza.
            </p>
          )}
          <p className="md:col-span-2 text-sm">
            {plantilla
              ? `Plantilla: ${plantilla.datos.nombre} · guardada ${String(plantilla.datos.guardadaEn).slice(0, 10)}`
              : "Primero guarda las condiciones del cargo para habilitar esta modalidad."}
          </p>
          <button
            className={boton}
            disabled={
              !plantilla ||
              !emp ||
              !emp.datos.domicilio ||
              (!especifica && !confirmarGeneral)
            }
          >
            Completar contrato del empleado
          </button>
        </fieldset>
      </form>
      <p className="text-sm text-gray-300">
        Después de emitir el original, el representante firma y envía el enlace
        al correo del empleado. El empleado lee el PDF completo, solicita su
        código de verificación y firma desde su propio acceso. El envío no
        equivale a una firma.
      </p>
    </section>
  );
}
