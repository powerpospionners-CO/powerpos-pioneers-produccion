'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { prepararComandas } from '@/lib/comandas';

type Producto = { id: number; nombre: string; categoria?: { nombre: string }; aceptaAdicionales?: boolean };
const LADOS = [['PLANCHA', 'Plancha'], ['VAPORERA', 'Vaporera'], ['SIN_COMANDA', 'Sin comanda'], ['AUTO', 'Automático']];

export default function ConfiguracionComandas({ productos }: { productos: Producto[] }) {
  const [base, setBase] = useState<Record<string, string>>({});
  const [cambios, setCambios] = useState<Record<string, string>>({});
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [lado, setLado] = useState('PLANCHA');
  const [cargado, setCargado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const cargar = async () => {
    try { const { data } = await api.get('/productos/comandas/configuracion'); setBase(data.asignaciones); setCargado(true); setMensaje(''); }
    catch { setMensaje('No se pudo cargar la distribución. Usa Reintentar antes de editar.'); }
  };
  useEffect(() => { void cargar(); }, []);
  const visibles = productos.filter(p => p.nombre.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase()) && (!categoria || p.categoria?.nombre === categoria));
  const elegido = (p: Producto) => cambios[p.id] ?? base[p.id] ?? 'AUTO';
  const asignar = (ids: number[], destino: string) => setCambios(prev => {
    const nuevo = { ...prev };
    for (const id of ids) { if (destino === (base[id] || 'AUTO')) delete nuevo[id]; else nuevo[id] = destino; }
    return nuevo;
  });
  const guardar = async () => {
    setOcupado(true); setMensaje('');
    try {
      const { data } = await api.patch('/productos/comandas/configuracion', { cambios: Object.entries(cambios).map(([productoId, estacion]) => ({ productoId: Number(productoId), estacion })) });
      setBase(data.asignaciones); setCambios({}); setSeleccion([]); setMensaje('Distribución guardada. Se usará en la próxima impresión del POS.');
    } catch (e: any) { setMensaje(e?.response?.data?.message || 'No se pudo guardar. Conservamos tus cambios para que reintentes.'); }
    finally { setOcupado(false); }
  };
  return <section aria-label="Distribución de comandas" className="mb-6 space-y-4 rounded-xl border border-orange-500/40 bg-gray-900 p-4 text-white">
    <h3 className="text-lg font-bold">Productos por lado: Plancha y Vaporera</h3>
    <p className="text-sm text-gray-300">Asigna un lado por producto o selecciona varios para agruparlos. Las bebidas pueden quedar en «Sin comanda». Los productos en Automático conservan la clasificación sugerida hasta que les asignes un lado.</p>
    {mensaje && <p role="status" className="text-orange-200">{mensaje}</p>}
    {!cargado && <button type="button" onClick={() => void cargar()} className="min-h-12 rounded bg-gray-700 px-4">Reintentar carga</button>}
    <fieldset disabled={!cargado || ocupado} className="space-y-3 disabled:opacity-50">
      <div className="flex flex-wrap gap-2">
        <input aria-label="Buscar producto para comandas" placeholder="Buscar producto" value={busqueda} onChange={e => setBusqueda(e.target.value)} className="min-h-12 rounded-lg border border-gray-700 bg-gray-950 px-3"/>
        <select aria-label="Filtrar categoría de comandas" value={categoria} onChange={e => setCategoria(e.target.value)} className="min-h-12 rounded-lg border border-gray-700 bg-gray-950 px-3"><option value="">Todas las categorías</option>{[...new Set(productos.map(p => p.categoria?.nombre).filter(Boolean))].map(c => <option key={c}>{c}</option>)}</select>
        <button type="button" onClick={() => setSeleccion(prev => [...new Set([...prev, ...visibles.map(p => p.id)])])} className="min-h-12 rounded-lg bg-gray-700 px-3">Seleccionar visibles ({visibles.length})</button>
        <button type="button" onClick={() => setSeleccion([])} className="min-h-12 rounded-lg border border-gray-700 px-3">Quitar selección</button>
      </div>
      <div className="flex flex-wrap items-center gap-2"><span>{seleccion.length} seleccionados</span><select aria-label="Lado para productos seleccionados" value={lado} onChange={e => setLado(e.target.value)} className="min-h-12 rounded-lg bg-gray-800 px-3">{LADOS.map(([id,nombre]) => <option key={id} value={id}>{nombre}</option>)}</select><button type="button" disabled={!seleccion.length} onClick={() => asignar(seleccion,lado)} className="min-h-12 rounded-lg bg-orange-600 px-4 disabled:opacity-40">Asignar a seleccionados</button></div>
      <div className="max-h-96 overflow-auto rounded-lg border border-gray-700"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-gray-800"><tr><th className="p-3">Elegir</th><th className="p-3">Producto</th><th className="p-3">Lado de preparación</th></tr></thead><tbody>{visibles.map(p => {
        const automatico = prepararComandas({detalles:[{producto:p,cantidad:1}]},1)[0]?.ladoNombre || 'SIN_COMANDA';
        return <tr key={p.id} className="border-t border-gray-800"><td className="p-3"><input type="checkbox" aria-label={`Seleccionar ${p.nombre}`} checked={seleccion.includes(p.id)} onChange={e => setSeleccion(prev => e.target.checked ? [...prev,p.id] : prev.filter(id => id !== p.id))} className="h-6 w-6 accent-orange-500"/></td><td className="p-3">{p.nombre}<span className="block text-xs text-gray-400">{p.categoria?.nombre}</span></td><td className="p-3"><select aria-label={`Lado de ${p.nombre}`} value={elegido(p)} onChange={e => asignar([p.id],e.target.value)} className="min-h-12 w-full rounded-lg bg-gray-800 px-3">{LADOS.map(([id,nombre]) => <option key={id} value={id}>{id === 'AUTO' ? `Automático (${LADOS.find(([valor])=>valor===automatico)?.[1]})` : nombre}</option>)}</select></td></tr>;
      })}</tbody></table></div>
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!Object.keys(cambios).length} onClick={() => void guardar()} className="min-h-12 rounded-lg bg-orange-500 px-5 font-bold disabled:opacity-40">{ocupado ? 'Guardando…' : 'Guardar distribución'}</button><span className="text-sm text-gray-400">{Object.keys(cambios).length} productos con cambios pendientes</span></div>
    </fieldset>
  </section>;
}
