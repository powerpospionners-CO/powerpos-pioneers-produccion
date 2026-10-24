'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';

type Codigo = { id: number; nombre?: string; sabor?: string; codigoBarras: string | null };
type Producto = Codigo & { nombre: string; presentaciones: Codigo[]; codigosBarras: Codigo[] };
type Seleccion = Codigo & { nombre: string; tipo: 'PRODUCTO' | 'PRESENTACION' | 'SABOR'; destinoId?: number };
export default function CodigosBarrasPage() {
  const [token, setToken] = useState('');
  const [venceEn, setVenceEn] = useState(0);
  const [codigo, setCodigo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [sinCodigo, setSinCodigo] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [siguiente, setSiguiente] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [barra, setBarra] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const bloquear = useCallback(() => { setToken(''); setProductos([]); setSeleccion(null); setBarra(''); setCodigo(''); }, []);
  const fallo = useCallback((e: any) => { if ([401,403].includes(e?.response?.status)) bloquear(); setMensaje(e?.response?.data?.message || 'No se pudo completar la operación'); }, [bloquear]);
  const cargar = useCallback(async (despues?: number, signal?: AbortSignal) => {
    const { data } = await api.get('/acceso-barras/productos', { headers: { 'X-Acceso-Barras': token }, params: { buscar, sinCodigo, despues }, signal });
    setProductos(data.productos); setSiguiente(data.siguiente);
  }, [token, buscar, sinCodigo]);
  useEffect(() => {
    if (!token) return;
    const controlador = new AbortController();
    const timer = setTimeout(() => { cargar(undefined, controlador.signal).catch(e => { if (!controlador.signal.aborted) fallo(e); }); }, 250);
    return () => { clearTimeout(timer); controlador.abort(); };
  }, [token, cargar, fallo]);
  useEffect(() => { if (!token) return; const timer = setTimeout(bloquear, Math.max(0, venceEn - Date.now())); return () => clearTimeout(timer); }, [token, venceEn, bloquear]);
  useEffect(() => { if (seleccion) input.current?.focus(); }, [seleccion]);
  const desbloquear = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true); setMensaje('');
    try { const { data } = await api.post('/acceso-barras/desbloquear', { codigo }); setCodigo(''); setVenceEn(data.venceEn); setToken(data.token); }
    catch (e) { fallo(e); } finally { setOcupado(false); }
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!seleccion) return;
    setOcupado(true); setMensaje('');
    try {
      await api.patch(`/acceso-barras/productos/${seleccion.id}`, { codigoBarras: barra.trim(), anterior: seleccion.codigoBarras, tipo: seleccion.tipo, destinoId: seleccion.destinoId }, { headers: { 'X-Acceso-Barras': token } });
      setMensaje(`Código guardado para ${seleccion.nombre}.`); setSeleccion(null); setBarra(''); await cargar();
    } catch (e) { fallo(e); } finally { setOcupado(false); }
  };
  const filaCodigo = (p: Producto, tipo: Seleccion['tipo'], item: Codigo) => {
    const etiqueta = tipo === 'PRODUCTO' ? 'Código del producto' : `${tipo === 'PRESENTACION' ? 'Presentación' : 'Sabor'}: ${item.nombre || item.sabor}`;
    return <div key={`${tipo}-${item.id}`} className="flex items-center justify-between gap-3 border-t border-gray-800 py-3">
      <div><p className="text-sm">{etiqueta}</p><p className={`text-sm ${item.codigoBarras ? 'text-gray-400' : 'text-amber-400'}`}>{item.codigoBarras || 'Código pendiente'}</p></div>
      <button disabled={ocupado} onClick={() => { setSeleccion({ id: p.id, nombre: `${p.nombre} · ${etiqueta}`, codigoBarras: item.codigoBarras, tipo, ...(tipo !== 'PRODUCTO' ? { destinoId: item.id } : {}) }); setBarra(''); setMensaje(''); }} className="rounded border border-gray-700 px-3 py-2">{item.codigoBarras ? 'Cambiar código' : 'Ingresar código'}</button>
    </div>;
  };
  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar /><div className="mx-auto max-w-4xl p-4">
    <h1 className="mb-2 text-2xl font-bold">Productos · Códigos de barras</h1>
    <p className="mb-4 text-gray-400">Selecciona el producto, sabor o presentación y escanea su código. Este acceso solo permite cambiar códigos de barras de elementos ya creados.</p>
    {mensaje && <p role="status" className="mb-4 rounded border border-gray-700 p-3">{mensaje}</p>}
    {!token ? <form onSubmit={desbloquear} className="max-w-sm space-y-4 rounded-xl border border-gray-800 p-5">
      <label className="block">Código de acceso<input aria-label="Código de acceso" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={codigo} onChange={e => setCodigo(e.target.value)} className="mt-2 w-full rounded bg-gray-800 p-3" /></label>
      <button disabled={ocupado || codigo.length !== 8} className="rounded bg-orange-600 px-4 py-3 disabled:opacity-50">Entrar</button>
      <p className="text-sm text-gray-400">Solicita tu código al administrador. El acceso se bloquea de nuevo al salir o después de 30 minutos.</p>
    </form> : <>
      <button onClick={bloquear} className="mb-4 rounded border border-gray-700 px-4 py-2">Bloquear acceso</button>
      <label className="mb-3 block">Buscar producto<input value={buscar} onChange={e => setBuscar(e.target.value)} className="mt-1 w-full rounded bg-gray-800 p-3" /></label>
      <label className="mb-4 block"><input type="checkbox" checked={sinCodigo} onChange={e => setSinCodigo(e.target.checked)} /> Solo productos con códigos pendientes</label>
      {seleccion && <form onSubmit={guardar} className="mb-5 space-y-3 rounded-xl border border-orange-500 p-4">
        <p className="font-bold">{seleccion.nombre}</p><p className="text-sm text-gray-400">Código actual: {seleccion.codigoBarras || 'Sin código'}</p>
        <label className="block">Escanea o escribe el código<input ref={input} aria-label="Código de barras" value={barra} maxLength={80} autoComplete="off" onChange={e => setBarra(e.target.value)} className="mt-1 w-full rounded bg-gray-800 p-3" /></label>
        <button disabled={ocupado || !barra.trim()} className="mr-3 rounded bg-orange-600 px-4 py-2 disabled:opacity-50">Guardar código</button><button type="button" disabled={ocupado} onClick={() => setSeleccion(null)}>Cancelar</button>
      </form>}
      <div className="space-y-4">{productos.map(p => <section key={p.id} className="rounded-xl border border-gray-800 p-4">
        <h2 className="mb-2 font-semibold">{p.nombre}</h2>
        {!p.codigoBarras && (p.presentaciones.length > 0 || p.codigosBarras.length > 0) && <p className="mb-3 text-sm text-gray-400">Se identifica por sus sabores o presentaciones; no se requiere un código general.</p>}
        {(p.codigoBarras || (!p.presentaciones.length && !p.codigosBarras.length)) && filaCodigo(p, 'PRODUCTO', p)}
        {p.presentaciones.map(item => filaCodigo(p, 'PRESENTACION', item))}
        {p.codigosBarras.map(item => filaCodigo(p, 'SABOR', item))}
      </section>)}</div>
      {!productos.length && <p className="mt-4 text-gray-400">No hay productos con este filtro.</p>}
      {siguiente && <button onClick={() => cargar(siguiente).catch(fallo)} className="mt-4 rounded border border-gray-700 p-3">Siguiente página</button>}
    </>}
  </div></main></AuthGuard>;
}
