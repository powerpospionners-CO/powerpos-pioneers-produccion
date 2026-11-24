"use client";
import { useEffect, useState } from "react";

const button =
  "rounded-lg bg-orange-600 px-5 py-3 text-white disabled:opacity-40";
export default function FirmaLaboral() {
  const [acceso, setAcceso] = useState<{
      empresa: string;
      sede: string;
      token: string;
    } | null>(null),
    [sesion, setSesion] = useState(""),
    [codigo, setCodigo] = useState(""),
    [enviado, setEnviado] = useState(false),
    [vista, setVista] = useState<any>(null),
    [error, setError] = useState(""),
    [mensaje, setMensaje] = useState(""),
    [busy, setBusy] = useState(false),
    [leido, setLeido] = useState(false),
    [politica, setPolitica] = useState(false),
    [copia, setCopia] = useState(false),
    [reclamo, setReclamo] = useState(""),
    [original, setOriginal] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1)),
      empresa = p.get("empresa") || "",
      sede = p.get("sede") || "",
      token = p.get("token") || "";
    if (
      /^\d+$/.test(empresa) &&
      /^\d+$/.test(sede) &&
      /^[a-f0-9]{64}$/.test(token)
    )
      setAcceso({ empresa, sede, token });
    else
      setError(
        "Abre el enlace privado que recibiste por correo. Si venció, pide a tu empleador una nueva invitación.",
      );
  }, []);
  async function pedir(
    ruta: string,
    datos: Record<string, unknown> = {},
    blob = false,
  ) {
    if (!acceso) throw Error("Falta el enlace privado");
    const r = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/personal-firma/${acceso.empresa}/${acceso.sede}/${ruta}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: acceso.token, sesion, ...datos }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
    if (!r.ok) {
      let mensaje = "No fue posible completar la solicitud";
      try {
        mensaje = (await r.json()).message || mensaje;
      } catch {}
      throw Error(String(mensaje));
    }
    return blob ? r.blob() : r.json();
  }
  async function hacer(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function descargar(tipo: string) {
    const bytes = await pedir(tipo, {}, true),
      url = URL.createObjectURL(bytes),
      a = document.createElement("a");
    a.href = url;
    a.download =
      tipo === "politica"
        ? "politica-tratamiento-datos.pdf"
        : tipo === "documento"
          ? "documento-laboral.pdf"
          : "documento-y-evidencias.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (tipo === "documento") setOriginal(true);
  }
  async function resolver(esReclamo: boolean) {
    if (esReclamo && !reclamo.trim())
      throw Error("Describe la diferencia para enviarla al empleador.");
    const r = await pedir("resolver", {
      acepta: leido,
      politica,
      copiaCorreo: copia,
      ...(esReclamo ? { reclamo } : {}),
    });
    setMensaje(
      `${esReclamo ? "La diferencia quedó registrada. No se confirmó recepción del importe ni aceptación del contrato." : "Tu confirmación quedó registrada con la fecha real."} ${r.copiaEntregada ? "Enviamos una copia a tu correo." : "La copia por correo está pendiente; puedes descargarla aquí y pedir su reenvío."}`,
    );
    setVista((v: any) => ({
      ...v,
      documento: {
        ...v.documento,
        estado: esReclamo
          ? "EN_REVISION"
          : v.documento.tipo === "PAGO"
            ? "RECIBIDO_FIRMADO"
            : "FIRMADO",
      },
    }));
  }
  const doc = vista?.documento,
    d = doc?.datos,
    finalizado =
      doc &&
      !["REGISTRADO_SIN_CONFIRMAR", "PENDIENTE_EMPLEADO"].includes(doc.estado),
    money = (v: number) =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
      }).format(v / 100);
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-gray-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold">Revisión de documento laboral</h1>
        <p className="text-gray-400">
          Este enlace es personal. Tu empleador no necesita conocer tu código.
          Puedes solicitar atención y documentos en papel sin firmar
          electrónicamente.
        </p>
        {error && (
          <p className="rounded-xl bg-red-950 p-4" role="alert">
            {error}
          </p>
        )}
        {mensaje && (
          <p className="rounded-xl bg-green-950 p-4" role="status">
            {mensaje}
          </p>
        )}
        {acceso && !sesion && (
          <section className="space-y-4 rounded-xl border border-gray-700 p-6">
            <h2 className="text-xl">Verifica tu correo personal</h2>
            <p>
              Enviaremos un código al correo registrado por tu empleador. Vence
              en diez minutos y permite cinco intentos.
            </p>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                void hacer(async () => {
                  await pedir("codigo");
                  setEnviado(true);
                  setMensaje(
                    "Código enviado. Revisa también la carpeta de correo no deseado.",
                  );
                })
              }
            >
              {enviado ? "Enviar otro código" : "Recibir código por correo"}
            </button>
            {enviado && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void hacer(async () => {
                    const r = await pedir("verificar", { codigo });
                    setSesion(r.sesion);
                    setMensaje(
                      "Correo verificado. Revisa el documento antes de decidir.",
                    );
                  });
                }}
              >
                <label className="block">
                  Código de ocho dígitos
                  <input
                    className="mt-2 block rounded-lg border border-gray-600 bg-gray-900 p-3"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]{8}"
                    maxLength={8}
                    autoComplete="one-time-code"
                    required
                  />
                </label>
                <button className={button} disabled={busy}>
                  Verificar
                </button>
              </form>
            )}
          </section>
        )}
        {sesion && !vista && (
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              void hacer(async () => setVista(await pedir("vista")))
            }
          >
            Abrir mi documento
          </button>
        )}
        {doc && (
          <>
            <section className="space-y-3 rounded-xl border border-gray-700 bg-gray-900 p-6">
              <h2 className="text-xl font-semibold">
                {doc.tipo === "PAGO"
                  ? "Comprobante de abono laboral"
                  : "Contrato individual"}
              </h2>
              <p>
                Empleador: <strong>{d.empresa?.nombre}</strong>
              </p>
              <p>
                Trabajador: <strong>{d.empleado?.nombre}</strong>
              </p>
              <p>Estado: {doc.estado.replaceAll("_", " ")}</p>
              {doc.tipo === "PAGO" ? (
                <>
                  <p>
                    Periodo: {d.desde} al {d.hasta}
                  </p>
                  <p>Fecha real registrada: {d.fechaPago}</p>
                  <p className="text-xl">
                    Importe de este abono:{" "}
                    <strong>{money(d.montoCentavos)}</strong>
                  </p>
                  <p>Medio registrado: {d.medio}</p>
                  <p>
                    Neto del periodo: {money(d.netoPeriodoCentavos)}. Abonos
                    anteriores registrados: {money(d.pagadoAnteriorCentavos)}.
                    Saldo tras este abono: {money(d.saldoTrasAbonoCentavos)}.
                  </p>
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th>Concepto del periodo</th>
                        <th>Tipo</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.conceptos.map((c: any, i: number) => (
                        <tr key={i}>
                          <td className="py-2">
                            {c.nombre}
                            {c.fundamento && (
                              <p className="text-xs text-gray-400">
                                {c.fundamento}
                              </p>
                            )}
                          </td>
                          <td>{c.tipo}</td>
                          <td>{money(c.montoCentavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-sm text-amber-200">
                    Este importe puede ser un abono parcial. Confirma únicamente
                    si ya recibiste ese dinero. Este soporte interno no acredita
                    transmisión DIAN.
                  </p>
                </>
              ) : (
                <>
                  <p>Modalidad: {d.tipo}</p>
                  <p>
                    Inicio pactado: {d.inicio} {d.fin && `· Fin: ${d.fin}`}
                  </p>
                  <p>
                    La firma llevará la fecha actual. Lee el contrato completo y
                    sus anexos en el PDF antes de aceptar; los datos resumidos
                    no sustituyen su texto.
                  </p>
                </>
              )}
              <button
                className={button}
                disabled={busy}
                onClick={() => void hacer(() => descargar("documento"))}
              >
                Descargar y leer PDF completo
              </button>
              <p className="break-all text-xs text-gray-400">
                Huella SHA-256: {d.documentoHash}
              </p>
              <button
                className="block text-orange-300 underline"
                disabled={busy}
                onClick={() => void hacer(() => descargar("paquete"))}
              >
                Descargar documento y evidencias
              </button>
            </section>
            <section className="rounded-xl border border-gray-700 p-6">
              <h2 className="text-xl font-semibold">Privacidad y atención</h2>
              <p className="mt-3 whitespace-pre-wrap">
                {vista.politica.politica}
              </p>
              {vista.politica.completa && (
                <div className="mt-3">
                  <p>
                    Política completa: {vista.politica.completa.nombre} ·
                    versión {vista.politica.completa.versionEtiqueta}
                  </p>
                  <button
                    className="text-orange-300 underline"
                    disabled={busy}
                    onClick={() => void hacer(() => descargar("politica"))}
                  >
                    Descargar política completa de esta invitación
                  </button>
                </div>
              )}
              {vista.politica.enlacePolitica && (
                <a
                  className="mt-3 block text-orange-300 underline"
                  href={vista.politica.enlacePolitica}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Consultar política completa
                </a>
              )}
              <p className="mt-3">
                Responsable: {vista.politica.responsable}. Contacto:{" "}
                {vista.politica.correo}
              </p>
            </section>
            {!finalizado && (
              <section className="space-y-4 rounded-xl border border-gray-700 p-6">
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={leido}
                    onChange={(e) => setLeido(e.target.checked)}
                  />
                  He descargado y leído el documento completo. Podré confirmar o
                  presentar una diferencia sin renunciar a mis derechos.
                </label>
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={politica}
                    onChange={(e) => setPolitica(e.target.checked)}
                  />
                  Confirmo que he leído el aviso y la política de privacidad de
                  mi empleador y conozco el canal para ejercer mis derechos.
                </label>
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={copia}
                    onChange={(e) => setCopia(e.target.checked)}
                  />
                  Autorizo la entrega de la copia de este documento y sus
                  evidencias al correo que acabo de verificar.
                </label>
                <p className="text-sm text-gray-400">{vista.aceptacion}</p>
                <button
                  className={button}
                  disabled={busy || !leido || !politica || !copia || !original}
                  onClick={() => void hacer(() => resolver(false))}
                >
                  {doc.tipo === "PAGO"
                    ? "Confirmo que recibí este abono"
                    : "Firmar y aceptar este contrato"}
                </button>
                <hr className="border-gray-700" />
                <label className="block">
                  ¿Hay una diferencia o no recibiste el pago?
                  <textarea
                    className="mt-2 block w-full rounded-lg border border-gray-600 bg-gray-900 p-3"
                    rows={4}
                    maxLength={3000}
                    value={reclamo}
                    onChange={(e) => setReclamo(e.target.value)}
                  />
                </label>
                <button
                  className="rounded-lg border border-orange-500 px-5 py-3 disabled:opacity-40"
                  disabled={
                    busy || !leido || !politica || !copia || !reclamo.trim()
                  }
                  onClick={() => void hacer(() => resolver(true))}
                >
                  Presentar diferencia sin aceptar el documento
                </button>
                <p className="text-sm text-gray-400">
                  La confirmación electrónica es voluntaria. Si no puedes
                  usarla, contacta a tu empleador para obtener atención en
                  papel.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
