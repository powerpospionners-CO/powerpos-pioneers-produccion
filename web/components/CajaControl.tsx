'use client';

import { useState } from 'react';
import { Lock, Unlock, X } from 'lucide-react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import CalculadoraBilletes from './CalculadoraBilletes';

type Caja = {
  id: number;
  usuarioId: number;
  usuario?: { nombre: string };
  montoInicial: string;
  totalVentas?: number;
  totalEfectivo?: number;
  totalEsperado?: number;
};

export default function CajaControl({ caja, cajaBloqueadaPorUsuario, onCambio }: {
  caja: Caja | null;
  cajaBloqueadaPorUsuario?: boolean;
  onCambio: () => void;
}) {
  const [montoInicial, setMontoInicial] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [modalCierre, setModalCierre] = useState(false);
  const [montoFinal, setMontoFinal] = useState(0);
  const [confirmoCero, setConfirmoCero] = useState(false);

  const abrir = async () => {
    if (montoInicial === '' || Number(montoInicial) < 0) return;
    setOcupado(true); setError('');
    try {
      await api.post('/caja/abrir', { montoInicial: Number(montoInicial) });
      setMontoInicial('');
      onCambio();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo abrir la caja.');
    } finally { setOcupado(false); }
  };

  const cerrar = async () => {
    if (!caja) return;
    setOcupado(true); setError('');
    try {
      await api.post(`/caja/${caja.id}/cerrar`, { montoFinal });
      setModalCierre(false);
      onCambio();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cerrar la caja.');
    } finally { setOcupado(false); }
  };

  if (!caja) {
    return (
      <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-center gap-3">
          <p className="w-full text-center text-sm font-medium text-red-200">
            <Lock size={14} className="mr-1 inline" /> La caja está cerrada. Ábrela para poder vender.
          </p>
          <label className="text-xs text-red-200">Base de efectivo inicial
            <input type="number" min={0} value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} className="mt-1 block w-40 rounded-lg border border-red-500/40 bg-gray-900 px-3 py-2 text-white" />
          </label>
          <button type="button" onClick={abrir} disabled={ocupado || montoInicial === ''} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
            {ocupado ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </div>
        {error && <p className="mt-2 text-center text-xs text-red-300">{error}</p>}
      </div>
    );
  }

  if (cajaBloqueadaPorUsuario) return null;

  return (
    <>
      <div className="border-b border-green-500/20 bg-green-500/5 px-4 py-2 text-center text-sm text-green-300">
        <Unlock size={13} className="mr-1 inline" /> Caja abierta · {caja.usuario?.nombre || 'cajero'} · base {moneda(Number(caja.montoInicial))}
        <button type="button" onClick={() => { setMontoFinal(0); setConfirmoCero(false); setError(''); setModalCierre(true); }} className="ml-3 rounded-lg border border-green-500/30 px-3 py-1 text-xs font-semibold text-green-200 hover:bg-green-500/10">
          Cerrar caja
        </button>
      </div>

      {modalCierre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Cerrar caja</h3>
              <button type="button" onClick={() => setModalCierre(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <p className="mb-3 text-sm text-gray-400">Cuenta el efectivo que hay físicamente en la caja. Se espera <strong className="text-white">{moneda(caja.totalEsperado || 0)}</strong> en efectivo (base + ventas en efectivo del turno).</p>
            <CalculadoraBilletes objetivo={caja.totalEsperado || 0} onCambiar={(v) => { setMontoFinal(v); if (v !== 0) setConfirmoCero(false); }} />
            {montoFinal === 0 && (
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
                <input type="checkbox" checked={confirmoCero} onChange={(e) => setConfirmoCero(e.target.checked)} />
                Confirmo que la caja realmente quedó en $0 (no he contado ningún billete o moneda)
              </label>
            )}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setModalCierre(false)} className="flex-1 rounded-lg bg-gray-800 py-3 text-white hover:bg-gray-700">Cancelar</button>
              <button type="button" onClick={cerrar} disabled={ocupado || (montoFinal === 0 && !confirmoCero)} className="flex-1 rounded-lg bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                {ocupado ? 'Cerrando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
