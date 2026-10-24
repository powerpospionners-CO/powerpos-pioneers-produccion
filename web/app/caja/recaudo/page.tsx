'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { moneda } from '@/lib/formato';
import { useNotificar } from '@/components/Notificaciones';
import { useAuthStore } from '@/store/authStore';

type Retiro = {
  id: number;
  cajaId: number;
  esperado: number;
  retirado: number;
  diferencia: number;
  fecha: string;
  cajero: string;
  registradoPor: string;
  cerradoEn: string | null;
};

type ResumenRecaudo = {
  periodoInicio: string;
  periodoFin: string;
  sucursalNombre: string;
  baseEfectivoCaja: number;
  semanaCompleta: boolean;
  ventasEfectivo: number;
  efectivoRecaudado: number;
  gastosDelRecaudo: number;
  saldoDespuesGastos: number;
  disponibleConsignar: number;
  faltanteParaGastos: number;
  gastos: { id: number; descripcion: string; monto: number; fecha: string; registradoPor: string }[];
  diferenciaRecaudo: number;
  retiros: Retiro[];
  consignacion: {
    montoConsignado: number;
    diferencia: number;
    fechaConsignacion: string;
    referencia: string | null;
    usuario: string;
    esperadoAlRegistrar: number;
    gastosAlRegistrar: number | null;
  } | null;
};

type Configuracion = {
  habilitado: boolean;
  sucursalNombre: string;
  baseEfectivoCaja: number | null;
};

const fechaLocal = (fecha: Date) => {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

const sumarDias = (fecha: string, dias: number) => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const resultado = new Date(anio, mes - 1, dia + dias);
  return fechaLocal(resultado);
};

const lunesDe = (fecha: Date) => {
  const resultado = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diferencia = (resultado.getDay() + 6) % 7;
  resultado.setDate(resultado.getDate() - diferencia);
  return fechaLocal(resultado);
};

const lunesInicial = () => {
  const hoy = new Date();
  const lunes = lunesDe(hoy);
  return hoy.getDay() === 1 ? sumarDias(lunes, -7) : lunes;
};

const fechaCorta = (valor: string) =>
  new Date(`${valor}T12:00:00`).toLocaleDateString('es-CO');

export default function RecaudoSemanalPage() {
  const { aviso } = useNotificar();
  const usuario = useAuthStore((state) => state.usuario);
  const [configuracion, setConfiguracion] = useState<Configuracion | null>(null);
  const [resumen, setResumen] = useState<ResumenRecaudo | null>(null);
  const [periodoInicio, setPeriodoInicio] = useState(lunesInicial);
  const [fechaConsignacion, setFechaConsignacion] = useState(() => fechaLocal(new Date()));
  const [montoConsignado, setMontoConsignado] = useState('');
  const [referencia, setReferencia] = useState('');
  const [base, setBase] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async (inicio = periodoInicio) => {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/caja/recaudo/semanal', {
        params: { periodoInicio: inicio },
      });
      setResumen(data);
      setMontoConsignado(String(data.disponibleConsignar ?? data.efectivoRecaudado));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cargar el recaudo de la semana.');
      setResumen(null);
    } finally {
      setCargando(false);
    }
  }, [periodoInicio]);

  useEffect(() => {
    api.get('/caja/recaudo/configuracion')
      .then(({ data }) => {
        setConfiguracion(data);
        if (data.baseEfectivoCaja !== null) setBase(String(data.baseEfectivoCaja));
        if (!data.habilitado) setError('El recaudo semanal no está habilitado para esta empresa.');
      })
      .catch((e) => setError(e?.response?.data?.message || 'No se pudo cargar la configuración del recaudo.'));
  }, []);

  useEffect(() => {
    if (configuracion?.habilitado && configuracion.baseEfectivoCaja !== null) {
      void cargar();
    }
  }, [configuracion, cargar]);

  const cambiarSemana = (dias: number) => {
    const siguiente = sumarDias(periodoInicio, dias);
    if (siguiente > lunesDe(new Date())) return;
    setPeriodoInicio(siguiente);
  };

  const guardarBase = async (e: FormEvent) => {
    e.preventDefault();
    if (base === '' || !Number.isFinite(Number(base)) || Number(base) < 0) return;
    setGuardando(true);
    try {
      const { data } = await api.patch('/caja/recaudo/configuracion', {
        baseEfectivoCaja: Number(base),
      });
      setConfiguracion(data);
      aviso('La base fija de caja quedó guardada.', 'exito');
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo guardar la base fija.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const guardarConsignacion = async (e: FormEvent) => {
    e.preventDefault();
    if (!resumen || montoConsignado === '') return;
    setGuardando(true);
    try {
      await api.post('/caja/recaudo/consignar', {
        periodoInicio,
        montoConsignado: Number(montoConsignado),
        fechaConsignacion,
        referencia,
      });
      aviso('La consignación semanal quedó registrada.', 'exito');
      await cargar();
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo registrar la consignación.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const esAdmin = usuario?.rol === 'ADMIN_EMPRESA';
  const consignacionPendiente = !!resumen?.semanaCompleta && !resumen.consignacion;

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
          <header className="flex items-center gap-3">
            <Wallet className="text-orange-500" size={25} />
            <div>
              <h1 className="text-2xl font-bold">Recaudo semanal</h1>
              <p className="text-sm text-gray-400">
                {configuracion?.sucursalNombre || 'Sucursal'} · El fondo fijo se queda en caja y no se consigna.
              </p>
            </div>
          </header>

          {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

          {configuracion?.habilitado && (configuracion.baseEfectivoCaja === null || esAdmin) && (
            <section className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5">
              <h2 className="font-semibold text-yellow-200">{configuracion.baseEfectivoCaja === null ? 'Configura la base fija de cambio' : 'Base fija de cambio'}</h2>
              <p className="mt-1 text-sm text-gray-400">Este monto se dejará en la gaveta después de retirar las ventas en efectivo. No se suma al recaudo de la semana.</p>
              {esAdmin ? (
                <form onSubmit={guardarBase} className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="text-sm text-gray-300">Base fija por día
                    <input type="number" min={0} step="0.01" value={base} onChange={(e) => setBase(e.target.value)} className="mt-1 block w-48 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                  </label>
                  <button disabled={guardando || base === ''} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar base fija'}</button>
                </form>
              ) : <p className="mt-3 text-sm text-yellow-200">Pídele al administrador de la empresa que configure la base fija antes de abrir caja.</p>}
            </section>
          )}

          {configuracion?.habilitado && configuracion.baseEfectivoCaja !== null && (
            <>
              <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Período de ventas en efectivo</h2>
                    <p className="mt-1 text-sm text-gray-400">De lunes {fechaCorta(periodoInicio)} a domingo {resumen ? fechaCorta(resumen.periodoFin) : fechaCorta(sumarDias(periodoInicio, 6))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => cambiarSemana(-7)} aria-label="Semana anterior" className="rounded-lg border border-gray-700 p-2 hover:border-orange-500"><ChevronLeft size={18} /></button>
                    <span className="min-w-28 text-center text-sm">{fechaCorta(periodoInicio)}</span>
                    <button type="button" onClick={() => cambiarSemana(7)} disabled={sumarDias(periodoInicio, 7) > lunesDe(new Date())} aria-label="Semana siguiente" className="rounded-lg border border-gray-700 p-2 hover:border-orange-500 disabled:opacity-40"><ChevronRight size={18} /></button>
                  </div>
                </div>
                {cargando ? <p className="py-8 text-center text-gray-400">Cargando recaudos…</p> : resumen && (
                  <>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-gray-800 p-4"><p className="text-xs text-gray-400">Base diaria fija</p><p className="mt-1 text-lg font-bold">{moneda(resumen.baseEfectivoCaja)}</p></div>
                      <div className="rounded-xl border border-gray-800 p-4"><p className="text-xs text-gray-400">Ventas en efectivo</p><p className="mt-1 text-lg font-bold">{moneda(resumen.ventasEfectivo)}</p></div>
                      <div className="rounded-xl border border-gray-800 p-4"><p className="text-xs text-gray-400">Efectivo retirado</p><p className="mt-1 text-lg font-bold">{moneda(resumen.efectivoRecaudado)}</p></div>
                      <div className={`rounded-xl border p-4 ${resumen.diferenciaRecaudo === 0 ? 'border-green-500/30' : 'border-yellow-500/30'}`}><p className="text-xs text-gray-400">Diferencia de retiros</p><p className="mt-1 text-lg font-bold">{moneda(resumen.diferenciaRecaudo)}</p></div>
                    </div>

                    <div className="mt-4 rounded-xl border border-orange-500/25 bg-orange-500/5 p-4">
                      <div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-gray-400">Efectivo retirado de caja</p><p className="mt-1 font-semibold">{moneda(resumen.efectivoRecaudado)}</p></div><div><p className="text-xs text-gray-400">Menos gastos pagados del recaudo</p><p className="mt-1 font-semibold text-orange-300">− {moneda(resumen.gastosDelRecaudo ?? 0)}</p></div><div><p className="text-xs text-gray-300">Disponible para consignar</p><p className="mt-1 text-xl font-bold text-green-300">{moneda(resumen.disponibleConsignar ?? resumen.efectivoRecaudado)}</p></div></div>
                      <p className="mt-3 text-xs text-gray-400">Solo se descuentan los gastos marcados como “Pagado con dinero del recaudo”, por su fecha y sucursal. La base fija no se utiliza.</p>
                      {resumen.faltanteParaGastos > 0 && <p role="alert" className="mt-3 text-sm text-yellow-300">Los gastos superan el efectivo retirado en {moneda(resumen.faltanteParaGastos)}. Revisa cómo se cubrió ese faltante.</p>}
                    </div>
                    {(resumen.gastos?.length ?? 0) > 0 && <details className="mt-4 rounded-xl border border-gray-800 p-4"><summary className="cursor-pointer text-sm font-medium">Ver gastos descontados ({resumen.gastos.length})</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-gray-400"><tr><th className="p-2">Fecha</th><th className="p-2">Gasto</th><th className="p-2">Registrado por</th><th className="p-2 text-right">Valor</th></tr></thead><tbody>{resumen.gastos.map(g => <tr key={g.id} className="border-t border-gray-800"><td className="p-2">{new Date(g.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</td><td className="p-2">{g.descripcion}</td><td className="p-2">{g.registradoPor}</td><td className="p-2 text-right">{moneda(g.monto)}</td></tr>)}</tbody></table></div></details>}
                    {resumen.retiros.length > 0 ? (
                      <div className="mt-5 overflow-x-auto rounded-xl border border-gray-800">
                        <table className="w-full text-left text-sm">
                          <thead className="border-b border-gray-800 text-gray-400"><tr><th className="px-3 py-2">Cierre</th><th className="px-3 py-2">Cajero</th><th className="px-3 py-2">Registró retiro</th><th className="px-3 py-2 text-right">Ventas efectivo</th><th className="px-3 py-2 text-right">Retirado</th><th className="px-3 py-2 text-right">Diferencia</th></tr></thead>
                          <tbody>{resumen.retiros.map((retiro) => <tr key={retiro.id} className="border-b border-gray-800 last:border-0"><td className="px-3 py-2">{retiro.cerradoEn ? new Date(retiro.cerradoEn).toLocaleString('es-CO') : new Date(retiro.fecha).toLocaleString('es-CO')}</td><td className="px-3 py-2">{retiro.cajero}</td><td className="px-3 py-2">{retiro.registradoPor}</td><td className="px-3 py-2 text-right">{moneda(retiro.esperado)}</td><td className="px-3 py-2 text-right">{moneda(retiro.retirado)}</td><td className={`px-3 py-2 text-right ${retiro.diferencia === 0 ? 'text-green-400' : 'text-yellow-300'}`}>{moneda(retiro.diferencia)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    ) : <p className="mt-5 rounded-xl border border-gray-800 p-4 text-sm text-gray-400">Aún no hay retiros de efectivo registrados para esta semana.</p>}

                    {resumen.consignacion ? (
                      <div className="mt-5 rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                        <h3 className="font-semibold text-green-300">Consignación registrada</h3>
                        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                          <p>Fecha: <strong>{new Date(resumen.consignacion.fechaConsignacion).toLocaleDateString('es-CO')}</strong></p>
                          <p>Consignado: <strong>{moneda(resumen.consignacion.montoConsignado)}</strong></p>
                          <p>Diferencia frente al valor esperado al registrar: <strong className={resumen.consignacion.diferencia === 0 ? 'text-green-300' : 'text-yellow-300'}>{moneda(resumen.consignacion.diferencia)}</strong></p>
                          <p>Esperado al registrar: <strong>{moneda(resumen.consignacion.esperadoAlRegistrar)}</strong></p>
                          {resumen.consignacion.gastosAlRegistrar !== null && <p>Gastos descontados al registrar: <strong>{moneda(resumen.consignacion.gastosAlRegistrar)}</strong></p>}
                          <p>Registró: <strong>{resumen.consignacion.usuario}</strong></p>
                          {resumen.consignacion.referencia && <p className="sm:col-span-2">Referencia: <strong>{resumen.consignacion.referencia}</strong></p>}
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={guardarConsignacion} className="mt-5 rounded-xl border border-gray-800 p-4">
                        <h3 className="font-semibold">Registrar envío a la cuenta de la empresa</h3>
                        <p className="mt-1 text-sm text-gray-400">Valor esperado para consignar: <strong className="text-white">{moneda(resumen.disponibleConsignar ?? resumen.efectivoRecaudado)}</strong> (efectivo retirado menos gastos pagados del recaudo; excluye la base fija).</p>
                        {!resumen.semanaCompleta && <p className="mt-2 text-sm text-yellow-200">El período aún no termina; la consignación se habilita al finalizar el domingo.</p>}
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <label className="text-sm text-gray-300">Fecha del envío
                            <input type="date" value={fechaConsignacion} max={fechaLocal(new Date())} onChange={(e) => setFechaConsignacion(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                          </label>
                          <label className="text-sm text-gray-300">Valor consignado
                            <input type="number" min={0} step="0.01" value={montoConsignado} onChange={(e) => setMontoConsignado(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                          </label>
                          <label className="text-sm text-gray-300">Referencia o comprobante
                            <input type="text" maxLength={120} value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Opcional" className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                          </label>
                        </div>
                        <button type="submit" disabled={guardando || !consignacionPendiente || montoConsignado === ''} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><ArrowDownToLine size={16} />{guardando ? 'Guardando…' : 'Guardar consignación'}</button>
                      </form>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
