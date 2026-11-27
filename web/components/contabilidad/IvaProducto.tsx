'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';

export type TarifaIva = 'IVA19' | 'IVA5' | 'EXENTO' | 'EXCLUIDO';
const TARIFAS: [TarifaIva, string, number][] = [['IVA19', 'IVA 19 %', 19], ['IVA5', 'IVA 5 %', 5], ['EXENTO', 'Exento', 0], ['EXCLUIDO', 'Excluido', 0]];
export type ConfigIvaProductos = { responsable: boolean; porDefecto: TarifaIva; tarifas: Record<number, { tarifa: TarifaIva; confirmada: boolean }> };

// Configuración de IVA para el formulario de productos (administrador o gerente). Sin acceso, no muestra nada.
export function useIvaProductos(activo: boolean) {
  const [config, setConfig] = useState<ConfigIvaProductos | null>(null);
  const cargar = useCallback(() => {
    if (!activo) return;
    api.get('/iva/tarifas').then(({ data }) => setConfig({
      responsable: data.config.responsable,
      porDefecto: data.config.porDefecto,
      tarifas: Object.fromEntries(data.productos.map((p: any) => [p.id, { tarifa: p.tarifa, confirmada: p.confirmada }])),
    })).catch(() => setConfig(null));
  }, [activo]);
  useEffect(() => { cargar(); }, [cargar]);
  return { config, recargar: cargar };
}

// Guarda la tarifa de un producto solo si cambió respecto a la confirmada.
export async function guardarTarifaProducto(config: ConfigIvaProductos | null, productoId: number, tarifa: TarifaIva | '') {
  if (!config?.responsable || !tarifa) return;
  const actual = config.tarifas[productoId];
  if (actual?.confirmada && actual.tarifa === tarifa) return;
  await api.patch('/iva/tarifas', { productos: { [productoId]: tarifa } });
}

export function SelectorIvaProducto({ config, valor, onCambio, precio, editable }: { config: ConfigIvaProductos; valor: TarifaIva | ''; onCambio: (t: TarifaIva | '') => void; precio: number; editable: boolean }) {
  if (!config.responsable) return null;
  const efectiva = (valor || config.porDefecto) as TarifaIva;
  const porcentaje = TARIFAS.find(([t]) => t === efectiva)?.[2] ?? 0;
  const base = precio > 0 ? Math.round((precio / (1 + porcentaje / 100)) * 100) / 100 : 0;
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">IVA (incluido en el precio)</label>
      <select value={valor} disabled={!editable} onChange={(e) => onCambio(e.target.value as TarifaIva | '')}
        className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 ${valor ? 'border-gray-700' : 'border-amber-500'}`}>
        <option value="">Sin confirmar ({TARIFAS.find(([t]) => t === config.porDefecto)?.[1]})</option>
        {TARIFAS.map(([t, nombre]) => <option key={t} value={t}>{nombre}</option>)}
      </select>
      {precio > 0 && <p className="mt-1 text-xs text-gray-500">Base {moneda(base)} + IVA {moneda(Math.round((precio - base) * 100) / 100)}</p>}
      {!editable && <p className="mt-1 text-xs text-gray-500">Solo el administrador cambia la tarifa.</p>}
    </div>
  );
}
