'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Banknote, Boxes, CheckCircle2, DollarSign, Receipt, RotateCcw, Store, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { exportarCsv } from '@/lib/csv';
import { Aviso, Indicador, Pagina, Pestanas, Tarjeta, Vacio, ui } from '@/components/ui/Panel';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const haceDias = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() - n * 86400000));
const error = (e: any) => e?.response?.data?.message || 'No se pudo consultar';
const ICONO_ALERTA: Record<string, { icono: typeof AlertTriangle; color: string }> = {
  DIFERENCIA_CAJA: { icono: Banknote, color: 'text-red-400 bg-red-500/10' },
  ANULACIONES: { icono: RotateCcw, color: 'text-yellow-400 bg-yellow-500/10' },
  STOCK_BAJO: { icono: Boxes, color: 'text-orange-400 bg-orange-500/10' },
  SEDE_SIN_DATOS: { icono: AlertTriangle, color: 'text-gray-400 bg-gray-800' },
};
const PESTANAS = [['hoy', 'Ventas y alertas'], ['control', 'Control por usuario']] as const;

export default function DuenoPage() {
  const [pestana, setPestana] = useState<'hoy' | 'control'>('hoy');
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col text-white">
        <Navbar />
        <Pagina titulo="Mi negocio" descripcion="Ventas del día, alertas y control del personal en todas tus sedes." acciones={<Pestanas opciones={PESTANAS} valor={pestana} onCambio={setPestana} />}>
          {pestana === 'hoy' ? <Resumen /> : <Control />}
        </Pagina>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className={ui.etiqueta}>Día</label><input type="date" max={hoy()} className={ui.input} value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        {fecha === hoy() && <span className="pb-2 text-xs text-gray-500">Se actualiza cada minuto</span>}
      </div>
      {falla && <Aviso tipo="error">{falla}</Aviso>}
      {t && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Indicador icono={DollarSign} etiqueta="Ventas" valor={moneda(t.ventas)} tono="naranja" detalle={t.variacion !== null ? (
              <span className={`inline-flex items-center gap-1 ${t.variacion >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.variacion >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{Math.abs(t.variacion)} % vs. el mismo día de la semana pasada</span>
            ) : <span className="text-gray-500">Sin ventas la semana pasada</span>} />
            <Indicador icono={Receipt} etiqueta="Ventas registradas" valor={t.cantidad} />
            <Indicador icono={TrendingUp} etiqueta="Ticket promedio" valor={moneda(t.ticketPromedio)} />
            <Indicador icono={Wallet} etiqueta="Cajas abiertas" valor={t.cajasAbiertas} tono={t.cajasAbiertas ? 'verde' : 'gris'} />
          </div>

          <Tarjeta titulo="Alertas" sinRelleno>
            {datos.alertas.length === 0 ? (
              <div className="flex items-center gap-3 p-4 text-sm text-green-400"><CheckCircle2 size={18} /> Todo en orden.</div>
            ) : (
              <ul>
                {datos.alertas.map((a: any, i: number) => {
                  const { icono: Icono, color } = ICONO_ALERTA[a.tipo] || ICONO_ALERTA.SEDE_SIN_DATOS;
                  return (
                    <li key={i} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-gray-800' : ''}`}>
                      <span className={`rounded-lg p-2 ${color}`}><Icono size={16} /></span>
                      <span className="text-sm text-gray-200"><span className="font-semibold text-white">{a.sede}</span><span className="mx-2 text-gray-600">·</span>{a.texto}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>

          <div className="grid gap-4 lg:grid-cols-2">
            {datos.sedes.map((s: any) => (
              <Tarjeta key={s.sucursalId} titulo={<h2 className="flex items-center gap-2 font-semibold text-white"><Store size={16} className="text-orange-400" />{s.nombre}</h2>} acciones={s.ok ? <span className="text-lg font-bold text-white">{moneda(s.ventas)}</span> : undefined}>
                {!s.ok ? <p className="text-sm text-yellow-300">Sin datos de esta sede por ahora.</p> : (
                  <div className="space-y-4">
                    <dl className="grid grid-cols-3 gap-3 text-sm">
                      <div><dt className="text-gray-500">Ventas</dt><dd className="font-semibold text-white">{s.cantidad}</dd></div>
                      <div><dt className="text-gray-500">Ticket</dt><dd className="font-semibold text-white">{moneda(s.ticketPromedio)}</dd></div>
                      <div><dt className="text-gray-500">Descuentos</dt><dd className="font-semibold text-white">{moneda(s.descuentos)}</dd></div>
                    </dl>
                    <Barras valores={s.porHora} />
                    {s.cajasAbiertas.length > 0 && (
                      <ul className="space-y-1 border-t border-gray-800 pt-3 text-xs text-gray-400">
                        {s.cajasAbiertas.map((c: any) => <li key={c.id} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" />Caja abierta por {c.cajero} desde las {new Date(c.desde).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </Tarjeta>
            ))}
          </div>
          {datos.sedes.length > 1 && <p className="text-xs text-gray-500">Para ver una sede en detalle, inicia sesión en ella.</p>}
        </>
      )}
      {!datos && !falla && <Vacio>Cargando…</Vacio>}
    </div>
  );
}

// Ventas por hora, de 6 a. m. a 11 p. m.
function Barras({ valores }: { valores: number[] }) {
  const horas = valores.slice(6, 24);
  const max = Math.max(1, ...horas);
  return (
    <div aria-label="Ventas por hora">
      <p className="mb-2 text-xs text-gray-500">Ventas por hora</p>
      <div className="flex h-20 items-end gap-1 rounded-lg bg-gray-950/50 p-2">
        {horas.map((v, i) => <div key={i} title={`${i + 6}:00 · ${moneda(v)}`} className={`flex-1 rounded-t ${v > 0 ? 'bg-orange-500/80' : 'bg-gray-800'}`} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>6 a. m.</span><span>12 m.</span><span>6 p. m.</span><span>11 p. m.</span></div>
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
  const conAlertas = (datos?.personas || []).filter((p: any) => p.alertas.length).length;
  return (
    <div className="space-y-6">
      {falla && <Aviso tipo="error">{falla}</Aviso>}
      {datos?.sedesSinDatos?.length > 0 && <Aviso tipo="alerta">Sin datos de: {datos.sedesSinDatos.join(', ')}.</Aviso>}
      {datos && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Indicador icono={Users} etiqueta="Personas con movimientos" valor={datos.personas.length} />
          <Indicador icono={AlertTriangle} etiqueta="Con señales para revisar" valor={conAlertas} tono={conAlertas ? 'amarillo' : 'gris'} />
        </div>
      )}
      <Tarjeta sinRelleno titulo="Control por usuario" acciones={
        <>
          <div><label className={ui.etiqueta}>Desde</label><input type="date" className={ui.input} value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></div>
          <div><label className={ui.etiqueta}>Hasta</label><input type="date" className={ui.input} value={rango.hasta} min={rango.desde} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></div>
          <button type="button" className={ui.primario} onClick={() => void consultar()}>Consultar</button>
          {datos?.personas.length > 0 && <button type="button" className={ui.secundario} onClick={() => exportarCsv(`control-usuarios-${rango.desde}-${rango.hasta}.csv`, ['Persona', 'Rol', 'Sedes', 'Ventas', 'Vendido', 'Descuentos', 'Anulaciones', 'Anulado', 'Devoluciones', 'Devuelto', 'Correcciones de pago', 'Aperturas irregulares', 'Cierres con diferencia', 'Diferencia acumulada', 'Alertas'], datos.personas.map((p: any) => [p.nombre, p.rol, p.sedes.join(', '), p.ventas, p.totalVendido, p.descuentos, p.anulaciones, p.montoAnulado, p.devoluciones, p.montoDevuelto, p.correccionesPago, p.aperturasIrregulares, p.diferenciasCaja, p.faltanteCaja, p.alertas.join(' | ')]))}>Exportar CSV</button>}
        </>
      }>
        <p className="border-b border-gray-800 px-4 py-3 text-xs text-gray-500">Las alertas son señales para revisar, no prueba de un error. Las anulaciones se atribuyen a quien anuló; ventas y descuentos, a quien vendió; las diferencias, al cajero que cerró.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr>
                <th className={ui.th}>Persona</th><th className={ui.thNum}>Vendido</th><th className={ui.thNum}>Descuentos</th><th className={ui.thNum}>Anulaciones</th>
                <th className={ui.thNum}>Devoluciones</th><th className={ui.thNum}>Correcciones</th><th className={ui.thNum}>Aperturas irreg.</th><th className={ui.thNum}>Diferencias de caja</th>
              </tr>
            </thead>
            <tbody>
              {(datos?.personas || []).map((p: any) => (
                <tr key={p.clave} className={ui.fila}>
                  <td className={ui.td}>
                    <div className="font-medium text-white">{p.nombre}</div>
                    <div className="text-xs text-gray-500">{p.rol} · {p.sedes.join(', ')}</div>
                    {p.alertas.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{p.alertas.map((a: string) => <span key={a} className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400">{a}</span>)}</div>}
                  </td>
                  <td className={ui.tdNum}>{moneda(p.totalVendido)}<div className="text-xs text-gray-500">{p.ventas} ventas</div></td>
                  <td className={ui.tdNum}>{moneda(p.descuentos)}</td>
                  <td className={ui.tdNum}>{p.anulaciones}<div className="text-xs text-gray-500">{moneda(p.montoAnulado)}</div></td>
                  <td className={ui.tdNum}>{p.devoluciones}<div className="text-xs text-gray-500">{moneda(p.montoDevuelto)}</div></td>
                  <td className={ui.tdNum}>{p.correccionesPago}</td>
                  <td className={ui.tdNum}>{p.aperturasIrregulares}</td>
                  <td className={`${ui.tdNum} ${p.faltanteCaja < 0 ? 'text-red-400' : ''}`}>{p.diferenciasCaja}<div className="text-xs text-gray-500">{moneda(p.faltanteCaja)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {datos && !datos.personas.length && <Vacio>Sin movimientos en el periodo.</Vacio>}
          {!datos && !falla && <Vacio>Cargando…</Vacio>}
        </div>
      </Tarjeta>
    </div>
  );
}
