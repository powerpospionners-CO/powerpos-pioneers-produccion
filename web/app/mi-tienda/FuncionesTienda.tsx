"use client";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import type { TiendaPublica } from "@/lib/tiendaPublica";
import { csvSeguro } from "@/lib/csvSeguro";
import { useNotificar } from "@/components/Notificaciones";
type Config = TiendaPublica["config"];
type Cupon = {
  id?: string;
  codigo: string;
  tipo: "PORCENTAJE" | "VALOR";
  valor: number;
  desde: string;
  hasta: string;
  minimo: number;
  maxUsos: number;
  usos?: number;
  activo: boolean;
  descripcion: string;
};
type Persona = { id: string; nombre: string; correo: string; whatsapp?: string; telefono?: string; creadoEn: string };
const input = "mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white";
const boton = "rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-50";
const card = "rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4";
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const nuevoCupon = (): Cupon => ({ codigo: "", tipo: "PORCENTAJE", valor: 10, desde: hoy(), hasta: hoy(), minimo: 0, maxUsos: 0, activo: true, descripcion: "" });
const error = (e: any, texto: string) => e?.response?.data?.message || texto;

function descargarCsv(nombre: string, filas: string[][]) {
  const blob = new Blob(["﻿" + filas.map((f) => f.map(csvSeguro).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FuncionesTienda({
  config,
  busy,
  onChange,
}: {
  config: Config;
  busy: boolean;
  onChange: (k: string, v: unknown) => void;
}) {
  const [cupones, setCupones] = useState<Cupon[]>([]),
    [editando, setEditando] = useState<Cupon | null>(null),
    [suscriptores, setSuscriptores] = useState<Persona[] | null>(null),
    [clientes, setClientes] = useState<Persona[] | null>(null),
    [ocupado, setOcupado] = useState(false),
    [aviso, setAviso] = useState(""),
    [falla, setFalla] = useState("");
  const { confirmar } = useNotificar();
  const cargarCupones = useCallback(async () => {
    try {
      setCupones((await api.get("/tienda-admin/cupones")).data);
    } catch (e) {
      setFalla(error(e, "No se pudieron cargar los cupones"));
    }
  }, []);
  useEffect(() => {
    void cargarCupones();
  }, [cargarCupones]);
  async function accion(fn: () => Promise<unknown>, exito: string) {
    setOcupado(true);
    setFalla("");
    setAviso("");
    try {
      await fn();
      setAviso(exito);
    } catch (e) {
      setFalla(error(e, "No se pudo completar la acción"));
    } finally {
      setOcupado(false);
    }
  }
  const guardarCupon = () =>
    accion(async () => {
      const { id, usos, ...datos } = editando!;
      void usos;
      if (id) await api.patch(`/tienda-admin/cupones/${id}`, datos);
      else await api.post("/tienda-admin/cupones", datos);
      setEditando(null);
      await cargarCupones();
    }, "Cupón guardado.");
  const deshabilitado = busy || ocupado;
  return (
    <>
      <section className={card}>
        <h2 className="text-xl font-bold">Funciones de la tienda en línea</h2>
        <p className="text-gray-400">
          Actívalas y guarda los cambios. Cada función pide la autorización de
          datos del cliente; descríbela en tu política de privacidad.
        </p>
        {(
          [
            ["reservasHabilitadas", "Recibir reservas", "Los clientes eligen fecha, hora y personas; tu equipo las confirma en Reservas."],
            ["boletinHabilitado", "Boletín de novedades", "Formulario en el pie de página para recibir novedades por correo o WhatsApp."],
            ["cuentasHabilitadas", "Cuentas de cliente", "Registro con contraseña para ver pedidos anteriores y repetirlos."],
          ] as const
        ).map(([campo, titulo, ayuda]) => (
          <label key={campo} className="flex gap-3">
            <input
              type="checkbox"
              className="mt-1"
              disabled={busy}
              checked={!!config[campo]}
              onChange={(e) => onChange(campo, e.target.checked)}
            />
            <span>
              {titulo}
              <span className="block text-sm text-gray-400">{ayuda}</span>
            </span>
          </label>
        ))}
        {config.reservasHabilitadas && (
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              Máximo de personas por reserva
              <input type="number" min={1} max={100} className={input} disabled={busy} value={config.reservaMaxPersonas ?? 10} onChange={(e) => onChange("reservaMaxPersonas", Number(e.target.value))} />
            </label>
            <label>
              Días de anticipación permitidos
              <input type="number" min={1} max={180} className={input} disabled={busy} value={config.reservaDiasMax ?? 30} onChange={(e) => onChange("reservaDiasMax", Number(e.target.value))} />
            </label>
          </div>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Cupones de descuento</h2>
          <button type="button" className={boton} disabled={deshabilitado} onClick={() => setEditando(nuevoCupon())}>
            Nuevo cupón
          </button>
        </div>
        <p className="text-gray-400">
          El descuento aplica solo a los productos, no al domicilio. Al aceptar
          el pedido en Domicilios, la venta registra el descuento y el código.
          Si rechazas el pedido, el uso vuelve al cupón.
        </p>
        {(falla || aviso) && (
          <p role={falla ? "alert" : "status"} className={falla ? "text-red-300" : "text-teal-300"}>
            {falla || aviso}
          </p>
        )}
        {editando && (
          <div className="space-y-3 rounded-lg border border-gray-700 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                Código
                <input className={input} maxLength={24} disabled={!!editando.id} value={editando.codigo} onChange={(e) => setEditando({ ...editando, codigo: e.target.value.toUpperCase() })} />
              </label>
              <label>
                Tipo
                <select className={input} value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as Cupon["tipo"] })}>
                  <option value="PORCENTAJE">Porcentaje</option>
                  <option value="VALOR">Valor fijo</option>
                </select>
              </label>
              <label>
                {editando.tipo === "PORCENTAJE" ? "Porcentaje (1 a 90)" : "Valor del descuento"}
                <input type="number" min={1} className={input} value={editando.valor} onChange={(e) => setEditando({ ...editando, valor: Number(e.target.value) })} />
              </label>
              <label>
                Compra mínima en productos
                <input type="number" min={0} className={input} value={editando.minimo} onChange={(e) => setEditando({ ...editando, minimo: Number(e.target.value) })} />
              </label>
              <label>
                Desde
                <input type="date" className={input} value={editando.desde} onChange={(e) => setEditando({ ...editando, desde: e.target.value })} />
              </label>
              <label>
                Hasta
                <input type="date" className={input} value={editando.hasta} onChange={(e) => setEditando({ ...editando, hasta: e.target.value })} />
              </label>
              <label>
                Límite total de usos (0 = sin límite)
                <input type="number" min={0} className={input} value={editando.maxUsos} onChange={(e) => setEditando({ ...editando, maxUsos: Number(e.target.value) })} />
              </label>
              <label>
                Descripción para el cliente
                <input className={input} maxLength={200} value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
              </label>
            </div>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
              Activo
            </label>
            <div className="flex gap-3">
              <button type="button" className="rounded-lg bg-teal-700 px-4 py-2 disabled:opacity-50" disabled={deshabilitado} onClick={guardarCupon}>
                Guardar cupón
              </button>
              <button type="button" className={boton} onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {!cupones.length && <p className="text-gray-400">Todavía no hay cupones.</p>}
        <ul className="divide-y divide-gray-800">
          {cupones.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <strong>{c.codigo}</strong> · {c.tipo === "PORCENTAJE" ? `${c.valor}%` : `$${c.valor.toLocaleString("es-CO")}`} · {c.desde} a {c.hasta} · {c.usos || 0}
                {c.maxUsos ? ` de ${c.maxUsos}` : ""} usos {c.activo ? "" : "· inactivo"}
              </span>
              <span className="flex gap-2">
                <button type="button" className={boton} disabled={deshabilitado} onClick={() => setEditando({ ...c })}>
                  Editar
                </button>
                {!c.usos && (
                  <button type="button" className={boton} disabled={deshabilitado} onClick={() => accion(async () => { await api.delete(`/tienda-admin/cupones/${c.id}`); await cargarCupones(); }, "Cupón eliminado.")}>
                    Eliminar
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-xl font-bold">Suscriptores y cuentas de clientes</h2>
        <p className="text-gray-400">
          Datos personales cifrados. Úsalos solo para lo que el cliente
          autorizó y elimina a quien lo solicite. Las listas solo se cargan
          cuando las abres.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={boton} disabled={deshabilitado} onClick={() => accion(async () => setSuscriptores((await api.get("/tienda-admin/suscriptores")).data), "Suscriptores cargados.")}>
            Ver suscriptores
          </button>
          <button type="button" className={boton} disabled={deshabilitado} onClick={() => accion(async () => setClientes((await api.get("/tienda-admin/clientes-web")).data), "Cuentas cargadas.")}>
            Ver cuentas de clientes
          </button>
        </div>
        {suscriptores && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold">{suscriptores.length} suscriptores activos</h3>
              {!!suscriptores.length && (
                <button type="button" className={boton} onClick={() => descargarCsv("suscriptores.csv", [["Nombre", "Correo", "WhatsApp", "Fecha"], ...suscriptores.map((s) => [s.nombre, s.correo, s.whatsapp || "", s.creadoEn.slice(0, 10)])])}>
                  Exportar CSV
                </button>
              )}
            </div>
            <ul className="divide-y divide-gray-800">
              {suscriptores.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{s.nombre || "Sin nombre"} · {s.correo || s.whatsapp}</span>
                  <button type="button" className="text-red-300 underline" disabled={deshabilitado} onClick={() => accion(async () => { await api.delete(`/tienda-admin/suscriptores/${s.id}`); setSuscriptores(suscriptores.filter((x) => x.id !== s.id)); }, "Suscriptor eliminado.")}>
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {clientes && (
          <div className="space-y-2">
            <h3 className="font-bold">{clientes.length} cuentas de clientes</h3>
            <ul className="divide-y divide-gray-800">
              {clientes.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{c.nombre} · {c.correo} · {c.telefono}</span>
                  <button type="button" className="text-red-300 underline" disabled={deshabilitado} onClick={async () => { if (await confirmar(`Se eliminará la cuenta de ${c.nombre} y su historial en la tienda. Esta acción no se puede deshacer.`, { titulo: "Eliminar cuenta de cliente", textoConfirmar: "Eliminar cuenta", peligroso: true })) void accion(async () => { await api.delete(`/tienda-admin/clientes-web/${c.id}`); setClientes(clientes.filter((x) => x.id !== c.id)); }, "Cuenta eliminada."); }}>
                    Eliminar cuenta
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
