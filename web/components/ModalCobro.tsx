'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Plus, Trash2, X, Banknote, CreditCard, ArrowLeftRight, Smartphone } from 'lucide-react';
import { moneda } from '@/lib/formato';
import MontoRecibido from './MontoRecibido';

const METODOS = [
  { value: 'EFECTIVO', label: 'Efectivo', icono: Banknote },
  { value: 'TARJETA', label: 'Tarjeta', icono: CreditCard },
  { value: 'TRANSFERENCIA', label: 'Transferencia', icono: ArrowLeftRight },
  { value: 'NEQUI', label: 'Nequi', icono: Smartphone },
  { value: 'DAVIPLATA', label: 'Daviplata', icono: Smartphone },
];

function MarcaPago({ metodo, grande = false }: { metodo: string; grande?: boolean }) {
  const logo = ({ EFECTIVO: '/efectivo/billete-50000.png', TRANSFERENCIA: '/pagos/transferencia.svg', NEQUI: '/pagos/nequi.svg', DAVIPLATA: '/pagos/daviplata.png', DAVIVIENDA: '/pagos/davivienda.svg' } as Record<string, string>)[metodo];
  const Icono = METODOS.find((m) => m.value === metodo)?.icono || ArrowLeftRight;
  return <span className={`flex shrink-0 items-center justify-center rounded-xl ${metodo === 'DAVIPLATA' || metodo === 'DAVIVIENDA' ? 'bg-[#ed1c24] p-2' : logo ? 'bg-white p-2' : 'bg-white/10 text-orange-300'} ${grande ? 'h-20 w-48' : 'h-11 w-20'}`}>
    {logo ? <Image src={logo} alt="" width={180} height={60} unoptimized className="h-full w-full object-contain" /> : <Icono size={grande ? 36 : 24} />}
  </span>;
}

export type PagoConfirmado = { metodoPago: string; pagos: { metodoPago: string; monto: number }[]; cambio: number; condicionPago?: "CREDITO"; vencimientoCredito?: string };

export type BorradorCobro = { credito: boolean; abonoInicial?: boolean; vencimiento: string; mixto: boolean; metodoUnico: string; recibidoUnico: number; bancoTransferencia: string; lineas: { metodoPago: string; monto: string }[]; recibidosMixto: Record<number, number> };

type Linea = { metodoPago: string; monto: string };

export default function ModalCobro({ total, procesando, onConfirmar, onCancelar, titulo = 'Cobrar venta', textoConfirmar = 'Confirmar cobro', textoCancelar = 'Cancelar', metodoInicial = 'EFECTIVO', pagosIniciales, permitirCredito = false, opcionesImpresion, borradorInicial, onBorradorChange }: {
  borradorInicial?: BorradorCobro | null;
  onBorradorChange?: (borrador: BorradorCobro) => void;
  total: number;
  permitirCredito?: boolean;
  opcionesImpresion?: ReactNode;
  procesando?: boolean;
  onConfirmar: (pago: PagoConfirmado) => void;
  onCancelar: () => void;
  titulo?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  metodoInicial?: string;
  pagosIniciales?: { metodoPago: string; monto: string | number }[];
}) {
  const [credito, setCredito] = useState(permitirCredito && (borradorInicial?.credito ?? false));
  const [abonoInicial, setAbonoInicial] = useState(borradorInicial?.abonoInicial ?? false);
  const [vencimiento, setVencimiento] = useState(borradorInicial?.vencimiento ?? (''));
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const yaEraMixto = metodoInicial === 'MIXTO' && Array.isArray(pagosIniciales) && pagosIniciales.length > 1;
  const [mixto, setMixto] = useState(borradorInicial?.mixto ?? (yaEraMixto));
  const [metodoUnico, setMetodoUnico] = useState(borradorInicial?.metodoUnico ?? (metodoInicial === 'MIXTO' ? 'EFECTIVO' : metodoInicial));
  const [recibidoUnico, setRecibidoUnico] = useState(borradorInicial?.recibidoUnico ?? (0));
  const [bancoTransferencia, setBancoTransferencia] = useState(borradorInicial?.bancoTransferencia ?? ('TRANSFERENCIA'));
  const [lineas, setLineas] = useState<Linea[]>(
    borradorInicial?.lineas ?? (yaEraMixto
      ? pagosIniciales!.map((p) => ({ metodoPago: p.metodoPago, monto: String(p.monto) }))
      : [{ metodoPago: 'EFECTIVO', monto: String(total) }, { metodoPago: 'TRANSFERENCIA', monto: '0' }]),
  );
  const [recibidosMixto, setRecibidosMixto] = useState<Record<number, number>>(borradorInicial?.recibidosMixto ?? {});

  useEffect(() => {
    onBorradorChange?.({ credito, abonoInicial, vencimiento, mixto, metodoUnico, recibidoUnico, bancoTransferencia, lineas, recibidosMixto });
  }, [credito, abonoInicial, vencimiento, mixto, metodoUnico, recibidoUnico, bancoTransferencia, lineas, recibidosMixto, onBorradorChange]);

  const sumaLineas = lineas.reduce((acc, l) => acc + (Number(l.monto) || 0), 0);
  const resta = Math.round((total - sumaLineas) * 100) / 100;

  const metodosDisponibles = (indiceActual: number) => METODOS.filter((m) => !lineas.some((l, i) => i !== indiceActual && l.metodoPago === m.value));

  const actualizarLinea = (indice: number, cambios: Partial<Linea>) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));
  };
  const agregarLinea = () => {
    if (lineas.length >= 3) return;
    const usados = new Set(lineas.map((l) => l.metodoPago));
    const libre = METODOS.find((m) => !usados.has(m.value));
    if (!libre) return;
    setLineas((prev) => [...prev, { metodoPago: libre.value, monto: String(Math.max(0, resta)) }]);
  };
  const quitarLinea = (indice: number) => setLineas((prev) => prev.filter((_, i) => i !== indice));

  const indiceEfectivoMixto = lineas.findIndex((l) => l.metodoPago === 'EFECTIVO' && Number(l.monto) > 0);
  const montoEfectivoMixto = indiceEfectivoMixto >= 0 ? Number(lineas[indiceEfectivoMixto].monto) || 0 : 0;
  const recibidoMixtoEfectivo = recibidosMixto[indiceEfectivoMixto] || 0;

  const puedeConfirmar = useMemo(() => {
    if (procesando) return false;
    if (credito) {
      if (!permitirCredito || total <= 0 || vencimiento < hoy) return false;
      if (!abonoInicial) return true;
      return sumaLineas > 0 && resta > 0 && lineas.every(l=>Number.isFinite(Number(l.monto)) && Number(l.monto)>0) && (indiceEfectivoMixto<0 || recibidoMixtoEfectivo>=montoEfectivoMixto);
    }
    if (!mixto) {
      if (metodoUnico === 'EFECTIVO') return recibidoUnico >= total;
      return true;
    }
    if (Math.abs(resta) > 0.01) return false;
    if (lineas.some((l) => !Number(l.monto) || Number(l.monto) <= 0)) return false;
    if (indiceEfectivoMixto >= 0 && recibidoMixtoEfectivo < montoEfectivoMixto) return false;
    return true;
  }, [credito, abonoInicial, sumaLineas, permitirCredito, vencimiento, hoy, procesando, mixto, metodoUnico, recibidoUnico, total, resta, lineas, indiceEfectivoMixto, recibidoMixtoEfectivo, montoEfectivoMixto]);

  const confirmar = () => {
    if (!puedeConfirmar) return;
    if (credito) { onConfirmar({ metodoPago: 'CREDITO', pagos: abonoInicial ? lineas.map(l=>({metodoPago:l.metodoPago,monto:Math.round(Number(l.monto)*100)/100})) : [], cambio: abonoInicial && indiceEfectivoMixto>=0 ? Math.max(0,recibidoMixtoEfectivo-montoEfectivoMixto) : 0, condicionPago: 'CREDITO', vencimientoCredito: vencimiento }); return; }
    if (!mixto) {
      const cambio = metodoUnico === 'EFECTIVO' ? Math.max(0, recibidoUnico - total) : 0;
      onConfirmar({ metodoPago: metodoUnico, pagos: [{ metodoPago: metodoUnico, monto: total }], cambio });
      return;
    }
    const pagos = lineas.map((l) => ({ metodoPago: l.metodoPago, monto: Math.round((Number(l.monto) || 0) * 100) / 100 }));
    const metodoPago = pagos.length > 1 ? 'MIXTO' : pagos[0].metodoPago;
    const cambio = indiceEfectivoMixto >= 0 ? Math.max(0, recibidoMixtoEfectivo - montoEfectivoMixto) : 0;
    onConfirmar({ metodoPago, pagos, cambio });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-3 shadow-2xl sm:p-5">
        <div className="mb-4 flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">{titulo}</h3>
            <p className="mt-1 text-xs uppercase tracking-widest text-gray-400">Total a pagar</p>
            <p className="text-3xl font-bold tabular-nums text-orange-400 sm:text-4xl">{moneda(total)}</p>
          </div>
          <button type="button" aria-label="Cerrar cobro" disabled={procesando} onClick={onCancelar} className="flex h-11 w-11 items-center justify-center text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        {permitirCredito && <label className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/40 p-3 text-amber-200"><input type="checkbox" checked={credito} disabled={procesando} onChange={e=>{setCredito(e.target.checked);if(!e.target.checked)setAbonoInicial(false);}} /> Dejar un saldo a crédito del cliente</label>}
        {credito && <div className="mb-4 space-y-3 rounded-xl bg-gray-950 p-4"><label>Fecha de vencimiento<input type="date" min={hoy} disabled={procesando} value={vencimiento} onChange={e=>setVencimiento(e.target.value)} className="ml-3 rounded border border-gray-700 bg-gray-900 p-2" /></label><label className="flex items-center gap-2"><input type="checkbox" checked={abonoInicial} disabled={procesando} onChange={e=>{setAbonoInicial(e.target.checked);if(e.target.checked)setMixto(true);}} /> El cliente paga una parte ahora</label><p className="text-sm text-amber-200">{abonoInicial ? `Abono de hoy: ${moneda(sumaLineas)} · Saldo a crédito: ${moneda(Math.max(0,resta))}` : `Saldo a crédito: ${moneda(total)}`}</p><p className="text-sm text-gray-400">Solo el dinero recibido entra a caja. El saldo pendiente queda en la cuenta del cliente.</p></div>}
        {opcionesImpresion && <div className="mb-4">{opcionesImpresion}</div>}
        <div hidden={credito && !abonoInicial}>
        <button
          type="button"
          disabled={procesando || credito}
          onClick={() => setMixto((v) => !v)}
          aria-pressed={mixto}
          className={`mb-4 min-h-12 w-full rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${mixto ? 'border-orange-500/50 bg-orange-500/10 text-orange-400' : 'border-gray-700 text-gray-300 hover:border-gray-600'}`}
        >
          {mixto ? '✓ Pago mixto (varios medios)' : 'Dividir el pago en varios medios'}
        </button>

        {!mixto ? (
          <div className="grid gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-300">¿Cómo va a pagar?</p>
              <div role="group" aria-label="Medio de pago" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-1">
                {METODOS.map((m) => (
                  <button key={m.value} type="button" aria-pressed={metodoUnico === m.value} disabled={procesando}
                    onClick={() => { if (metodoUnico !== m.value) { setMetodoUnico(m.value); setRecibidoUnico(0); } }}
                    className={`flex min-h-16 touch-manipulation flex-col items-center justify-center gap-2 rounded-xl border px-2 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-orange-400 md:flex-row md:justify-start ${metodoUnico === m.value ? 'border-orange-500 bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30' : 'border-gray-700 bg-gray-800 text-gray-200 hover:border-gray-500'}`}>
                    <MarcaPago metodo={m.value} />{m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              {metodoUnico === 'EFECTIVO' ? (
                <MontoRecibido key="unico" inicial={recibidoUnico} objetivo={total} onCambiar={setRecibidoUnico} />
              ) : (
                <div className="flex min-h-96 flex-col items-center justify-center rounded-2xl border border-gray-700 bg-gray-950 p-5 text-center sm:p-8">
                  <MarcaPago metodo={metodoUnico === 'TRANSFERENCIA' ? bancoTransferencia : metodoUnico} grande />
                  <p className="mt-5 text-xl font-semibold text-white">Pago con {metodoUnico === 'TRANSFERENCIA' && bancoTransferencia === 'DAVIVIENDA' ? 'Davivienda' : METODOS.find((m) => m.value === metodoUnico)?.label}</p>
                  {metodoUnico === 'TRANSFERENCIA' && <div className="mt-4 w-full max-w-sm">
                    <p className="mb-2 text-sm text-gray-400">Banco de la transferencia</p>
                    <div role="group" aria-label="Banco de la transferencia" className="grid grid-cols-2 gap-2">
                      {['DAVIVIENDA', 'TRANSFERENCIA'].map((banco) => <button key={banco} type="button" disabled={procesando} aria-pressed={bancoTransferencia === banco} onClick={() => setBancoTransferencia(banco)} className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-sm text-white ${bancoTransferencia === banco ? 'border-orange-400 bg-orange-500/10' : 'border-gray-700 bg-gray-900'}`}>
                        <MarcaPago metodo={banco} />{banco === 'DAVIVIENDA' ? 'Davivienda' : 'Otro banco'}
                      </button>)}
                    </div>
                    <p className="mt-2 text-xs text-gray-400">Se registra como transferencia en caja y reportes.</p>
                  </div>}
                  <p className="mt-4 text-sm text-gray-400">Total a cobrar</p>
                  <p className="mt-1 text-4xl font-bold tabular-nums text-orange-400">{moneda(total)}</p>
                  <p className="mt-6 max-w-sm rounded-xl bg-gray-900 p-4 text-sm text-gray-300">Verifica que hayas recibido el pago antes de confirmar el cobro.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {lineas.map((linea, indice) => (
                <div key={indice} className="flex items-center gap-2">
                  <span className="hidden sm:block"><MarcaPago metodo={linea.metodoPago} /></span>
                  <select
                    aria-label={`Medio de pago ${indice + 1}`}
                    disabled={procesando}
                    value={linea.metodoPago}
                    onChange={(e) => actualizarLinea(indice, { metodoPago: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white"
                  >
                    {metodosDisponibles(indice).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <input
                    aria-label={`Monto del pago ${indice + 1}`}
                    disabled={procesando}
                    type="number"
                    min={0}
                    value={linea.monto}
                    onChange={(e) => actualizarLinea(indice, { monto: e.target.value })}
                    className="w-28 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white"
                  />
                  {lineas.length > 1 && (
                    <button type="button" onClick={() => quitarLinea(indice)} className="text-gray-500 hover:text-red-400"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
              {lineas.length < 3 && (
                <button type="button" onClick={agregarLinea} className="flex items-center gap-1 text-sm text-orange-400 hover:text-orange-300">
                  <Plus size={14} /> Agregar otro medio de pago
                </button>
              )}
            </div>
            <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${Math.abs(resta) > 0.01 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
              {credito && abonoInicial && resta > 0 ? `Quedará a crédito: ${moneda(resta)}` : Math.abs(resta) > 0.01 ? `Falta asignar ${moneda(resta)}` : 'Los pagos cubren el total ✓'}
            </div>
            {!credito && resta>0 && permitirCredito && <button type="button" disabled={procesando} onClick={()=>{setCredito(true);setAbonoInicial(true);}} className="w-full rounded-lg border border-amber-500/50 p-3 font-semibold text-amber-200">Dejar los {moneda(resta)} restantes a crédito</button>}
            {!credito && resta>0 && !permitirCredito && <p className="text-sm text-amber-200">Para dejar un saldo a crédito, vuelve a productos y selecciona el cliente.</p>}
            {indiceEfectivoMixto >= 0 && (
              <MontoRecibido key={`mixto-${indiceEfectivoMixto}`} inicial={recibidoMixtoEfectivo} objetivo={montoEfectivoMixto} onCambiar={(v) => setRecibidosMixto((prev) => ({ ...prev, [indiceEfectivoMixto]: v }))} />
            )}
          </div>
        )}

        </div>
        <div className="sticky -bottom-3 mt-5 flex gap-3 border-t border-gray-700 bg-gray-900 py-3 sm:-bottom-5 sm:py-4">
          <button type="button" disabled={procesando} onClick={onCancelar} className="flex-1 rounded-lg bg-gray-800 py-3 text-white hover:bg-gray-700">{textoCancelar}</button>
          <button type="button" onClick={confirmar} disabled={!puedeConfirmar} className="flex-1 rounded-lg bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-40">
            {procesando ? 'Guardando…' : credito ? 'Registrar crédito' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
