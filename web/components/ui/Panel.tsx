'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// Piezas visuales comunes, con el mismo estilo de Inventario y Cajas: tarjetas oscuras con borde,
// encabezado con filtros, tablas con celdas amplias e indicadores con ícono.
export const ui = {
  input: 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-60',
  etiqueta: 'block text-sm text-gray-400 mb-1',
  primario: 'inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-50',
  secundario: 'inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-50',
  th: 'px-4 py-3 text-left text-gray-500 text-sm font-medium whitespace-nowrap',
  thNum: 'px-4 py-3 text-right text-gray-500 text-sm font-medium whitespace-nowrap',
  td: 'px-4 py-3 text-sm text-gray-200 align-middle',
  tdNum: 'px-4 py-3 text-sm text-right tabular-nums whitespace-nowrap text-gray-200 align-middle',
  fila: 'border-t border-gray-800 hover:bg-gray-800/50 transition-colors',
};

export function Pagina({ titulo, descripcion, acciones, children }: { titulo: string; descripcion?: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 max-w-7xl w-full mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{titulo}</h1>
          {descripcion && <p className="mt-1 text-sm text-gray-400 max-w-3xl">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </div>
  );
}

export function Pestanas<T extends string>({ opciones, valor, onCambio }: { opciones: readonly (readonly [T, string])[]; valor: T; onCambio: (v: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-2">
      {opciones.map(([k, t]) => (
        <button key={k} role="tab" aria-selected={valor === k} type="button" onClick={() => onCambio(k)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${valor === k ? 'bg-orange-500 text-white' : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800'}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function Tarjeta({ titulo, acciones, children, sinRelleno = false }: { titulo?: ReactNode; acciones?: ReactNode; children: ReactNode; sinRelleno?: boolean }) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl">
      {(titulo || acciones) && (
        <div className="p-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
          {typeof titulo === 'string' ? <h2 className="text-white font-semibold">{titulo}</h2> : titulo}
          {acciones && <div className="flex flex-wrap items-end gap-3">{acciones}</div>}
        </div>
      )}
      <div className={sinRelleno ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

const TONOS = {
  gris: { borde: 'border-gray-800', fondo: 'bg-blue-500/10', icono: 'text-blue-400', valor: 'text-white' },
  naranja: { borde: 'border-orange-500/20', fondo: 'bg-orange-500/10', icono: 'text-orange-400', valor: 'text-orange-300' },
  verde: { borde: 'border-green-500/20', fondo: 'bg-green-500/10', icono: 'text-green-400', valor: 'text-green-400' },
  amarillo: { borde: 'border-yellow-500/20', fondo: 'bg-yellow-500/10', icono: 'text-yellow-400', valor: 'text-yellow-400' },
  rojo: { borde: 'border-red-500/20', fondo: 'bg-red-500/10', icono: 'text-red-400', valor: 'text-red-400' },
};

export function Indicador({ icono: Icono, etiqueta, valor, detalle, tono = 'gris' }: { icono: LucideIcon; etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: keyof typeof TONOS }) {
  const t = TONOS[tono];
  return (
    <div className={`bg-gray-900 border ${t.borde} rounded-xl p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`${t.fondo} p-2 rounded-lg`}><Icono size={18} className={t.icono} /></div>
        <span className="text-gray-400 text-sm">{etiqueta}</span>
      </div>
      <div className={`text-2xl font-bold ${t.valor}`}>{valor}</div>
      {detalle && <div className="mt-1 text-sm">{detalle}</div>}
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'alerta' | 'error' | 'exito'; children: ReactNode }) {
  const estilo = { info: 'border-gray-700 bg-gray-900 text-gray-300', alerta: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200', error: 'border-red-500/30 bg-red-500/10 text-red-300', exito: 'border-green-500/30 bg-green-500/10 text-green-300' }[tipo];
  return <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${estilo}`}>{children}</div>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-gray-500">{children}</p>;
}
