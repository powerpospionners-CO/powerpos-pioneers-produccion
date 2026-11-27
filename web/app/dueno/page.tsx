'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { exportarCsv } from '@/lib/csv';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const haceDias = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() - n * 86400000));
const input = 'mt-1 block rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-white';
const tarjeta = 'rounded-xl border border-gray-800 bg-gray-900 p-4';
const error = (e: any) => e?.response?.data?.message || 'No se pudo consultar';
const ICONO: Record<string, string> = { DIFERENCIA_CAJA: '💵', ANULACIONES: '↩️', STOCK_BAJO: '📦', SEDE_SIN_DATOS: '⚠️' };

export default function DuenoPage() {
  const [pestana, setPestana] = useState<'hoy' | 'control'>('hoy');
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-5xl space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">Mi negocio</h1>
            <div role="tablist" className="flex gap-2">
              {([['hoy', 'Ventas y alertas'], ['control', 'Control por usuario']] as const).map(([k, t]) => (
                <button key={k} role="tab" aria-selected={pestana === k} type="button" onClick={() => setPestana(k)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${pestana === k ? 'bg-orange-500' : 'bg-gray-800 text-gray-300'}`}>{t}</button>
              ))}
            </div>
          </div>
          {pestana === 'hoy' ? <Resumen /> : <Control />}
        </main>
      </div>
    </AuthGuard>
  );
}

function Resumen() {
  const [fecha, setFecha] = useState(hoy());
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const cargar = useCallback(() => api.get('/dueno/resumen', { params: { fecha } }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(error(e))), [fecha]);
  useEffect(() => {
    void cargar();
    // Hoy se actualiza solo cada minuto; un día pasado no cambia.
    if (fecha !== hoy()) return;
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, [cargar, fecha]);
  const t = datos?.totales;
  return (
    <section className="space-y-4">
      <label className="text-sm text-gray-300">Día<input type="date" max={hoy()} className={input} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      {falla && <p role="alert" className="text-red-400">{falla}</p>}
      {t && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className={tarjeta}><p className="text-xs text-gray-400">Ventas</p><p className="text-2xl font-bold">{moneda(t.ventas)}</p>
              {t.variacion !== null && <p className={`text-sm ${t.variacion >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.variacion >= 0 ? '▲' : '▼'} {Math.abs(t.variacion)} % vs. hace 8 días</p>}</div>
            <div className={tarjeta}><p className="text-xs text-gray-400">Ventas registradas</p><p className="text-2xl font-bold">{t.cantidad}</p></div>
            <div className={tarjeta}><p className="text-xs text-gray-400">Ticket promedio</p><p className="text-2xl font-bold">{moneda(t.ticketPromedio)}</p></div>
            <div className={tarjeta}><p className="text-xs text-gray-400">Cajas abiertas</p><p className="text-2xl font-bold">{t.cajasAbiertas}</p></div>
          </div>
          <div className={tarjeta}>
            <h2 className="mb-2 font-bold">Alertas</h2>
            {datos.alertas.length === 0 ? <p className="text-green-400">Todo en orden.</p> : (
              <ul className="space-y-2 text-sm">
                {datos.alertas.map((a: any, i: number) => <li key={i}>{ICONO[a.tipo] || '•'} <strong>{a.sede}:</strong> {a.texto}</li>)}
              </ul>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {datos.sedes.map((s: any) => (
              <article key={s.sucursalId} className={tarjeta}>
                <header className="flex items-baseline justify-between">
                  <h3 className="font-bold">{s.nombre}</h3>
                  {s.ok && <span className="text-lg font-bold">{moneda(s.ventas)}</span>}
                </header>
                {!s.ok ? <p className="text-sm text-amber-300">Sin datos de esta sede por ahora.</p> : (
                  <>
                    <p className="text-sm text-gray-400">{s.cantidad} ventas · ticket {moneda(s.ticketPromedio)}{s.descuentos > 0 ? ` · descuentos ${moneda(s.descuentos)}` : ''}</p>
                    <Barras valores={s.porHora} />
                    {s.cajasAbiertas.map((c: any) => <p key={c.id} className="text-xs text-gray-400">Caja abierta por {c.cajero} desde las {new Date(c.desde).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}</p>)}
                  </>
                )}
              </article>
            ))}
          </div>
          {datos.sedes.length > 1 && (
            <p className="text-xs text-gray-400">Para ver una sede en detalle, inicia sesión en ella. Las ventas se comparan con el mismo día de la semana anterior.</p>
          )}
        </>
      )}
    </section>
  );
}

// Ventas por hora, de 6 a. m. a 11 p. m.
function Barras({ valores }: { valores: number[] }) {
  const horas = valores.slice(6, 24);
  const max = Math.max(1, ...horas);
  return (
    <div className="mt-3" aria-label="Ventas por hora">
      <div className="flex h-16 items-end gap-0.5">
        {horas.map((v, i) => <div key={i} title={`${i + 6}:00 · ${moneda(v)}`} className="flex-1 rounded-t bg-orange-500/70" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />)}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500"><span>6 a. m.</span><span>12 m.</span><span>6 p. m.</span><span>11 p. m.</span></div>
    </div>
  );
}

function Control() {
  const [rango, setRango] = useState({ desde: haceDias(30), hasta: hoy() });
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const consultar = () => api.get('/dueno/control', { params: rango }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(error(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void consultar(); }, []);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Desde<input type="date" className={input} value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></label>
        <label>Hasta<input type="date" className={input} value={rango.hasta} min={rango.desde} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></label>
        <button type="button" className="rounded-lg bg-orange-500 px-3 py-2 font-bold" onClick={() => void consultar()}>Consultar</button>
        {datos?.personas.length > 0 && <button type="button" className="rounded-lg border border-gray-600 px-3 py-2" onClick={() => exportarCsv(`control-usuarios-${rango.desde}-${rango.hasta}.csv`, ['Persona', 'Rol', 'Sedes', 'Ventas', 'Vendido', 'Descuentos', 'Anulaciones', 'Anulado', 'Devoluciones', 'Devuelto', 'Correcciones de pago', 'Aperturas irregulares', 'Cierres con diferencia', 'Diferencia acumulada', 'Alertas'], datos.personas.map((p: any) => [p.nombre, p.rol, p.sedes.join(', '), p.ventas, p.totalVendido, p.descuentos, p.anulaciones, p.montoAnulado, p.devoluciones, p.montoDevuelto, p.correccionesPago, p.aperturasIrregulares, p.diferenciasCaja, p.faltanteCaja, p.alertas.join(' | ')]))}>Exportar CSV</button>}
      </div>
      {falla && <p role="alert" className="text-red-400">{falla}</p>}
      <p className="text-xs text-gray-400">Las alertas son señales para revisar, no prueba de un error o de un fraude. Las anulaciones se atribuyen a quien anuló; las ventas y descuentos, a quien vendió; las diferencias, al cajero que cerró.</p>
      {datos?.sedesSinDatos?.length > 0 && <p className="text-sm text-amber-300">Sin datos de: {datos.sedesSinDatos.join(', ')}.</p>}
      {datos && (
        <div className="space-y-2">
          {datos.personas.map((p: any) => (
            <article key={p.clave} className={`${tarjeta} ${p.alertas.length ? 'border-amber-600/60' : ''}`}>
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">{p.nombre} <span className="text-xs font-normal text-gray-400">{p.rol} · {p.sedes.join(', ')}</span></h3>
                <span className="font-bold">{moneda(p.totalVendido)} <span className="text-xs font-normal text-gray-400">en {p.ventas} ventas</span></span>
              </header>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-300 md:grid-cols-4">
                <div>Descuentos: <strong>{moneda(p.descuentos)}</strong></div>
                <div>Anulaciones: <strong>{p.anulaciones}</strong> ({moneda(p.montoAnulado)})</div>
                <div>Devoluciones: <strong>{p.devoluciones}</strong> ({moneda(p.montoDevuelto)})</div>
                <div>Correcciones de pago: <strong>{p.correccionesPago}</strong></div>
                <div>Aperturas irregulares: <strong>{p.aperturasIrregulares}</strong></div>
                <div>Cierres con diferencia: <strong>{p.diferenciasCaja}</strong> ({moneda(p.faltanteCaja)})</div>
              </dl>
              {p.alertas.length > 0 && <ul className="mt-2 text-sm text-amber-300">{p.alertas.map((a: string) => <li key={a}>⚠ {a}</li>)}</ul>}
            </article>
          ))}
          {!datos.personas.length && <p className="text-gray-400">Sin movimientos en el periodo.</p>}
        </div>
      )}
    </section>
  );
}
