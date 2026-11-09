'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { useNotificar } from '@/components/Notificaciones';

type Cuenta = { codigo: string; nombre: string; activo: boolean; superior: string | null; nivel: string; hijos?: number; registros?: number; bloqueoEliminar?: string | null };
type Fila = { codigo: string; nombre: string; monto: number | null };
type Registro = { origen: string; id: number; fecha: string; descripcion: string; categoria: string; monto: number; clase: string; codigo: string | null };
type Informe = {
  periodo: { desde: string; hasta: string };
  resultado: { ventasNetas: number; resultadoNeto: number; completo: boolean };
  fechaBalance: string; balanceCompleto: boolean;
  resultadoCuentas: Fila[]; balanceCuentas: Fila[];
  alcanceBalance: Fila[]; pendientes: number; registros: Registro[];
};
const dinero = (n: number | null) => n === null ? 'Sin saldo inicial' : n.toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
const fecha = (valor: string) => new Date(valor).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
const hoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date());
const clase = (codigo: string) => ({ '1': 'Activo', '2': 'Pasivo', '3': 'Patrimonio', '4': 'Ingresos', '5': 'Gastos', '6': 'Costos' }[codigo[0]]);
const campo = 'w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-white';
const boton = 'rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold disabled:opacity-50';
const accionHija = (codigo: string) => codigo.length === 1 ? 'Agregar grupo' : codigo.length === 2 ? 'Agregar cuenta' : codigo.length === 4 ? 'Agregar subcuenta' : 'Agregar auxiliar';

function TablaInforme({ filas, base }: { filas: Fila[]; base?: number }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="text-gray-400"><tr><th className="p-2">Código</th><th className="p-2">Cuenta</th><th className="p-2 text-right">Valor</th>{base !== undefined && <th className="p-2 text-right">% ventas</th>}</tr></thead>
    <tbody>{filas.map(f => <tr key={f.codigo} className={`border-t border-gray-800 ${f.codigo.length <= 2 ? 'bg-gray-800 font-bold' : ''}`}>
      <td className="p-2 tabular-nums">{f.codigo}</td><td className="p-2" style={{ paddingLeft: Math.max(0, f.codigo.length - 2) * 4 + 8 }}>{f.nombre}</td>
      <td className="whitespace-nowrap p-2 text-right tabular-nums">{dinero(f.monto)}</td>
      {base !== undefined && <td className="p-2 text-right tabular-nums">{base === 0 || f.monto === null ? '—' : `${(f.monto / base * 100).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}</td>}
    </tr>)}</tbody>
  </table></div>;
}

export default function PlanCuentasPage() {
  const { confirmar } = useNotificar();
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [vista, setVista] = useState('catalogo');
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [form, setForm] = useState({ codigo: '', nombre: '', activo: true });
  const [editando, setEditando] = useState(false);
  const [padreNueva, setPadreNueva] = useState<Cuenta | null>(null);
  const [detalleCuenta, setDetalleCuenta] = useState<Cuenta | null>(null);
  const [desde, setDesde] = useState(() => hoy().slice(0, 7) + '-01');
  const [hasta, setHasta] = useState(hoy);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [filtroRegistros, setFiltroRegistros] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(true);

  const mensaje = (e: unknown) => {
    const texto = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
    return typeof texto === 'string' ? texto : 'No se pudo completar la operación. Intenta de nuevo.';
  };
  useEffect(() => {
    const controlador = new AbortController();
    api.get<Cuenta[]>('/financiero/puc/cuentas', { signal: controlador.signal }).then(r => setCuentas(r.data)).catch(e => {
      if (!controlador.signal.aborted) setError(mensaje(e));
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get('vista')) setVista(params.get('vista')!);
    for (const [clave, actualizar] of [['desde', setDesde], ['hasta', setHasta]] as const) {
      const valor = params.get(clave);
      if (valor && Number.isFinite(Date.parse(valor))) actualizar(new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date(valor)));
    }
    return () => controlador.abort();
  }, []);

  async function cargarInforme() {
    const { data } = await api.get<Informe>('/financiero/puc/informe', { params: {
      fechaDesde: new Date(`${desde}T00:00:00.000-05:00`).toISOString(),
      fechaHasta: new Date(`${hasta}T23:59:59.999-05:00`).toISOString(),
    } });
    setInforme(data);
  }
  async function consultar(e: FormEvent) {
    e.preventDefault();
    if (!desde || !hasta || desde > hasta) return;
    setOcupado(true); setError(''); setAviso('');
    try { await cargarInforme(); } catch (e) { setError(mensaje(e)); } finally { setOcupado(false); }
  }
  async function guardar(e: FormEvent) {
    e.preventDefault(); setOcupado(true); setError(''); setAviso('');
    try {
      await api.post('/financiero/puc/cuentas', { ...form, crear: !editando });
      const { data } = await api.get<Cuenta[]>('/financiero/puc/cuentas');
      setCuentas(data); setForm({ codigo: '', nombre: '', activo: true }); setEditando(false); setPadreNueva(null);
      setAviso('Cuenta guardada.');
      setInforme(null);
    } catch (e) { setError(mensaje(e)); } finally { setOcupado(false); }
  }
  function editarCuenta(cuenta: Cuenta) {
    setPadreNueva(null); setDetalleCuenta(null); setEditando(true);
    setForm({ codigo: cuenta.codigo, nombre: cuenta.nombre, activo: cuenta.activo });
    setError(''); setAviso('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function agregarHija(cuenta: Cuenta) {
    const digitos = cuenta.codigo.length === 1 ? 1 : 2;
    const maximo = digitos === 1 ? 9 : 99;
    let codigo = '';
    for (let numero = 1; numero <= maximo; numero++) {
      const candidato = cuenta.codigo + String(numero).padStart(digitos, '0');
      if (!cuentas.some(c => c.codigo === candidato)) { codigo = candidato; break; }
    }
    if (!codigo) { setError('No quedan códigos disponibles en este nivel de la cuenta.'); return; }
    setPadreNueva(cuenta); setDetalleCuenta(null); setEditando(false);
    setForm({ codigo, nombre: '', activo: true }); setError(''); setAviso('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function eliminarCuenta(cuenta: Cuenta) {
    if (!await confirmar(`¿Eliminar la cuenta ${cuenta.codigo} · ${cuenta.nombre}?`, { titulo: 'Eliminar cuenta PUC', textoConfirmar: 'Eliminar cuenta', peligroso: true })) return;
    setOcupado(true); setError(''); setAviso('');
    try {
      await api.delete(`/financiero/puc/cuentas/${cuenta.codigo}`);
      const { data } = await api.get<Cuenta[]>('/financiero/puc/cuentas');
      setCuentas(data); setDetalleCuenta(null); setInforme(null);
      if (form.codigo === cuenta.codigo || padreNueva?.codigo === cuenta.codigo) {
        setForm({ codigo: '', nombre: '', activo: true }); setEditando(false); setPadreNueva(null);
      }
      setAviso('Cuenta eliminada.');
    } catch (e) { setError(mensaje(e)); } finally { setOcupado(false); }
  }
  async function cambiarEstado(cuenta: Cuenta) {
    setOcupado(true); setError(''); setAviso('');
    try {
      await api.post('/financiero/puc/cuentas', { codigo: cuenta.codigo, nombre: cuenta.nombre, activo: !cuenta.activo });
      const { data } = await api.get<Cuenta[]>('/financiero/puc/cuentas');
      setCuentas(data); setDetalleCuenta(null); setInforme(null);
      setAviso(cuenta.activo ? 'Cuenta desactivada.' : 'Cuenta activada.');
      if (form.codigo === cuenta.codigo) setForm({ ...form, activo: !cuenta.activo });
    } catch (e) { setError(mensaje(e)); } finally { setOcupado(false); }
  }
  async function asignar(registro: Registro, codigo: string) {
    if (!codigo || codigo === registro.codigo) return;
    setOcupado(true); setError(''); setAviso('');
    try {
      await api.post('/financiero/puc/asignar', { origen: registro.origen, registroId: registro.id, codigo });
      // Recarga exactamente el período del informe visible, incluso si hay fechas aún sin aplicar.
      const { data } = await api.get<Informe>('/financiero/puc/informe', { params: { fechaDesde: informe!.periodo.desde, fechaHasta: informe!.periodo.hasta } });
      setInforme(data); setAviso('Clasificación guardada.');
    } catch (e) { setError(mensaje(e)); } finally { setOcupado(false); }
  }
  const hojas = cuentas.filter(c => c.activo && c.codigo.length >= 6 && !cuentas.some(h => h.codigo !== c.codigo && h.codigo.startsWith(c.codigo)));
  const visibles = cuentas.filter(c => (verInactivos || c.activo) && `${c.codigo} ${c.nombre}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')));
  const registros = informe?.registros.filter(r => (!soloPendientes || !r.codigo) && `${r.descripcion} ${r.categoria} ${r.codigo ?? ''}`.toLocaleLowerCase('es').includes(filtroRegistros.toLocaleLowerCase('es'))) ?? [];

  return <AuthGuard><main className="min-h-screen bg-gray-950 text-white"><Navbar />
    <section className="mx-auto max-w-7xl space-y-5 p-5">
      <Link href="/financiero" className="text-orange-300">Volver a Financiero</Link>
      <h1 className="text-2xl font-bold">Plan de cuentas y detalle financiero</h1>
      <p className="text-sm text-gray-300">Catálogo inicial ajustable para la empresa. Los informes agrupan los registros existentes por clase, grupo, cuenta y auxiliar.</p>
      <nav className="flex flex-wrap gap-2" aria-label="Plan contable">{[['catalogo', 'Plan de cuentas'], ['resultado', 'Estado de resultados'], ['balance', 'Balance general'], ['clasificar', 'Clasificar registros']].map(([id, texto]) =>
        <button type="button" key={id} onClick={() => setVista(id)} className={`rounded-lg px-4 py-2 text-sm ${vista === id ? 'bg-orange-600' : 'bg-gray-800'}`}>{texto}</button>
      )}</nav>
      {error && <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-200">{error}</p>}
      {aviso && <p role="status" className="text-green-300">{aviso}</p>}
      {ocupado && <p role="status">Procesando…</p>}
      {vista === 'catalogo' ? <>
        {detalleCuenta && <section className="rounded-xl border border-gray-700 bg-gray-900 p-4" aria-label="Detalle de la cuenta">
          <div className="flex justify-between gap-3"><h2 className="font-semibold">{detalleCuenta.codigo} · {detalleCuenta.nombre}</h2><button type="button" onClick={() => setDetalleCuenta(null)} className="text-sm underline">Cerrar detalle</button></div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-400">Cuenta superior</dt><dd>{detalleCuenta.superior ?? 'Sin cuenta superior'}</dd></div>
            <div><dt className="text-gray-400">Nivel y clase</dt><dd>{detalleCuenta.nivel} · {clase(detalleCuenta.codigo)}</dd></div>
            <div><dt className="text-gray-400">Estado</dt><dd>{detalleCuenta.activo ? 'Activa' : 'Inactiva'}</dd></div>
            <div><dt className="text-gray-400">Dependencias</dt><dd>{detalleCuenta.hijos ?? 0} cuenta(s) hija(s) · {detalleCuenta.registros ?? 0} registro(s) asignado(s)</dd></div>
          </dl>
          {detalleCuenta.bloqueoEliminar && <p className="mt-3 text-sm text-amber-200">{detalleCuenta.bloqueoEliminar}</p>}
        </section>}
        <form onSubmit={guardar} className="grid gap-3 rounded-xl border border-gray-700 bg-gray-900 p-4 sm:grid-cols-4">
          {padreNueva && <p className="text-sm text-orange-300 sm:col-span-4">Nueva cuenta hija de {padreNueva.codigo} · {padreNueva.nombre}. El código sugerido es editable dentro de este nivel.</p>}
          <label className="text-sm">Código<input required disabled={editando || ocupado} pattern={padreNueva ? `${padreNueva.codigo}[0-9]{${padreNueva.codigo.length === 1 ? 1 : 2}}` : '[1-6][0-9]*'} maxLength={10} value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} className={campo} /></label>
          <label className="text-sm sm:col-span-2">Nombre<input required maxLength={150} disabled={ocupado} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={campo} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={ocupado} checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />Cuenta activa</label>
          <p className="text-xs text-gray-400 sm:col-span-4">Niveles de 1, 2, 4, 6, 8 y 10 dígitos. Para un auxiliar, crea primero su cuenta superior. Ejemplo: 11100501 debajo de 111005.</p>
          <button disabled={ocupado} className={boton}>{editando ? 'Guardar cambios' : padreNueva ? accionHija(padreNueva.codigo) : 'Agregar cuenta'}</button>
          {(editando || padreNueva) && <button type="button" onClick={() => { setEditando(false); setPadreNueva(null); setForm({ codigo: '', nombre: '', activo: true }); }} className="text-sm underline">Cancelar</button>}
        </form>
        <div className="flex flex-wrap items-center gap-4"><input aria-label="Buscar cuenta" placeholder="Buscar código o nombre" value={busqueda} onChange={e => setBusqueda(e.target.value)} className={campo + ' max-w-md'} /><label className="text-sm"><input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} /> Mostrar inactivas</label></div>
        <p className="text-xs text-gray-400">Eliminar está disponible para cuentas sin registros ni dependencias. Consulta cada cuenta para ver sus vínculos y las restricciones de los informes.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr>{['Código', 'Nombre', 'Superior', 'Nivel', 'Clase', 'Estado', 'Acciones'].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead>
          <tbody>{visibles.map(c => <tr key={c.codigo} className="border-t border-gray-800">
            <td className="p-2">{c.codigo}</td><td className="p-2">{c.nombre}</td><td className="p-2">{c.superior ?? '—'}</td><td className="p-2">{c.nivel}</td><td className="p-2">{clase(c.codigo)}</td><td className="p-2">{c.activo ? 'Activa' : 'Inactiva'}</td>
            <td className="p-2"><div className="flex min-w-64 flex-wrap gap-x-3 gap-y-2">
              <button type="button" disabled={ocupado} className="text-blue-300 underline" onClick={() => { setDetalleCuenta(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Consultar</button>
              <button type="button" disabled={ocupado} className="text-orange-300 underline" onClick={() => editarCuenta(c)}>Editar</button>
              {c.codigo.length < 10 && <button type="button" disabled={ocupado || !c.activo} className="text-green-300 underline disabled:opacity-40" onClick={() => agregarHija(c)}>{accionHija(c.codigo)}</button>}
              <button type="button" disabled={ocupado} className="text-gray-300 underline" onClick={() => void cambiarEstado(c)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
              <button type="button" title={c.bloqueoEliminar ?? 'Eliminar cuenta sin registros ni dependencias'} disabled={ocupado || !!c.bloqueoEliminar} className="text-red-300 underline disabled:opacity-40" onClick={() => void eliminarCuenta(c)}>Eliminar</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      </> : <>
        <form onSubmit={consultar} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Fecha inicial<input type="date" required max={hasta} value={desde} onChange={e => setDesde(e.target.value)} className={campo} /></label>
          <label className="text-sm">Fecha final<input type="date" required min={desde} value={hasta} onChange={e => setHasta(e.target.value)} className={campo} /></label>
          <button disabled={ocupado} className={boton}>Consultar detalle</button>
        </form>
        {informe ? <>
          <p className="text-sm text-gray-400">Período consultado: {fecha(informe.periodo.desde)} al {fecha(informe.periodo.hasta)}</p>
          {vista === 'resultado' && <>
            <h2 className="text-lg font-semibold">Estado de resultados por cuenta</h2>
            <p className="text-sm text-amber-200">{informe.pendientes} registro(s) pendientes de clasificación. Los importes pendientes están incluidos en el total de su clase.</p>
            {!informe.resultado.completo && <p className="text-sm text-amber-200">Resultado parcial por ventas sin costo histórico.</p>}
            <TablaInforme filas={informe.resultadoCuentas} base={informe.resultado.ventasNetas} />
            <p className="rounded-lg bg-gray-900 p-3 font-bold">Resultado del período: {dinero(informe.resultado.resultadoNeto)}</p>
          </>}
          {vista === 'balance' && <>
            <h2 className="text-lg font-semibold">Balance general por cuenta · {fecha(informe.fechaBalance)}</h2>
            <p className="text-sm text-gray-300">Saldos actuales de los activos y obligaciones registrados. El disponible está agrupado hasta completar el desglose de caja y bancos. El patrimonio se calcula como activos menos pasivos.</p>
            {!informe.balanceCompleto && <p className="text-sm text-amber-200">Balance parcial: revisa el saldo inicial y los productos sin costo en Financiero.</p>}
            <TablaInforme filas={informe.balanceCuentas} />
            <details className="rounded-lg border border-gray-700 p-3"><summary>Alcance de los saldos</summary><ul className="mt-3 space-y-2 text-sm">{informe.alcanceBalance.map(f => <li key={f.codigo}>{f.codigo} · {f.nombre}: {dinero(f.monto)}</li>)}</ul></details>
          </>}
          {vista === 'clasificar' && <>
            <h2 className="text-lg font-semibold">Clasificar ingresos y gastos</h2>
            <p className="text-sm text-gray-300">Asigna la subcuenta o auxiliar correspondiente. En las cuentas a crédito se clasifica la obligación original. Ventas y costo de ventas se agrupan por su origen.</p>
            <div className="flex flex-wrap items-center gap-3"><input aria-label="Buscar registro" value={filtroRegistros} onChange={e => setFiltroRegistros(e.target.value)} placeholder="Buscar descripción o categoría" className={campo + ' max-w-md'} /><label className="text-sm"><input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} /> Solo pendientes</label></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Fecha</th><th className="p-2">Registro</th><th className="p-2">Valor</th><th className="p-2">Cuenta PUC</th></tr></thead>
              <tbody>{registros.map(r => <tr key={`${r.origen}:${r.id}`} className="border-t border-gray-800">
                <td className="p-2">{fecha(r.fecha)}</td><td className="p-2">{r.descripcion}<p className="text-xs text-gray-400">{r.origen} #{r.id} · {r.categoria.replaceAll('_', ' ')}</p></td><td className="whitespace-nowrap p-2">{dinero(r.monto)}</td>
                <td className="min-w-64 p-2"><select aria-label={`Cuenta PUC para ${r.descripcion}`} disabled={ocupado} value={r.codigo ?? ''} onChange={e => void asignar(r, e.target.value)} className={campo}>
                  <option value="">Pendiente de clasificar</option>
                  {r.codigo && !hojas.some(c => c.codigo === r.codigo) && <option value={r.codigo}>{r.codigo} · {cuentas.find(c => c.codigo === r.codigo)?.nombre} (histórica)</option>}
                  {hojas.filter(c => c.codigo.startsWith(r.clase)).map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
                </select></td>
              </tr>)}</tbody>
            </table></div>
            {registros.length === 0 && <p>No hay registros que coincidan con los filtros.</p>}
          </>}
        </> : <p className="text-gray-400">Selecciona las fechas y pulsa Consultar detalle.</p>}
      </>}
    </section>
  </main></AuthGuard>;
}
