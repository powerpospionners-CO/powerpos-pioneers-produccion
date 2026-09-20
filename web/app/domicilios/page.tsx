"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/store/authStore";
const money = (n: number | string) =>
  Number(n).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
export default function Domicilios() {
  const { usuario } = useAuthStore();
  const [pedidos, setPedidos] = useState<any[]>([]),
    [repartidores, setRepartidores] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [filtro, setFiltro] = useState("ACTIVOS"),
    [motivos, setMotivos] = useState<Record<string, string>>({}),
    [asignados, setAsignados] = useState<Record<string, number>>({}),
    [aviso, setAviso] = useState("");
  const anteriores = useRef(new Set<string>());
  const [clientes, setClientes] = useState<any[]>([]),
    [clientesElegidos, setClientesElegidos] = useState<Record<string, number>>(
      {},
    );
  const permitido =
    !!usuario &&
    ["ADMIN_EMPRESA", "GERENTE", "CAJERO", "DOMICILIARIO"].includes(
      usuario.rol,
    );
  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get("/tienda-admin/pedidos");
      if (
        anteriores.current.size &&
        data.some(
          (p: any) => p.estado === "RECIBIDO" && !anteriores.current.has(p.id),
        )
      )
        setAviso("Llegó un nuevo pedido web pendiente de revisión.");
      anteriores.current = new Set(data.map((p: any) => p.id));
      setPedidos(data);
    } catch (e: any) {
      setError(e.response?.data?.message || "No se pudo actualizar la bandeja");
    }
  }, []);
  useEffect(() => {
    if (!permitido) return;
    void cargar();
    if (usuario?.rol !== "DOMICILIARIO") {
      api
        .get("/tienda-admin/repartidores")
        .then((r) => setRepartidores(r.data))
        .catch(() => {});
      api
        .get("/clientes")
        .then((r) => setClientes(r.data))
        .catch(() => {});
    }
    const timer = setInterval(cargar, 5000);
    return () => clearInterval(timer);
  }, [cargar, permitido, usuario?.rol]);
  async function actuar(id: string, accion: string) {
    setBusy(id);
    setError("");
    try {
      await api.patch(`/tienda-admin/pedidos/${id}`, {
        accion,
        motivo: motivos[id],
        repartidorId: asignados[id],
        clienteId: clientesElegidos[id],
      });
      await cargar();
    } catch (e: any) {
      setError(
        e.response?.data?.message || "No fue posible actualizar el pedido",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-6xl p-5 md:p-9">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Domicilios</h1>
              <p className="mt-2 text-gray-400">
                Solicitudes web, revisión del cajero y entregas. Se actualiza
                cada 5 segundos.
              </p>
            </div>
            <button
              onClick={cargar}
              className="rounded-lg border border-gray-600 px-4"
            >
              Actualizar
            </button>
          </div>
          {!permitido ? (
            <p>No tienes acceso a esta bandeja.</p>
          ) : (
            <>
              {aviso && (
                <p role="status" className="my-5 rounded-xl bg-teal-900 p-4">
                  {aviso}
                  <button
                    onClick={() => setAviso("")}
                    className="ml-5 underline"
                  >
                    Entendido
                  </button>
                </p>
              )}
              {error && (
                <p role="alert" className="my-5 rounded-xl bg-red-950 p-4">
                  {error}
                </p>
              )}
              <label className="my-6 block">
                Mostrar{" "}
                <select
                  className="ml-3 rounded bg-gray-800 p-2"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                >
                  <option value="ACTIVOS">Pedidos activos</option>
                  <option value="RECIBIDO">Por revisar</option>
                  <option value="TODOS">Últimos 100 pedidos</option>
                </select>
              </label>
              <div className="grid gap-5 lg:grid-cols-2">
                {pedidos
                  .filter((p) =>
                    filtro === "TODOS" || filtro === "RECIBIDO"
                      ? filtro === "TODOS" || p.estado === "RECIBIDO"
                      : !["RECHAZADO", "ENTREGADO"].includes(p.estado),
                  )
                  .map((p) => (
                    <article
                      className="rounded-xl border border-gray-700 bg-gray-900 p-5"
                      key={p.id}
                    >
                      <div className="flex justify-between gap-3">
                        <h2 className="text-xl font-bold">{p.nombre}</h2>
                        <span className="text-teal-300">
                          {p.estado.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">
                        {new Date(p.creadoEn).toLocaleString("es-CO")} ·{" "}
                        {p.id.slice(0, 8)}
                      </p>
                      <p className="mt-4">
                        {p.telefono} · {p.zona}
                      </p>
                      <p>{p.direccion}</p>
                      {p.observacion && (
                        <p className="mt-2 text-amber-200">{p.observacion}</p>
                      )}
                      <ul className="my-4 space-y-2">
                        {p.items.map((i: any) => (
                          <li
                            className="flex justify-between"
                            key={i.productoId}
                          >
                            <span>
                              {i.cantidad} × {i.nombre}
                            </span>
                            <span>{money(i.precio * i.cantidad)}</span>
                          </li>
                        ))}
                      </ul>
                      <p>Domicilio: {money(p.costoDomicilio)}</p>
                      <p className="my-3 text-xl font-bold">
                        Total: {money(p.total)} · {p.metodoPago}
                      </p>
                      <p className="text-sm text-gray-400">
                        Medio de pago declarado por el cliente; verificar el
                        cobro.
                      </p>
                      {p.pedido && (
                        <p className="mt-3 break-all text-sm">
                          Venta: {p.pedido.numero} · {p.pedido.estado}
                        </p>
                      )}
                      {p.motivo && <p>Motivo: {p.motivo}</p>}
                      {p.repartidorId && (
                        <p className="mt-2">
                          Domiciliario:{" "}
                          {repartidores.find((r) => r.id === p.repartidorId)
                            ?.nombre || "Asignado"}
                        </p>
                      )}
                      <fieldset disabled={!!busy} className="mt-5 space-y-3">
                        {p.estado === "RECIBIDO" &&
                          usuario?.rol !== "DOMICILIARIO" && (
                            <>
                              <p className="text-sm text-gray-400">
                                Al aceptar se registra la venta en la caja
                                abierta y se descuenta inventario.
                              </p>
                              <label className="block">
                                Cliente para fidelización (verifica su
                                identidad)
                                <select
                                  className="mt-2 w-full rounded bg-gray-800 p-3"
                                  value={clientesElegidos[p.id] || 0}
                                  onChange={(e) =>
                                    setClientesElegidos({
                                      ...clientesElegidos,
                                      [p.id]: Number(e.target.value),
                                    })
                                  }
                                >
                                  <option value={0}>
                                    Sin cliente asociado
                                  </option>
                                  {clientes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.nombre} · {c.telefono || c.documento}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="rounded-lg bg-teal-700 px-4 py-3"
                                onClick={() => actuar(p.id, "ACEPTAR")}
                              >
                                Aceptar y registrar venta
                              </button>
                              <label className="block">
                                Motivo de rechazo
                                <input
                                  className="mt-1 w-full rounded bg-gray-800 p-3"
                                  maxLength={300}
                                  value={motivos[p.id] || ""}
                                  onChange={(e) =>
                                    setMotivos({
                                      ...motivos,
                                      [p.id]: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <button
                                disabled={!motivos[p.id]?.trim() || !!busy}
                                className="rounded border border-red-500 px-4 py-2 disabled:opacity-40"
                                onClick={() => actuar(p.id, "RECHAZAR")}
                              >
                                Rechazar solicitud
                              </button>
                            </>
                          )}
                        {p.estado === "ACEPTADO" &&
                          usuario?.rol !== "DOMICILIARIO" && (
                            <>
                              <label className="block">
                                Asignar domiciliario
                                <select
                                  className="ml-2 rounded bg-gray-800 p-2"
                                  value={asignados[p.id] || 0}
                                  onChange={(e) =>
                                    setAsignados({
                                      ...asignados,
                                      [p.id]: Number(e.target.value),
                                    })
                                  }
                                >
                                  <option value={0}>Seleccionar</option>
                                  {repartidores.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.nombre}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                disabled={!asignados[p.id] || !!busy}
                                className="rounded-lg bg-blue-700 px-4 py-3 disabled:opacity-40"
                                onClick={() => actuar(p.id, "EN_CAMINO")}
                              >
                                Despachar domicilio
                              </button>
                            </>
                          )}
                        {p.estado === "EN_CAMINO" && (
                          <button
                            className="rounded-lg bg-teal-700 px-4 py-3"
                            onClick={() => actuar(p.id, "ENTREGADO")}
                          >
                            Confirmar entrega
                          </button>
                        )}
                        {busy === p.id && <p>Procesando…</p>}
                      </fieldset>
                    </article>
                  ))}
              </div>
              {!pedidos.length && (
                <p className="mt-12 text-gray-400">
                  Aún no hay solicitudes web para mostrar.
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
