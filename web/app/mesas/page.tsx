'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import ModalCobro, { PagoConfirmado } from '@/components/ModalCobro';
import { useNotificar } from '@/components/Notificaciones';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { generarClaveVenta } from '@/lib/colaOfflineVentas';
import { prepararComandas } from '@/lib/comandas';
import { useAuthStore } from '@/store/authStore';
import { agruparPorZona, colorMesa, porPersona, type Cuenta, type Mesa } from '@/lib/mesas';

type Producto = { id: number; nombre: string; precio: number | string; categoria?: { id: number; nombre: string } | null };
const boton = 'rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:border-gray-400 disabled:opacity-40';
const primario = 'rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40';
const ESTADO_RONDA: Record<string, string> = { PENDIENTE: 'En espera', EN_PREPARACION: 'Preparando', LISTA: 'Lista para servir', SERVIDA: 'Servida' };
const error = (e: any, t: string) => e?.response?.data?.message || e?.message || t;

export default function MesasPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <Mesas />
      </div>
    </AuthGuard>
  );
}

function Mesas() {
  const { aviso, confirmar, solicitar } = useNotificar();
  const usuario = useAuthStore((s) => s.usuario);
  const [mesas, setMesas] = useState<Mesa[] | null>(null);
  const [puedeCobrar, setPuedeCobrar] = useState(false);
  const [supervisor, setSupervisor] = useState(false);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [nota, setNota] = useState('');
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cobro, setCobro] = useState<{ lineas: string[]; total: number; clave: string } | null>(null);
  const [propinas, setPropinas] = useState<{ habilitado: boolean; porcentaje: number } | null>(null);
  const [modoPreparacion, setModoPreparacion] = useState('KDS');
  const [editandoPlano, setEditandoPlano] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/mesas');
      setMesas(data.mesas);
      setPuedeCobrar(data.puedeCobrar);
      setSupervisor(data.supervisor);
    } catch (e) {
      aviso(error(e, 'No se pudieron cargar las mesas'), 'error');
      setMesas((m) => m ?? []);
    }
  }, [aviso]);

  useEffect(() => {
    void cargar();
    const t = setInterval(cargar, 8000);
    api.get('/productos').then(({ data }) => setProductos(data)).catch(() => setProductos([]));
    api.get('/propinas/config').then(({ data }) => setPropinas(data)).catch(() => setPropinas(null));
    api.get('/empresa').then(({ data }) => setModoPreparacion(data.modoPreparacion || 'KDS')).catch(() => undefined);
    return () => clearInterval(t);
  }, [cargar]);

  // Mantiene la cuenta abierta en pantalla al día con lo que cambian otros dispositivos.
  useEffect(() => {
    if (!cuenta) return;
    const t = setInterval(() => api.get(`/mesas/cuentas/${cuenta.id}`).then(({ data }) => setCuenta((c) => (c && c.id === data.id && data.version !== c.version ? data : c))).catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, [cuenta]);

  const accion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      aviso(error(e, 'No se pudo completar la acción'), 'error');
      if (cuenta) api.get(`/mesas/cuentas/${cuenta.id}`).then(({ data }) => setCuenta(data)).catch(() => setCuenta(null));
    } finally {
      setOcupado(false);
      void cargar();
    }
  };

  const abrirMesa = (m: Mesa) => accion(async () => {
    setSeleccion([]);
    if (m.cuenta) { setCuenta((await api.get(`/mesas/cuentas/${m.cuenta.id}`)).data); return; }
    const personas = await solicitar(`¿Cuántas personas hay en ${m.nombre}?`, '2', { tipo: 'number' });
    if (personas === null) return;
    setCuenta((await api.post(`/mesas/${m.numero}/abrir`, { personas: Number(personas) || 1 })).data);
  });

  const agregar = (p: Producto) => cuenta && accion(async () => {
    setCuenta((await api.post(`/mesas/cuentas/${cuenta.id}/items`, { items: [{ productoId: p.id, cantidad: 1, observacion: nota }] })).data);
    setNota('');
  });

  const enviar = () => cuenta && accion(async () => {
    const { data } = await api.post(`/mesas/cuentas/${cuenta.id}/enviar`);
    setCuenta(data.cuenta);
    if (modoPreparacion !== 'COMANDAS') { aviso('Enviado a cocina.', 'exito'); return; }
    let fallas = 0;
    for (const comanda of prepararComandas(data.comanda, usuario?.empresaId, productos)) {
      try { if (!(await api.post('/impresion/comanda', comanda)).data.impreso) fallas++; } catch { fallas++; }
    }
    aviso(fallas ? 'Enviado a cocina, pero no se imprimió la comanda. La cocina lo ve en su pantalla.' : 'Enviado a cocina.', fallas ? 'error' : 'exito');
  });

  const quitar = (lineaId: string, enviada: boolean) => cuenta && accion(async () => {
    let motivo: string | null = '';
    if (enviada) {
      motivo = await solicitar('Este producto ya se envió a cocina. Escribe el motivo de la anulación.');
      if (!motivo) return;
    }
    setCuenta((await api.delete(`/mesas/cuentas/${cuenta.id}/items/${lineaId}`, { data: { motivo } })).data);
  });

  const trasladar = () => cuenta && accion(async () => {
    const destino = await solicitar('¿A qué mesa la pasas? Si está ocupada, las cuentas se unen.', '', { tipo: 'number' });
    if (!destino) return;
    setCuenta((await api.post(`/mesas/cuentas/${cuenta.id}/trasladar`, { mesa: Number(destino) })).data);
  });

  const mover = () => cuenta && seleccion.length && accion(async () => {
    const destino = await solicitar(`¿A qué mesa pasas los ${seleccion.length} productos elegidos?`, '', { tipo: 'number' });
    if (!destino) return;
    await api.post(`/mesas/cuentas/${cuenta.id}/mover`, { lineas: seleccion, mesa: Number(destino) });
    setSeleccion([]);
    setCuenta((await api.get(`/mesas/cuentas/${cuenta.id}`)).data);
  });

  const servir = (n: number) => cuenta && accion(async () => {
    setCuenta((await api.patch(`/mesas/cuentas/${cuenta.id}/rondas/${n}`, { estado: 'SERVIDA' })).data);
  });

  const anular = () => cuenta && accion(async () => {
    const motivo = await solicitar('Motivo para anular toda la cuenta');
    if (!motivo) return;
    if (!(await confirmar('Se anularán los productos sin cobrar de esta mesa.', { titulo: 'Anular cuenta', textoConfirmar: 'Anular', peligroso: true }))) return;
    await api.post(`/mesas/cuentas/${cuenta.id}/anular`, { motivo });
    setCuenta(null);
  });

  const pendientes = useMemo(() => (cuenta?.lineas || []).filter((l) => !l.anulada && l.pagada === null), [cuenta]);
  const abrirCobro = () => {
    if (!cuenta) return;
    const ids = seleccion.length ? seleccion : pendientes.map((l) => l.id);
    const total = pendientes.filter((l) => ids.includes(l.id)).reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
    setCobro({ lineas: ids, total, clave: generarClaveVenta() });
  };
  const cobrar = async (pago: PagoConfirmado) => {
    if (!cuenta || !cobro) return;
    setOcupado(true);
    try {
      const { data } = await api.post(`/mesas/cuentas/${cuenta.id}/cobrar`, {
        claveIdempotencia: cobro.clave,
        lineas: cobro.lineas,
        metodoPago: pago.metodoPago,
        pagos: pago.pagos,
        cambio: pago.cambio,
        ...(pago.propina ? { propina: pago.propina } : {}),
      });
      setCobro(null);
      setSeleccion([]);
      setCuenta(data.cuenta.estado === 'ABIERTA' ? data.cuenta : null);
      aviso(`Cobrado: ${data.pedido.numero}`, 'exito');
      if (pago.metodoPago === 'EFECTIVO' || pago.pagos.some((p) => p.metodoPago === 'EFECTIVO')) void api.post('/impresion/abrir-cajon').catch(() => undefined);
      void api.get(`/pedidos/${data.pedido.id}`).then(({ data: pedido }) => api.post('/impresion/ticket', pedido)).catch(() => undefined);
      if (pago.cambio > 0) aviso(`Cambio: ${moneda(pago.cambio)}`, 'info');
    } catch (e: any) {
      // Un error del servidor puede ocultar un cobro hecho: se reintenta con la misma clave.
      if (e?.response?.status >= 400 && e?.response?.status < 500) setCobro((c) => (c ? { ...c, clave: generarClaveVenta() } : c));
      aviso(error(e, 'No se pudo cobrar. Reintenta con los mismos datos.'), 'error');
    } finally {
      setOcupado(false);
      void cargar();
    }
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (q ? productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.categoria?.nombre.toLowerCase().includes(q)) : productos).slice(0, 60);
  }, [productos, busqueda]);

  if (!mesas) return <p className="p-6 text-gray-400">Cargando mesas…</p>;
  if (editandoPlano) return <EditorPlano mesas={mesas} onListo={() => { setEditandoPlano(false); void cargar(); }} />;

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_480px]">
      <section aria-label="Plano de mesas" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Mesas</h1>
          {supervisor && <button type="button" className={boton} onClick={() => setEditandoPlano(true)}>Configurar mesas</button>}
        </div>
        {!mesas.length && <p className="rounded-xl border border-gray-800 p-6 text-gray-400">{supervisor ? 'Todavía no hay mesas. Usa "Configurar mesas" para crearlas.' : 'El administrador todavía no ha configurado las mesas.'}</p>}
        {agruparPorZona(mesas).map(([zona, lista]) => (
          <div key={zona}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">{zona}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {lista.map((m) => (
                <button key={m.numero} type="button" disabled={ocupado} onClick={() => void abrirMesa(m)} aria-pressed={cuenta?.mesa === m.numero}
                  className={`min-h-24 rounded-xl border p-2 text-left ${colorMesa(m)} ${cuenta?.mesa === m.numero ? 'ring-2 ring-white' : ''}`}>
                  <span className="block font-bold">{m.nombre}</span>
                  {m.cuenta ? (
                    <span className="mt-1 block text-xs">
                      {moneda(m.cuenta.total)} · {m.cuenta.personas} p.
                      {m.cuenta.listas > 0 && <span className="mt-1 block font-bold text-green-300">🍽 {m.cuenta.listas} lista(s)</span>}
                      {m.cuenta.sinEnviar > 0 && <span className="mt-1 block text-amber-200">{m.cuenta.sinEnviar} sin enviar</span>}
                    </span>
                  ) : <span className="mt-1 block text-xs text-gray-400">Libre · {m.capacidad} p.</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {cuenta && (
        <section aria-label={`Cuenta de la mesa ${cuenta.mesa}`} className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">Mesa {cuenta.mesa}</h2>
              <p className="text-sm text-gray-400">{cuenta.personas} personas · {cuenta.meseroNombre}</p>
            </div>
            <button type="button" className="text-gray-400 hover:text-white" onClick={() => { setCuenta(null); setSeleccion([]); }} aria-label="Cerrar cuenta">✕</button>
          </div>

          <div className="space-y-2">
            <input aria-label="Buscar producto" placeholder="Buscar producto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2" />
            <input aria-label="Nota para cocina" placeholder="Nota para el próximo producto (ej. sin cebolla)" value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm" />
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">
              {filtrados.map((p) => (
                <button key={p.id} type="button" disabled={ocupado} onClick={() => void agregar(p)} className="rounded-lg bg-gray-800 px-2 py-2 text-left text-sm hover:bg-gray-700 disabled:opacity-40">
                  {p.nombre}<span className="block text-xs text-gray-400">{moneda(Number(p.precio))}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-y divide-gray-800 text-sm">
            {cuenta.lineas.filter((l) => !l.anulada).map((l) => {
              const ronda = cuenta.rondas.find((r) => r.n === l.ronda);
              return (
                <li key={l.id} className={`flex items-center gap-2 py-2 ${l.pagada !== null ? 'opacity-50' : ''}`}>
                  {l.pagada === null && <input type="checkbox" aria-label={`Elegir ${l.nombre}`} checked={seleccion.includes(l.id)} onChange={(e) => setSeleccion((s) => (e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id)))} />}
                  <span className="flex-1">
                    {l.cantidad} × {l.nombre}
                    {l.observacion && <span className="block text-xs text-amber-200">{l.observacion}</span>}
                    <span className="block text-xs text-gray-400">{l.pagada !== null ? 'Cobrado' : ronda ? `Ronda ${ronda.n} · ${ESTADO_RONDA[ronda.estado]}` : 'Sin enviar'}</span>
                  </span>
                  <span className="tabular-nums">{moneda(l.cantidad * l.precioUnitario)}</span>
                  {l.pagada === null && (l.ronda === null || supervisor) && (
                    <button type="button" disabled={ocupado} onClick={() => void quitar(l.id, l.ronda !== null)} className="text-red-300 hover:text-red-200" aria-label={`Quitar ${l.nombre}`}>✕</button>
                  )}
                </li>
              );
            })}
          </ul>

          {cuenta.rondas.filter((r) => r.estado === 'LISTA').map((r) => (
            <button key={r.n} type="button" disabled={ocupado} onClick={() => void servir(r.n)} className="w-full rounded-lg bg-green-700 px-3 py-2 text-sm font-bold">Ronda {r.n} lista · marcar como servida</button>
          ))}

          <div className="rounded-lg bg-gray-950 p-3">
            <p className="flex justify-between font-bold"><span>Por cobrar</span><span className="tabular-nums">{moneda(cuenta.total)}</span></p>
            {cuenta.cobrado > 0 && <p className="flex justify-between text-sm text-gray-400"><span>Ya cobrado</span><span>{moneda(cuenta.cobrado)}</span></p>}
            {cuenta.personas > 1 && cuenta.total > 0 && <p className="text-sm text-gray-400">Partes iguales: {moneda(porPersona(cuenta.total, cuenta.personas))} por persona</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primario} disabled={ocupado || !cuenta.sinEnviar} onClick={() => void enviar()}>Enviar a cocina{cuenta.sinEnviar ? ` (${cuenta.sinEnviar})` : ''}</button>
            <button type="button" className={boton} disabled={ocupado} onClick={() => void trasladar()}>Trasladar o unir</button>
            <button type="button" className={boton} disabled={ocupado || !seleccion.length} onClick={() => void mover()}>Pasar elegidos a otra mesa</button>
            {puedeCobrar && <button type="button" className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={ocupado || !pendientes.length} onClick={abrirCobro}>{seleccion.length ? `Cobrar ${seleccion.length} elegidos` : 'Cobrar todo'}</button>}
            {supervisor && <button type="button" className="rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-300 disabled:opacity-40" disabled={ocupado} onClick={() => void anular()}>Anular cuenta</button>}
          </div>
          {!puedeCobrar && <p className="text-xs text-gray-400">Cuando el cliente pida la cuenta, avisa en caja para cobrarla.</p>}
        </section>
      )}

      {cobro && (
        <ModalCobro titulo={`Cobrar mesa ${cuenta?.mesa}`} total={cobro.total} procesando={ocupado} onConfirmar={(p) => void cobrar(p)} onCancelar={() => setCobro(null)}
          propina={propinas?.habilitado ? { porcentaje: propinas.porcentaje } : null} />
      )}
    </main>
  );
}

function EditorPlano({ mesas, onListo }: { mesas: Mesa[]; onListo: () => void }) {
  const { aviso } = useNotificar();
  const [filas, setFilas] = useState(mesas.map(({ numero, nombre, zona, capacidad }) => ({ numero, nombre, zona, capacidad })));
  const [rango, setRango] = useState({ desde: 1, hasta: 10, zona: 'Salón' });
  const [guardando, setGuardando] = useState(false);
  const agregarRango = () => {
    const nuevas = [];
    for (let n = rango.desde; n <= Math.min(rango.hasta, rango.desde + 199); n++)
      if (!filas.some((f) => f.numero === n)) nuevas.push({ numero: n, nombre: `Mesa ${n}`, zona: rango.zona || 'Salón', capacidad: 4 });
    setFilas([...filas, ...nuevas].sort((a, b) => a.numero - b.numero));
  };
  const guardar = async () => {
    setGuardando(true);
    try {
      await api.put('/mesas/plano', { mesas: filas });
      aviso('Mesas guardadas.', 'exito');
      onListo();
    } catch (e) {
      aviso(error(e, 'No se pudieron guardar las mesas'), 'error');
    } finally { setGuardando(false); }
  };
  const cambiar = (i: number, k: string, v: string | number) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Configurar mesas</h1>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-800 p-3 text-sm">
        <label>Desde la mesa<input type="number" min={1} value={rango.desde} onChange={(e) => setRango({ ...rango, desde: Number(e.target.value) })} className="mt-1 block w-24 rounded border border-gray-700 bg-gray-800 p-2" /></label>
        <label>Hasta<input type="number" min={1} value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: Number(e.target.value) })} className="mt-1 block w-24 rounded border border-gray-700 bg-gray-800 p-2" /></label>
        <label>Zona<input value={rango.zona} maxLength={40} onChange={(e) => setRango({ ...rango, zona: e.target.value })} className="mt-1 block w-36 rounded border border-gray-700 bg-gray-800 p-2" /></label>
        <button type="button" className={boton} onClick={agregarRango}>Agregar</button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-gray-400"><tr><th>N.º</th><th>Nombre</th><th>Zona</th><th>Puestos</th><th /></tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.numero} className="border-t border-gray-800">
              <td className="py-1">{f.numero}</td>
              <td><input aria-label={`Nombre de la mesa ${f.numero}`} value={f.nombre} maxLength={40} onChange={(e) => cambiar(i, 'nombre', e.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 p-1" /></td>
              <td><input aria-label={`Zona de la mesa ${f.numero}`} value={f.zona} maxLength={40} onChange={(e) => cambiar(i, 'zona', e.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 p-1" /></td>
              <td><input aria-label={`Puestos de la mesa ${f.numero}`} type="number" min={1} max={50} value={f.capacidad} onChange={(e) => cambiar(i, 'capacidad', Number(e.target.value))} className="w-16 rounded border border-gray-700 bg-gray-800 p-1" /></td>
              <td><button type="button" className="text-red-300" onClick={() => setFilas(filas.filter((_, j) => j !== i))} aria-label={`Quitar la mesa ${f.numero}`}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <button type="button" className={primario} disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar mesas'}</button>
        <button type="button" className={boton} onClick={onListo}>Cancelar</button>
      </div>
    </main>
  );
}
