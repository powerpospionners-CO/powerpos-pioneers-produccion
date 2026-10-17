'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';

type Materia = { id: number; nombre: string; stock: string };
type Producto = { id: number; nombre: string; controlaStock: boolean; ventaGranel?: boolean; esCombo?: boolean; stockActual: number };
type Linea = { productoId: string; gramos: string; unidades: string };
type Pendiente = { ruta: string; datos: Record<string, unknown> };
type Registro = { id: number; accion: string; creadoEn: string; usuario?: { nombre: string }; detalle: { materia?: string; gramos?: number; totalGramos?: number; mermaGramos?: number; stockNuevo?: number; observacion?: string; productos?: { nombre: string; gramos: number; unidades: number }[] } };
const input = 'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white';
const boton = 'rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-40';
const numero = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 3 });
const lineaVacia = (): Linea => ({ productoId: '', gramos: '', unidades: '' });

export default function EmpaquesPage() {
  const usuario = useAuthStore(s => s.usuario);
  const permitido = !!usuario && ['ADMIN_EMPRESA', 'GERENTE'].includes(usuario.rol);
  const storageKey = usuario ? `powerpos:bodega:${usuario.empresaId}:${usuario.sucursalId}:${usuario.id}` : '';
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [historial, setHistorial] = useState<Registro[]>([]);
  const [nuevo, setNuevo] = useState({ nombre: '', kg: '' });
  const [movimiento, setMovimiento] = useState({ ingredienteId: '', tipo: 'ENTRADA', kg: '', observacion: '' });
  const [materiaId, setMateriaId] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [merma, setMerma] = useState('0');
  const [observacion, setObservacion] = useState('');
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [lista, setLista] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const enCurso = useRef(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const cargar = useCallback(async () => {
    const [bodega, catalogo] = await Promise.all([api.get('/inventario/empaques'), api.get('/productos')]);
    setMaterias(bodega.data.materias); setHistorial(bodega.data.historial);
    setProductos(catalogo.data.filter((p: Producto) => p.controlaStock && !p.ventaGranel && !p.esCombo));
  }, []);
  useEffect(() => {
    if (!permitido || !storageKey) return;
    setLista(false);
    try {
      const guardada = localStorage.getItem(storageKey);
      const valor = guardada ? JSON.parse(guardada) : null;
      if (valor && (!['/inventario/empaques', '/inventario/empaques/materias', '/inventario/empaques/movimientos'].includes(valor.ruta) || !valor.datos?.clave)) throw Error();
      setPendiente(valor); setLista(true);
    } catch { setError('No se pudo leer el respaldo de operaciones de este equipo. No registres el mismo empaque desde otra pestaña.'); }
    void cargar().catch(() => setError('No se pudo cargar la bodega. Reintenta con conexión.'));
  }, [permitido, storageKey, cargar]);

  const enviar = async (operacion: Pendiente) => {
    if (enCurso.current || !lista) return;
    enCurso.current = true; setOcupado(true); setError(''); setAviso('');
    let confirmada = false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(operacion));
      setPendiente(operacion);
      await api.post(operacion.ruta, operacion.datos);
      confirmada = true;
      localStorage.removeItem(storageKey); setPendiente(null);
      setNuevo({ nombre: '', kg: '' }); setMovimiento({ ingredienteId: '', tipo: 'ENTRADA', kg: '', observacion: '' });
      setLineas([lineaVacia()]); setMerma('0'); setObservacion('');
      setAviso('Operación registrada. El inventario y el historial se actualizaron.');
      await cargar().catch(() => setError('La operación quedó registrada, pero no se pudo refrescar la lista. No vuelvas a registrarla.'));
    } catch (e: unknown) {
      const respuesta = (e as { response?: { status?: number; data?: { message?: string | string[] } } }).response;
      if (!confirmada && [400, 403, 404].includes(respuesta?.status || 0)) {
        localStorage.removeItem(storageKey); setPendiente(null);
      }
      const mensaje = respuesta?.data?.message;
      setError(confirmada ? 'La operación fue confirmada. Reintenta la operación pendiente para recuperar la confirmación sin duplicarla.' : Array.isArray(mensaje) ? mensaje.join('. ') : mensaje || 'No se recibió confirmación. Usa Reintentar operación pendiente; no la registres otra vez.');
    } finally { enCurso.current = false; setOcupado(false); }
  };
  const registrar = (ruta: string, datos: Record<string, unknown>) => {
    if (pendiente || !permitido || !lista) return;
    void enviar({ ruta, datos: { ...datos, clave: crypto.randomUUID() } });
  };
  const gramosPorKg = (valor: string) => Number((Number(valor) * 1000).toFixed(3));
  const cambiar = (index: number, campo: keyof Linea, valor: string) => setLineas(actual => actual.map((l, i) => i === index ? { ...l, [campo]: valor } : l));
  const neto = lineas.reduce((s,l) => s + (Number(l.gramos) || 0) * (Number(l.unidades) || 0), 0);
  const consumo = neto + (Number(merma) || 0);
  const seleccionada = materias.find(m => m.id === Number(materiaId));
  const completo = lineas.every(l => l.productoId && Number(l.gramos) > 0 && Number.isInteger(Number(l.unidades)) && Number(l.unidades) > 0);
  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar />
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <Link href="/inventario" className="text-orange-400">← Volver a inventario</Link>
      <div><h1 className="text-3xl font-bold">Bodega y empaque</h1><p className="mt-2 text-gray-400">Controla la materia prima sin empacar y conviértela en productos listos para vender.</p></div>
      {!permitido ? <p>Este apartado requiere administrador o gerente.</p> : <>
        <p className="rounded-xl border border-gray-700 p-4 text-sm text-gray-300">Los paquetes que ya tienes registrados se conservan. Ingresa únicamente el saldo físico actual sin empacar. Para compras por bulto, registra su peso real en kg; no se presupone cuánto pesa cada bulto. Los costos de venta de los productos no se modifican.</p>
        {error && <p role="alert" className="rounded-lg border border-red-500 p-3 text-red-300">{error}</p>}
        {aviso && <p role="status" className="rounded-lg border border-green-500 p-3 text-green-300">{aviso}</p>}
        {pendiente && <div className="rounded-xl border border-yellow-500 p-4"><p className="mb-3">Hay una operación pendiente de confirmación. El reintento recupera la misma operación y evita duplicarla.</p><button className={boton} disabled={ocupado} onClick={() => void enviar(pendiente)}>Reintentar operación pendiente</button></div>}
        <fieldset disabled={ocupado || !!pendiente || !lista} className="space-y-6 disabled:opacity-60">
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4"><h2 className="mb-3 text-xl font-bold">Materia prima en bodega</h2>
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="text-gray-400"><th className="py-2">Materia prima</th><th>Disponible en kg</th><th>Disponible en gramos</th></tr></thead><tbody>{materias.map(m => <tr key={m.id} className="border-t border-gray-800"><td className="py-3">{m.nombre}</td><td>{numero(Number(m.stock)/1000)} kg</td><td>{numero(Number(m.stock))} g</td></tr>)}</tbody></table></div>
            {!materias.length && <p className="py-4 text-gray-400">Aún no hay materias primas. Registra el primer saldo físico a continuación.</p>}
            <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={e => { e.preventDefault(); registrar('/inventario/empaques/materias', { nombre: nuevo.nombre, gramos: gramosPorKg(nuevo.kg || '0') }); }}>
              <label>Nombre de materia prima<input className={input} required maxLength={150} placeholder="Sal marina a granel" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
              <label>Saldo actual sin empacar (kg)<input className={input} type="number" min="0" step="0.001" required value={nuevo.kg} onChange={e => setNuevo({ ...nuevo, kg: e.target.value })} /></label>
              <button className={`${boton} self-end`}>Registrar materia prima</button>
            </form>
          </section>
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4"><h2 className="mb-3 text-xl font-bold">Recibir compra o registrar conteo</h2>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); registrar('/inventario/empaques/movimientos', { ...movimiento, ingredienteId: Number(movimiento.ingredienteId), gramos: gramosPorKg(movimiento.kg) }); }}>
              <label>Materia prima<select className={input} required value={movimiento.ingredienteId} onChange={e => setMovimiento({ ...movimiento, ingredienteId: e.target.value })}><option value="">Selecciona</option>{materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
              <label>Movimiento<select className={input} value={movimiento.tipo} onChange={e => setMovimiento({ ...movimiento, tipo: e.target.value })}><option value="ENTRADA">Compra recibida: sumar al saldo</option><option value="CONTEO">Conteo físico: reemplazar saldo sin empacar</option></select></label>
              <label>{movimiento.tipo === 'ENTRADA' ? 'Peso total recibido (kg)' : 'Saldo físico contado (kg)'}<input className={input} required type="number" min={movimiento.tipo === 'ENTRADA' ? '0.001' : '0'} step="0.001" value={movimiento.kg} onChange={e => setMovimiento({ ...movimiento, kg: e.target.value })} /></label>
              <label>Referencia de compra o motivo<input className={input} required maxLength={500} value={movimiento.observacion} onChange={e => setMovimiento({ ...movimiento, observacion: e.target.value })} /></label>
              <button className={boton}>Guardar movimiento de bodega</button>
            </form>
          </section>
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4"><h2 className="mb-3 text-xl font-bold">Registrar empaque realizado</h2>
            <p className="mb-4 text-sm text-gray-400">Cada fila es un producto existente, por ejemplo Sal marina 30 g. Indica los gramos que lleva cada paquete y cuántos terminaste. No registres aquí paquetes que ya estaban incluidos en el inventario.</p>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); registrar('/inventario/empaques', { ingredienteId: Number(materiaId), items: lineas.map(l => ({ productoId: Number(l.productoId), gramos: Number(l.gramos), unidades: Number(l.unidades) })), mermaGramos: Number(merma || 0), observacion }); }}>
              <label className="block">Materia prima utilizada<select className={input} required value={materiaId} onChange={e => setMateriaId(e.target.value)}><option value="">Selecciona</option>{materias.map(m => <option key={m.id} value={m.id}>{m.nombre} · {numero(Number(m.stock)/1000)} kg disponibles</option>)}</select></label>
              {lineas.map((l,i) => <div key={i} className="grid gap-3 rounded-lg border border-gray-700 p-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                <label>Producto empacado<select className={input} required value={l.productoId} onChange={e => cambiar(i,'productoId',e.target.value)}><option value="">Selecciona producto existente</option>{productos.filter(p => String(p.id) === l.productoId || !lineas.some(o => o.productoId === String(p.id))).map(p => <option key={p.id} value={p.id}>{p.nombre} · stock {p.stockActual}</option>)}</select></label>
                <label>Gramos por paquete<input className={input} type="number" required min="0.001" max="9999999" step="0.001" value={l.gramos} onChange={e => cambiar(i,'gramos',e.target.value)} /></label>
                <label>Paquetes terminados<input className={input} type="number" required min="1" max="999999" step="1" value={l.unidades} onChange={e => cambiar(i,'unidades',e.target.value)} /></label>
                <button type="button" disabled={lineas.length === 1} onClick={() => setLineas(actual => actual.filter((_,n) => n !== i))} className="self-end p-2 text-red-300 disabled:opacity-30">Quitar</button>
              </div>)}
              <button type="button" disabled={lineas.length >= 50} className="text-orange-400" onClick={() => setLineas(actual => [...actual,lineaVacia()])}>+ Agregar otro tamaño o producto</button>
              {!productos.length && <p>Primero crea los productos en Productos y activa su control de existencias por unidad.</p>}
              <div className="grid gap-3 md:grid-cols-2"><label>Merma del proceso (gramos)<input className={input} type="number" min="0" step="0.001" value={merma} onChange={e => setMerma(e.target.value)} /></label><label>Observación o referencia del lote<input className={input} maxLength={500} value={observacion} onChange={e => setObservacion(e.target.value)} /></label></div>
              <p className="rounded-lg bg-gray-800 p-3">Contenido empacado: <strong>{numero(neto)} g</strong> · Merma: <strong>{numero(Number(merma)||0)} g</strong> · Total a descontar de bodega: <strong>{numero(consumo)} g</strong>{seleccionada && <> · Saldo esperado: <strong>{numero((Number(seleccionada.stock)-consumo)/1000)} kg</strong></>}</p>
              <button className={boton} disabled={!completo || !seleccionada || consumo > Number(seleccionada.stock)}>Confirmar empaque y actualizar inventario</button>
            </form>
          </section>
        </fieldset>
        <section className="rounded-xl border border-gray-800 p-4"><h2 className="text-xl font-bold">Historial de bodega y empaque</h2><p className="mb-3 text-sm text-gray-400">Últimos 100 registros de esta sede. Cada operación conserva su responsable y las cantidades.</p>
          {historial.map(h => <article key={h.id} className="border-t border-gray-800 py-3"><p className="font-semibold">{h.detalle.materia} · {h.accion === 'REGISTRAR_EMPAQUE' ? 'Empaque' : h.accion === 'ENTRADA_MATERIA_PRIMA' ? 'Compra recibida' : h.accion === 'CONTEO_MATERIA_PRIMA' ? 'Conteo físico' : 'Saldo inicial'}</p><p className="text-sm text-gray-400">{new Date(h.creadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · {h.usuario?.nombre || 'Usuario'} · Saldo: {numero((h.detalle.stockNuevo || 0)/1000)} kg</p>{h.detalle.productos?.map((p,i) => <p key={i} className="text-sm">{p.unidades} × {p.nombre} · {numero(p.gramos)} g por paquete</p>)}{h.accion === 'REGISTRAR_EMPAQUE' && <p className="text-sm">Consumido: {numero(h.detalle.totalGramos || 0)} g · Merma: {numero(h.detalle.mermaGramos || 0)} g</p>}{h.detalle.observacion && <p className="text-sm text-gray-400">{h.detalle.observacion}</p>}</article>)}
          {!historial.length && <p className="text-gray-400">No se han registrado movimientos.</p>}
        </section>
      </>}
    </div>
  </main></AuthGuard>;
}
