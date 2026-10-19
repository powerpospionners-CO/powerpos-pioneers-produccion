'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Keyboard } from 'lucide-react';

export type EmpleadoConsumo = { id: number; nombre: string; rol?: string; sucursal?: { nombre: string } | null };
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

export default function SelectorEmpleadoConsumo({ value, onChange, empleados, cargando, error, onReintentar, onTeclado, disabled, tecladoAbierto, onSeleccionar }: {
  value: string; onChange: (nombre: string) => void; empleados: EmpleadoConsumo[]; cargando: boolean; error: string;
  onReintentar: () => void; onTeclado: () => void; disabled?: boolean;
  tecladoAbierto?: boolean; onSeleccionar?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [todos, setTodos] = useState(false);
  const [indice, setIndice] = useState(-1);
  const contenedor = useRef<HTMLDivElement>(null);
  const botonLista = useRef<HTMLButtonElement>(null);
  const coincidencias = empleados.filter(e => todos || normalizar(e.nombre).includes(normalizar(value)));
  useEffect(() => { if (tecladoAbierto) { setAbierto(true); setTodos(false); setIndice(-1); } }, [value, tecladoAbierto]);
  useEffect(() => {
    const cerrar = (evento: PointerEvent) => {
      if (evento.target instanceof Element && !contenedor.current?.contains(evento.target) && !evento.target.closest('[data-teclado-tactil-global]')) setAbierto(false);
    };
    document.addEventListener('pointerdown', cerrar);
    return () => document.removeEventListener('pointerdown', cerrar);
  }, []);
  const elegir = (empleado: EmpleadoConsumo) => { onChange(empleado.nombre); onSeleccionar?.(); setAbierto(false); setIndice(-1); botonLista.current?.focus({ preventScroll: true }); };
  return <div ref={contenedor}>
    <label htmlFor="empleado-consumo" className="mb-1 block text-sm text-gray-400">Empleado</label>
    <div className="relative">
      <input id="empleado-consumo" role="combobox" aria-autocomplete="list" aria-expanded={abierto} aria-controls="lista-empleados-consumo" aria-activedescendant={abierto && coincidencias[indice] ? `empleado-consumo-${coincidencias[indice].id}` : undefined}
        type="text" autoComplete="off" value={value} disabled={disabled}
        onChange={e => { onChange(e.target.value); setTodos(false); setAbierto(true); setIndice(-1); }}
        onFocus={() => { setAbierto(true); setTodos(false); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAbierto(true); setIndice(i => Math.max(0, Math.min(coincidencias.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))); }
          if (e.key === 'Enter' && abierto && coincidencias[indice]) { e.preventDefault(); elegir(coincidencias[indice]); }
          if (e.key === 'Escape' || e.key === 'Tab') setAbierto(false);
        }} placeholder="Busca o escribe el nombre del empleado" className="min-h-12 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 pr-24 text-sm text-white focus:border-orange-500 focus:outline-none"/>
      <div className="absolute inset-y-0 right-0 flex items-center">
        <button type="button" disabled={disabled} aria-label="Teclado para nombre del empleado" onClick={onTeclado} className="min-h-12 min-w-10 text-gray-400"><Keyboard size={18} className="mx-auto"/></button>
        <button ref={botonLista} type="button" disabled={disabled} aria-label="Ver lista de empleados" aria-expanded={abierto} onClick={() => { setTodos(true); setAbierto(v => !v); setIndice(-1); }} className="min-h-12 min-w-10 text-orange-400"><ChevronDown size={20} className="mx-auto"/></button>
      </div>
    </div>
    {abierto && <div className="mt-2 rounded-lg border border-gray-700 bg-gray-950 p-2">
      {cargando ? <p role="status" className="p-2 text-sm text-gray-400">Cargando empleados…</p> : error ? <div className="p-2 text-sm text-orange-200"><p role="status">{error}</p><button type="button" onClick={onReintentar} className="mt-2 min-h-12 rounded bg-gray-800 px-3">Reintentar lista</button></div> : <>
        <div id="lista-empleados-consumo" role="listbox" aria-label="Empleados de la empresa" className="max-h-52 overflow-auto">
          {coincidencias.map((empleado,i) => <button key={empleado.id} id={`empleado-consumo-${empleado.id}`} role="option" aria-selected={indice === i} type="button" disabled={disabled}
            onPointerDown={e => e.preventDefault()} onClick={() => elegir(empleado)} className={`block min-h-12 w-full rounded px-3 py-2 text-left text-sm text-white ${indice === i ? 'bg-orange-500/20' : 'hover:bg-gray-800'}`}>
            <span className="block font-semibold">{empleado.nombre}</span><span className="block text-xs text-gray-400">{[empleado.rol?.replaceAll('_', ' ').toLocaleLowerCase(), empleado.sucursal?.nombre].filter(Boolean).join(' · ')}</span>
          </button>)}
        </div>
        {!coincidencias.length && <p className="p-2 text-sm text-gray-400">{empleados.length ? 'No hay coincidencias. Puedes escribir el nombre completo.' : 'No hay usuarios activos registrados. Puedes escribir el nombre del empleado.'}</p>}
      </>}
    </div>}
    <p className="mt-1 text-xs text-gray-500">Selecciona un usuario activo de la empresa o escribe el nombre si no tiene cuenta.</p>
  </div>;
}
