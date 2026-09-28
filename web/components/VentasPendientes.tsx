'use client';

import { useEffect, useState } from 'react';

type Pendiente<T> = { id: string; nombre: string; fecha: string; total: number; datos: T };

export default function VentasPendientes<T>({ clave, datos, total, vacia, bloqueado, onGuardar, onRestaurar }: {
  clave: string | null; datos: T; total: number; vacia: boolean; bloqueado: boolean;
  onGuardar: () => void; onRestaurar: (datos: T) => void;
}) {
  const [ventas, setVentas] = useState<Pendiente<T>[]>([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const leer = (): Pendiente<T>[] => {
    const valor = clave ? localStorage.getItem(clave) : null;
    const lista = valor ? JSON.parse(valor) : [];
    if (!Array.isArray(lista) || lista.some(v => !v.id || !v.fecha || !('datos' in v))) throw new Error('Datos inválidos');
    return lista;
  };
  useEffect(() => {
    const cargar = () => { try { setVentas(leer()); setError(''); } catch { setError('No se pudieron leer las ventas pendientes. No se borró ningún registro.'); } };
    cargar();
    const actualizar = (e: StorageEvent) => { if (e.key === clave) cargar(); };
    window.addEventListener('storage', actualizar);
    return () => window.removeEventListener('storage', actualizar);
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = () => {
    if (!clave || vacia || bloqueado) return;
    try {
      const nuevas = [...leer(), { id: crypto.randomUUID(), nombre: nombre.trim() || `Cliente ${new Date().toLocaleTimeString('es-CO')}`, fecha: new Date().toISOString(), total, datos }];
      localStorage.setItem(clave, JSON.stringify(nuevas));
      setVentas(nuevas); setNombre(''); setError(''); onGuardar(); setListaAbierta(true);
    } catch { setError('No se pudo guardar. La venta actual sigue en el carrito; no la borres.'); }
  };
  const recuperar = (id: string) => {
    if (!clave || !vacia || bloqueado) return;
    try {
      const actuales = leer();
      const venta = actuales.find(v => v.id === id);
      if (!venta) { setVentas(actuales); setError('Esta venta ya fue recuperada en otra pestaña.'); return; }
      const restantes = actuales.filter(v => v.id !== id);
      localStorage.setItem(clave, JSON.stringify(restantes));
      onRestaurar(venta.datos); setVentas(restantes); setError(''); setListaAbierta(false);
    } catch { setError('No se pudo recuperar la venta pendiente.'); }
  };
  return <section className="my-3 rounded-xl border border-gray-700 bg-gray-950 p-3" aria-label="Ventas pendientes">
    <div className="flex gap-2">
      <button type="button" disabled={!clave || vacia || bloqueado} onClick={guardar} className="min-h-12 flex-1 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-40">Guardar y atender otro</button>
      <button type="button" onClick={() => setListaAbierta(v => !v)} aria-expanded={listaAbierta} className="min-h-12 rounded-lg border border-gray-600 px-3 text-sm text-white">Pendientes ({ventas.length})</button>
    </div>
    {!vacia && <input aria-label="Nombre de la venta pendiente" maxLength={80} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del cliente o referencia (opcional)" className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-white" />}
    {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    {listaAbierta && <div className="mt-3 space-y-2">
      <p className="text-xs text-gray-400">Guardadas en este navegador para tu usuario y sucursal. Se cobran al recuperarlas.</p>
      {!vacia && ventas.length > 0 && <p className="text-sm text-amber-300">Guarda o termina la venta actual antes de recuperar otra.</p>}
      {!ventas.length && <p className="text-sm text-gray-400">No hay ventas pendientes.</p>}
      {ventas.map(venta => <div key={venta.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-800 p-3">
        <div className="min-w-0"><p className="break-words text-sm font-semibold text-white">{venta.nombre}</p><p className="text-xs text-gray-400">{new Date(venta.fecha).toLocaleString('es-CO')} · ${venta.total.toLocaleString('es-CO')}</p></div>
        <button type="button" disabled={!vacia || bloqueado} onClick={() => recuperar(venta.id)} className="min-h-12 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white disabled:opacity-40">Recuperar</button>
      </div>)}
    </div>}
  </section>;
}
