'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Package, Percent } from 'lucide-react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { useAuthStore } from '@/store/authStore';
import { Aviso, Indicador, Tarjeta, Vacio, ui } from '@/components/ui/Panel';

type Tarifa = 'IVA19' | 'IVA5' | 'EXENTO' | 'EXCLUIDO';
type Producto = { id: number; nombre: string; categoria: string; precio: number; tarifa: Tarifa; confirmada: boolean; base: number; iva: number };
const TARIFAS: [Tarifa, string, number][] = [['IVA19', 'IVA 19 %', 19], ['IVA5', 'IVA 5 %', 5], ['EXENTO', 'Exento', 0], ['EXCLUIDO', 'Excluido', 0]];
const nombreTarifa = (t: Tarifa) => TARIFAS.find(([v]) => v === t)?.[1] || t;
const desglose = (precio: number, t: Tarifa) => {
  const p = TARIFAS.find(([v]) => v === t)?.[2] ?? 0;
  const base = Math.round((precio / (1 + p / 100)) * 100) / 100;
  return { base, iva: Math.round((precio - base) * 100) / 100 };
};

// Tarifa de IVA por producto. Los cambios se guardan juntos; lo no confirmado se calcula con la tarifa por defecto.
export default function TarifasIva() {
  const admin = useAuthStore((s) => s.usuario?.rol) === 'ADMIN_EMPRESA';
  const [datos, setDatos] = useState<{ config: { responsable: boolean; costoIncluyeIva: boolean; porDefecto: Tarifa }; productos: Producto[]; sinConfirmar: number } | null>(null);
  const [cambios, setCambios] = useState<Record<string, Tarifa>>({});
  const [filtro, setFiltro] = useState({ texto: '', categoria: '', soloSinConfirmar: false });
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cargar = () => api.get('/iva/tarifas').then(({ data }) => { setDatos(data); setCambios({}); }).catch((e) => setMensaje({ tipo: 'error', texto: e?.response?.data?.message || 'No se pudieron cargar las tarifas' }));
  useEffect(() => { void cargar(); }, []);
  const categorias = useMemo(() => [...new Set((datos?.productos || []).map((p) => p.categoria))].filter(Boolean).sort(), [datos]);
  const visibles = useMemo(() => (datos?.productos || []).filter((p) =>
    (!filtro.categoria || p.categoria === filtro.categoria) &&
    (!filtro.soloSinConfirmar || (!p.confirmada && !cambios[p.id])) &&
    (!filtro.texto || p.nombre.toLowerCase().includes(filtro.texto.toLowerCase()))), [datos, filtro, cambios]);
  const guardar = async (extra: Record<string, unknown> = {}) => {
    setGuardando(true); setMensaje(null);
    try {
      setDatos((await api.patch('/iva/tarifas', { ...extra, ...(Object.keys(cambios).length ? { productos: cambios } : {}) })).data);
      setCambios({});
      setMensaje({ tipo: 'exito', texto: 'Cambios guardados.' });
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e?.response?.data?.message || 'No se pudo guardar' });
    } finally { setGuardando(false); }
  };
  if (!datos) return mensaje ? <Aviso tipo="error">{mensaje.texto}</Aviso> : <Vacio>Cargando tarifas…</Vacio>;
  const { config } = datos;
  const pendientes = Object.keys(cambios).length;
  return (
    <div className="space-y-6">
      <Tarjeta titulo="Configuración de IVA">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-950/40 p-4">
            <input type="checkbox" className="mt-1 accent-orange-500" disabled={!admin || guardando} checked={config.responsable} onChange={(e) => void guardar({ responsable: e.target.checked })} />
            <span><span className="block text-sm font-medium text-white">Responsable de IVA</span><span className="text-xs text-gray-500">La empresa cobra y declara IVA.</span></span>
          </label>
          {config.responsable && <>
            <label className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-950/40 p-4">
              <input type="checkbox" className="mt-1 accent-orange-500" disabled={!admin || guardando} checked={config.costoIncluyeIva} onChange={(e) => void guardar({ costoIncluyeIva: e.target.checked })} />
              <span><span className="block text-sm font-medium text-white">El costo incluye IVA</span><span className="text-xs text-gray-500">Se separa como IVA descontable en las compras.</span></span>
            </label>
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
              <label className={ui.etiqueta}>Tarifa para productos sin confirmar</label>
              <select className={`${ui.input} w-full`} disabled={!admin || guardando} value={config.porDefecto} onChange={(e) => void guardar({ porDefecto: e.target.value })}>
                {TARIFAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
          </>}
        </div>
        {config.responsable && <p className="mt-4 text-sm text-gray-400">Los precios de venta incluyen el IVA: el cliente paga lo mismo y el sistema separa la base y el impuesto. Confirma la tarifa de cada producto con tu contador.</p>}
        {!admin && <p className="mt-2 text-xs text-gray-500">Solo el administrador puede cambiar estas opciones.</p>}
      </Tarjeta>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      {config.responsable && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Indicador icono={Package} etiqueta="Productos" valor={datos.productos.length} />
            <Indicador icono={CheckCircle2} etiqueta="Con tarifa confirmada" valor={datos.productos.length - datos.sinConfirmar} tono="verde" />
            <Indicador icono={CircleAlert} etiqueta="Sin confirmar" valor={datos.sinConfirmar} tono={datos.sinConfirmar ? 'amarillo' : 'gris'} detalle={datos.sinConfirmar ? <span className="text-gray-500">Se calculan como {nombreTarifa(config.porDefecto)}</span> : undefined} />
          </div>

          <Tarjeta
            sinRelleno
            titulo={<h2 className="flex items-center gap-2 text-white font-semibold"><Percent size={16} className="text-orange-400" /> Tarifa por producto</h2>}
            acciones={admin && pendientes > 0 ? <button type="button" disabled={guardando} onClick={() => void guardar()} className={ui.primario}>{guardando ? 'Guardando…' : `Guardar ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'}`}</button> : undefined}
          >
            <div className="flex flex-wrap items-end gap-3 border-b border-gray-800 p-4">
              <div className="min-w-56 flex-1">
                <label className={ui.etiqueta}>Buscar</label>
                <input aria-label="Buscar producto" placeholder="Nombre del producto" className={`${ui.input} w-full`} value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
              </div>
              <div>
                <label className={ui.etiqueta}>Categoría</label>
                <select aria-label="Categoría" className={ui.input} value={filtro.categoria} onChange={(e) => setFiltro({ ...filtro, categoria: e.target.value })}>
                  <option value="">Todas</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm text-gray-300"><input type="checkbox" className="accent-orange-500" checked={filtro.soloSinConfirmar} onChange={(e) => setFiltro({ ...filtro, soloSinConfirmar: e.target.checked })} /> Solo sin confirmar</label>
              {admin && visibles.length > 0 && (
                <div>
                  <label className={ui.etiqueta}>Aplicar a los {visibles.length} visibles</label>
                  <select className={ui.input} value="" onChange={(e) => { const t = e.target.value as Tarifa; if (t) setCambios((c) => ({ ...c, ...Object.fromEntries(visibles.map((p) => [p.id, t])) })); }}>
                    <option value="">Elegir tarifa…</option>{TARIFAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr>
                    <th className={ui.th}>Producto</th>
                    <th className={ui.thNum}>Precio</th>
                    <th className={`${ui.th} w-48`}>Tarifa</th>
                    <th className={ui.thNum}>Base</th>
                    <th className={ui.thNum}>IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.slice(0, 500).map((p) => {
                    const actual = cambios[p.id] || p.tarifa;
                    const d = cambios[p.id] ? desglose(p.precio, cambios[p.id]) : { base: p.base, iva: p.iva };
                    const sinConfirmar = !p.confirmada && !cambios[p.id];
                    return (
                      <tr key={p.id} className={ui.fila}>
                        <td className={ui.td}>
                          <div className="font-medium text-white">{p.nombre}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            {p.categoria}
                            {sinConfirmar && <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-yellow-400">Sin confirmar</span>}
                            {cambios[p.id] && <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-300">Sin guardar</span>}
                          </div>
                        </td>
                        <td className={ui.tdNum}>{moneda(p.precio)}</td>
                        <td className={ui.td}>
                          <select aria-label={`Tarifa de ${p.nombre}`} disabled={!admin} value={actual} onChange={(e) => setCambios((c) => ({ ...c, [p.id]: e.target.value as Tarifa }))}
                            className={`${ui.input} w-full ${sinConfirmar ? 'border-yellow-500/50' : ''}`}>
                            {TARIFAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                          </select>
                        </td>
                        <td className={ui.tdNum}>{moneda(d.base)}</td>
                        <td className={ui.tdNum}>{moneda(d.iva)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!visibles.length && <Vacio>No hay productos con ese filtro.</Vacio>}
              {visibles.length > 500 && <p className="border-t border-gray-800 px-4 py-3 text-xs text-gray-500">Mostrando 500 de {visibles.length}. Filtra por categoría o búsqueda para ver el resto.</p>}
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  );
}
