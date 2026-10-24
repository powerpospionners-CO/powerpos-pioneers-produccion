'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ChevronRight, Clock3, History, LayoutGrid, LogIn, RefreshCw, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { describirAuditoria, type RegistroAuditoria } from '@/lib/auditoria';
import { moneda } from '@/lib/formato';

const fecha = (valor: string) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(valor));
const hora = (valor: string) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(valor));
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const iniciales = (nombre: string) => nombre.split(' ').filter(Boolean).slice(0,2).map(n => n[0]).join('').toUpperCase();
const iconoGrupo = (grupo: string) => grupo === 'Sesiones' ? LogIn : grupo === 'Navegación' ? LayoutGrid : History;

export function DetalleAuditoria({ registro, sucursales, cerrar }: { registro: RegistroAuditoria; sucursales: Record<number, string>; cerrar: () => void }) {
  const info = describirAuditoria(registro);
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', tecla);
    return () => { document.body.style.overflow = anterior; window.removeEventListener('keydown', tecla); };
  }, [cerrar]);
  const sucursal = info.sucursalId ? sucursales[info.sucursalId] || `Sucursal ${info.sucursalId}` : 'Sin sucursal registrada';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={cerrar}>
    <section role="dialog" aria-modal="true" aria-labelledby="titulo-detalle-auditoria" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4 border-b border-gray-800 p-6">
        <div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-orange-400">Detalle de actividad</p><h2 id="titulo-detalle-auditoria" className="text-xl font-semibold text-white">{info.titulo}</h2></div>
        <button autoFocus onClick={cerrar} aria-label="Cerrar detalle" className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"><X size={20} /></button>
      </div>
      <div className="space-y-6 p-6">
        <div className={`flex items-center gap-2 text-sm ${info.fallo ? 'text-amber-300' : 'text-emerald-300'}`}>{info.fallo ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<span>{info.estado}</span></div>
        <p className="leading-relaxed text-gray-200">{info.descripcion}</p>
        {info.gasto && <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4"><h3 className="mb-3 text-sm font-semibold">Gasto registrado</h3><p className="mb-3 text-2xl font-bold">{moneda(info.gasto.monto)}</p><p className="mb-3 text-sm text-gray-300">Categoría: {info.gasto.categoriaNombre}</p><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-gray-500">Fecha del gasto</dt><dd>{fecha(info.gasto.fecha)}</dd></div><div><dt className="text-xs text-gray-500">Origen del dinero</dt><dd>{info.gasto.pagadoConRecaudo ? 'Dinero del recaudo semanal' : 'Otro origen; no se descuenta del recaudo'}</dd></div></dl></div>}
        <dl className="grid gap-5 rounded-xl border border-gray-800 bg-gray-950/50 p-4 sm:grid-cols-2">
          {[['Responsable', info.usuario], ['Rol', info.rol], ['Fecha y hora', `${fecha(registro.creadoEn)} · ${hora(registro.creadoEn)}`], ['Sucursal', sucursal], ['Apartado', info.seccion], ...(info.referencia ? [['Referencia', info.referencia]] : [])].map(([etiqueta, valor]) => <div key={etiqueta}><dt className="mb-1 text-xs text-gray-500">{etiqueta}</dt><dd className="text-sm font-medium text-gray-200">{valor}</dd></div>)}
        </dl>
        {info.cambio && <div><h3 className="mb-3 text-sm font-semibold text-white">Cambio de código de barras</h3><p className="mb-3 text-sm text-gray-400">{info.cambio.nombre}</p><div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]"><div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4"><p className="mb-1 text-xs text-gray-400">Antes</p><p className="break-all font-mono text-sm text-gray-200">{info.cambio.anterior}</p></div><ArrowRight size={18} className="mx-auto text-gray-500" /><div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="mb-1 text-xs text-emerald-400">Después</p><p className="break-all font-mono text-sm text-white">{info.cambio.nuevo}</p></div></div></div>}
        {info.campos.length > 0 && <div><h3 className="mb-3 text-sm font-semibold text-white">Datos incluidos en la actualización</h3><div className="flex flex-wrap gap-2">{info.campos.map(campo => <span key={campo} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300">{campo}</span>)}</div><p className="mt-3 text-xs leading-relaxed text-gray-500">Este registro identifica los datos enviados. Los valores anteriores solo aparecen cuando se guardaron en la auditoría.</p></div>}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-gray-800 px-6 py-4"><span className="text-xs text-gray-500">Actividad n.º {registro.id} · Hora de Colombia</span><button onClick={cerrar} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700">Cerrar</button></div>
    </section>
  </div>;
}

type Props = { registros: RegistroAuditoria[]; sucursales: Record<number, string>; cargando: boolean; error: string; incluirConsultas: boolean; cambiarConsultas: (valor: boolean) => void; actualizar: () => void; anteriores?: () => void };
export default function AuditoriaActividad({ registros, sucursales, cargando, error, incluirConsultas, cambiarConsultas, actualizar, anteriores }: Props) {
  const [buscar, setBuscar] = useState('');
  const [grupo, setGrupo] = useState('Todas');
  const [seleccion, setSeleccion] = useState<RegistroAuditoria | null>(null);
  const actividades = useMemo(() => registros.map(registro => ({ registro, info: describirAuditoria(registro) })), [registros]);
  const visibles = actividades.filter(({ info }) => (grupo === 'Todas' || info.grupo === grupo) && normalizar(`${info.usuario} ${info.rol} ${info.titulo} ${info.descripcion} ${info.seccion}`).includes(normalizar(buscar)));
  const personas = new Set(actividades.map(a => a.registro.detalle?.actor?.id || a.info.usuario)).size;
  const errores = actividades.filter(a => a.info.fallo).length;
  return <div className="mx-auto max-w-6xl px-4 py-7 md:px-6 md:py-9">
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-orange-400"><ShieldCheck size={24} /></div><div><h1 className="text-2xl font-bold tracking-tight text-white">Auditoría de la empresa</h1><p className="mt-1 text-sm text-gray-400">Quién hizo qué y cuándo, dentro de tu empresa.</p></div></div><button disabled={cargando} onClick={actualizar} className="inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-medium text-gray-200 hover:border-gray-500 disabled:opacity-50"><RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />{cargando ? 'Actualizando…' : 'Actualizar'}</button></header>
    <div className="mb-6 grid grid-cols-3 gap-3">{[{ titulo: 'Actividades', valor: registros.length, icono: History }, { titulo: 'Personas', valor: personas, icono: UserRound }, { titulo: 'Sin completar', valor: errores, icono: AlertCircle }].map(({ titulo, valor, icono: Icono }) => <div key={titulo} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4"><div className="mb-2 flex items-center gap-2 text-xs text-gray-400"><Icono size={15} /><span>{titulo}</span></div><p className="text-2xl font-semibold text-white">{valor}</p></div>)}</div>
    <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/50">
      <div className="space-y-4 border-b border-gray-800 p-4 md:p-5"><div className="flex flex-wrap items-center gap-3"><div className="relative min-w-0 flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-3 text-gray-500" /><input aria-label="Buscar actividades en esta página" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar persona, acción o apartado…" className="w-full rounded-xl border border-gray-700 bg-gray-950/60 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-orange-500 focus:outline-none" /></div><label className="text-xs text-gray-400"><input type="checkbox" checked={incluirConsultas} onChange={e => cambiarConsultas(e.target.checked)} className="mr-2 accent-orange-500" />Mostrar consultas automáticas</label></div><div className="flex flex-wrap gap-2">{['Todas', 'Cambios', 'Sesiones', 'Navegación'].map(opcion => <button key={opcion} onClick={() => setGrupo(opcion)} aria-pressed={grupo === opcion} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${grupo === opcion ? 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/25' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>{opcion}</button>)}</div></div>
      {error && <div role="alert" className="m-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle size={17} />{error}</div>}
      <div className="hidden grid-cols-[130px_220px_minmax(0,1fr)_120px] gap-5 border-b border-gray-800 px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 lg:grid"><span>Cuándo</span><span>Responsable</span><span>Actividad</span><span className="text-right">Detalle</span></div>
      <div className={`divide-y divide-gray-800/80 ${cargando ? 'opacity-60' : ''}`} aria-busy={cargando}>{visibles.map(({ registro, info }) => {
        const Icono = iconoGrupo(info.grupo);
        const sucursal = info.sucursalId ? sucursales[info.sucursalId] || `Sucursal ${info.sucursalId}` : '';
        return <article key={registro.id} className="grid items-center gap-4 px-4 py-5 transition-colors hover:bg-gray-800/30 lg:grid-cols-[130px_220px_minmax(0,1fr)_120px] lg:gap-5 lg:px-5">
          <div className="flex items-center gap-2 text-xs text-gray-500 lg:block"><span className="font-medium text-gray-300">{fecha(registro.creadoEn)}</span><span className="lg:mt-1 lg:block">{hora(registro.creadoEn)}</span></div>
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-gray-300">{iniciales(info.usuario)}</div><div className="min-w-0"><p className="break-words text-sm font-medium text-gray-200">{info.usuario}</p><p className="mt-0.5 text-xs text-gray-500">{info.rol}{sucursal ? ` · ${sucursal}` : ''}</p></div></div>
          <div className="min-w-0"><div className="mb-1.5 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400"><Icono size={11} />{info.seccion}</span>{info.fallo && <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">Sin completar</span>}</div><h2 className="text-sm font-semibold text-gray-100">{info.titulo}</h2><p className="mt-1 break-words text-xs leading-relaxed text-gray-400">{info.descripcion}</p></div>
          <button onClick={() => setSeleccion(registro)} aria-label={`Ver detalle: ${info.titulo}`} className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-300 hover:border-orange-500/50 hover:text-orange-300 lg:justify-self-end">Ver detalle<ChevronRight size={14} /></button>
        </article>;
      })}</div>
      {!visibles.length && <div className="flex flex-col items-center px-5 py-14 text-center"><History size={30} className="mb-3 text-gray-600" /><p className="text-sm font-medium text-gray-300">{cargando ? 'Cargando actividad…' : 'No hay actividades para mostrar'}</p><p className="mt-1 text-xs text-gray-500">{buscar || grupo !== 'Todas' ? 'Prueba otro nombre o cambia el filtro.' : 'Los nuevos movimientos aparecerán aquí.'}</p></div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 px-5 py-4"><p className="text-xs text-gray-500">{visibles.length} de {registros.length} actividades en esta página · Hora de Colombia</p>{anteriores && <button disabled={cargando} onClick={anteriores} className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 disabled:opacity-50"><Clock3 size={14} />Ver anteriores</button>}</footer>
    </section>
    <p className="mt-4 text-xs leading-relaxed text-gray-500">Historial disponible desde la activación de la auditoría. Las contraseñas y los códigos de acceso permanecen ocultos.</p>
    {seleccion && <DetalleAuditoria registro={seleccion} sucursales={sucursales} cerrar={() => setSeleccion(null)} />}
  </div>;
}
