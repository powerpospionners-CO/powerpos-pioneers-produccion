'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, X, Banknote, CreditCard, ArrowLeftRight, Smartphone } from 'lucide-react';
import CalculadoraBilletes from './CalculadoraBilletes';

const METODOS = [
  { value: 'EFECTIVO', label: 'Efectivo', icono: Banknote },
  { value: 'TARJETA', label: 'Tarjeta', icono: CreditCard },
  { value: 'TRANSFERENCIA', label: 'Transferencia', icono: ArrowLeftRight },
  { value: 'NEQUI', label: 'Nequi', icono: Smartphone },
  { value: 'DAVIPLATA', label: 'Daviplata', icono: Smartphone },
];

const moneda = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export type PagoConfirmado = { metodoPago: string; pagos: { metodoPago: string; monto: number }[] };

type Linea = { metodoPago: string; monto: string };

export default function ModalCobro({ total, procesando, onConfirmar, onCancelar, titulo = 'Cobrar venta', textoConfirmar = 'Confirmar cobro', metodoInicial = 'EFECTIVO', pagosIniciales }: {
  total: number;
  procesando?: boolean;
  onConfirmar: (pago: PagoConfirmado) => void;
  onCancelar: () => void;
  titulo?: string;
  textoConfirmar?: string;
  metodoInicial?: string;
  pagosIniciales?: { metodoPago: string; monto: string | number }[];
}) {
  const yaEraMixto = metodoInicial === 'MIXTO' && Array.isArray(pagosIniciales) && pagosIniciales.length > 1;
  const [mixto, setMixto] = useState(yaEraMixto);
  const [metodoUnico, setMetodoUnico] = useState(metodoInicial === 'MIXTO' ? 'EFECTIVO' : metodoInicial);
  const [recibidoUnico, setRecibidoUnico] = useState(0);
  const [lineas, setLineas] = useState<Linea[]>(
    yaEraMixto
      ? pagosIniciales!.map((p) => ({ metodoPago: p.metodoPago, monto: String(p.monto) }))
      : [{ metodoPago: 'EFECTIVO', monto: String(total) }, { metodoPago: 'TRANSFERENCIA', monto: '0' }],
  );
  const [recibidosMixto, setRecibidosMixto] = useState<Record<number, number>>({});

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
    if (!mixto) {
      if (metodoUnico === 'EFECTIVO') return recibidoUnico >= total;
      return true;
    }
    if (Math.abs(resta) > 0.5) return false;
    if (lineas.some((l) => !Number(l.monto) || Number(l.monto) <= 0)) return false;
    if (indiceEfectivoMixto >= 0 && recibidoMixtoEfectivo < montoEfectivoMixto) return false;
    return true;
  }, [procesando, mixto, metodoUnico, recibidoUnico, total, resta, lineas, indiceEfectivoMixto, recibidoMixtoEfectivo, montoEfectivoMixto]);

  const confirmar = () => {
    if (!puedeConfirmar) return;
    if (!mixto) {
      onConfirmar({ metodoPago: metodoUnico, pagos: [{ metodoPago: metodoUnico, monto: total }] });
      return;
    }
    const pagos = lineas.map((l) => ({ metodoPago: l.metodoPago, monto: Math.round((Number(l.monto) || 0) * 100) / 100 }));
    const metodoPago = pagos.length > 1 ? 'MIXTO' : pagos[0].metodoPago;
    onConfirmar({ metodoPago, pagos });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{titulo}</h3>
            <p className="text-sm text-gray-400">Total a pagar: <span className="font-bold text-orange-500">{moneda(total)}</span></p>
          </div>
          <button type="button" aria-label="Cerrar cobro" disabled={procesando} onClick={onCancelar} className="flex h-11 w-11 items-center justify-center text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        <button
          type="button"
          disabled={procesando}
          onClick={() => setMixto((v) => !v)}
          className={`mb-4 w-full rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${mixto ? 'border-orange-500/50 bg-orange-500/10 text-orange-400' : 'border-gray-700 text-gray-300 hover:border-gray-600'}`}
        >
          {mixto ? '✓ Pago mixto (varios medios)' : 'Dividir el pago en varios medios'}
        </button>

        {!mixto ? (
          <div className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-300">¿Cómo va a pagar?</p>
              <div role="group" aria-label="Medio de pago" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-1">
                {METODOS.map((m) => (
                  <button key={m.value} type="button" aria-pressed={metodoUnico === m.value} disabled={procesando}
                    onClick={() => { if (metodoUnico !== m.value) { setMetodoUnico(m.value); setRecibidoUnico(0); } }}
                    className={`flex min-h-14 touch-manipulation items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-orange-400 ${metodoUnico === m.value ? 'border-orange-500 bg-orange-500/15 text-orange-300' : 'border-gray-700 bg-gray-800 text-gray-200 hover:border-gray-500'}`}>
                    <m.icono size={22} className="shrink-0" />{m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              {metodoUnico === 'EFECTIVO' ? (
                <CalculadoraBilletes key="unico" objetivo={total} onCambiar={setRecibidoUnico} />
              ) : (
                <div className="rounded-xl border border-gray-700 bg-gray-950 p-6">
                  <p className="text-lg font-semibold text-white">Pago con {METODOS.find((m) => m.value === metodoUnico)?.label}</p>
                  <p className="mt-4 text-sm text-gray-400">Total a cobrar</p>
                  <p className="mt-1 text-3xl font-bold text-orange-400">{moneda(total)}</p>
                  <p className="mt-5 text-sm text-gray-300">Verifica que hayas recibido el pago antes de confirmar el cobro.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {lineas.map((linea, indice) => (
                <div key={indice} className="flex items-center gap-2">
                  <select
                    value={linea.metodoPago}
                    onChange={(e) => actualizarLinea(indice, { metodoPago: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white"
                  >
                    {metodosDisponibles(indice).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <input
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
            <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${Math.abs(resta) > 0.5 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
              {Math.abs(resta) > 0.5 ? `Falta asignar ${moneda(resta)}` : 'Los pagos cubren el total ✓'}
            </div>
            {indiceEfectivoMixto >= 0 && (
              <CalculadoraBilletes key={`mixto-${indiceEfectivoMixto}`} objetivo={montoEfectivoMixto} onCambiar={(v) => setRecibidosMixto((prev) => ({ ...prev, [indiceEfectivoMixto]: v }))} />
            )}
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" disabled={procesando} onClick={onCancelar} className="flex-1 rounded-lg bg-gray-800 py-3 text-white hover:bg-gray-700">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={!puedeConfirmar} className="flex-1 rounded-lg bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-40">
            {procesando ? 'Guardando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
