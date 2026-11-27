'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { useAuthStore } from '@/store/authStore';

type Tarifa = 'IVA19' | 'IVA5' | 'EXENTO' | 'EXCLUIDO';
type Producto = { id: number; nombre: string; categoria: string; precio: number; tarifa: Tarifa; confirmada: boolean; base: number; iva: number };
const TARIFAS: [Tarifa, string][] = [['IVA19', 'IVA 19 %'], ['IVA5', 'IVA 5 %'], ['EXENTO', 'Exento'], ['EXCLUIDO', 'Excluido']];
const select = 'rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-white';

// Tarifa de IVA por producto. Los cambios se guardan juntos; lo no confirmado se calcula con la tarifa por defecto.
export default function TarifasIva() {
  const admin = useAuthStore((s) => s.usuario?.rol) === 'ADMIN_EMPRESA';
  const [datos, setDatos] = useState<{ config: { responsable: boolean; costoIncluyeIva: boolean; porDefecto: Tarifa }; productos: Producto[]; sinConfirmar: number } | null>(null);
  const [cambios, setCambios] = useState<Record<string, Tarifa>>({});
  const [filtro, setFiltro] = useState({ texto: '', categoria: '', soloSinConfirmar: false });
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cargar = () => api.get('/iva/tarifas').then(({ data }) => { setDatos(data); setCambios({}); }).catch((e) => setMensaje(e?.response?.data?.message || 'No se pudo cargar'));
  useEffect(() => { void cargar(); }, []);
  const categorias = useMemo(() => [...new Set((datos?.productos || []).map((p) => p.categoria))].sort(), [datos]);
  const visibles = useMemo(() => (datos?.productos || []).filter((p) =>
    (!filtro.categoria || p.categoria === filtro.categoria) &&
    (!filtro.soloSinConfirmar || (!p.confirmada && !cambios[p.id])) &&
    (!filtro.texto || p.nombre.toLowerCase().includes(filtro.texto.toLowerCase()))), [datos, filtro, cambios]);
  const guardar = async (extra: Record<string, unknown> = {}) => {
    setGuardando(true); setMensaje('');
    try {
      setDatos((await api.patch('/iva/tarifas', { ...extra, ...(Object.keys(cambios).length ? { productos: cambios } : {}) })).data);
      setCambios({});
      setMensaje('✅ Guardado');
    } catch (e: any) {
      setMensaje(e?.response?.data?.message || 'No se pudo guardar');
    } finally { setGuardando(false); }
  };
  if (!datos) return mensaje ? <p className="text-red-400">{mensaje}</p> : <p className="text-gray-400">Cargando…</p>;
  const { config } = datos;
  return (
    <section className="space-y-4">
      <div className="space-y-2 rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm">
        <label className="flex gap-3"><input type="checkbox" disabled={!admin || guardando} checked={config.responsable} onChange={(e) => void guardar({ responsable: e.target.checked })} /> La empresa es responsable de IVA</label>
        {config.responsable && <>
          <label className="flex gap-3"><input type="checkbox" disabled={!admin || guardando} checked={config.costoIncluyeIva} onChange={(e) => void guardar({ costoIncluyeIva: e.target.checked })} /> El costo de compra de los productos incluye IVA (se separa como IVA descontable)</label>
          <label className="flex items-center gap-3">Tarifa para productos sin confirmar
            <select className={select} disabled={!admin || guardando} value={config.porDefecto} onChange={(e) => void guardar({ porDefecto: e.target.value })}>{TARIFAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </label>
          <p className="text-gray-400">Los precios de venta incluyen el IVA: el cliente paga lo mismo y el sistema separa la base y el impuesto. Confirma la tarifa de cada producto con tu contador.</p>
        </>}
      </div>
      {mensaje && <p className={mensaje.includes('✅') ? 'text-green-400' : 'text-red-400'}>{mensaje}</p>}
      {config.responsable && (
        <>
          {datos.sinConfirmar > 0 && <p className="text-amber-300">{datos.sinConfirmar} productos sin tarifa confirmada: se calculan como {TARIFAS.find(([v]) => v === config.porDefecto)?.[1]}.</p>}
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <input aria-label="Buscar producto" placeholder="Buscar producto" className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-2" value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
            <select aria-label="Categoría" className={select} value={filtro.categoria} onChange={(e) => setFiltro({ ...filtro, categoria: e.target.value })}><option value="">Todas las categorías</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filtro.soloSinConfirmar} onChange={(e) => setFiltro({ ...filtro, soloSinConfirmar: e.target.checked })} /> Solo sin confirmar</label>
            {admin && visibles.length > 0 && (
              <label className="flex items-center gap-2">Aplicar a los {visibles.length} visibles
                <select className={select} value="" onChange={(e) => { const t = e.target.value as Tarifa; if (t) setCambios((c) => ({ ...c, ...Object.fromEntries(visibles.map((p) => [p.id, t])) })); }}>
                  <option value="">Elegir…</option>{TARIFAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
            )}
            {admin && Object.keys(cambios).length > 0 && <button type="button" disabled={guardando} onClick={() => void guardar()} className="rounded-lg bg-orange-500 px-3 py-2 font-bold disabled:opacity-50">Guardar {Object.keys(cambios).length} cambios</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-gray-400"><tr><th className="py-2">Producto</th><th className="text-right">Precio</th><th>Tarifa</th><th className="text-right">Base</th><th className="text-right">IVA</th></tr></thead>
              <tbody>
                {visibles.slice(0, 500).map((p) => {
                  const actual = cambios[p.id] || p.tarifa;
                  return (
                    <tr key={p.id} className="border-t border-gray-800">
                      <td className="py-1">{p.nombre}<span className="block text-xs text-gray-500">{p.categoria}{!p.confirmada && !cambios[p.id] ? ' · sin confirmar' : ''}</span></td>
                      <td className="text-right tabular-nums">{moneda(p.precio)}</td>
                      <td><select aria-label={`Tarifa de ${p.nombre}`} className={`${select} ${!p.confirmada && !cambios[p.id] ? 'border-amber-500' : ''}`} disabled={!admin} value={actual} onChange={(e) => setCambios((c) => ({ ...c, [p.id]: e.target.value as Tarifa }))}>{TARIFAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></td>
                      <td className="text-right tabular-nums">{cambios[p.id] ? '—' : moneda(p.base)}</td>
                      <td className="text-right tabular-nums">{cambios[p.id] ? '—' : moneda(p.iva)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibles.length > 500 && <p className="text-xs text-gray-400">Mostrando 500 de {visibles.length}. Filtra por categoría o búsqueda.</p>}
          </div>
        </>
      )}
    </section>
  );
}
