'use client';

import { useEffect, useState } from 'react';
import { Lock, Unlock, X } from 'lucide-react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import CalculadoraBilletes from './CalculadoraBilletes';
import { useNotificar } from './Notificaciones';
import RegistroAperturaLlave from './RegistroAperturaLlave';
import EscritorioEstado from './EscritorioEstado';

type Caja = {
  id: number;
  usuarioId: number;
  usuario?: { nombre: string };
  montoInicial: string;
  totalVentas?: number;
  totalEfectivo?: number;
  totalEsperado?: number;
  recaudoEfectivoHabilitado?: boolean;
  baseEfectivoCaja?: number | null;
};

export default function CajaControl({ caja, cajaBloqueadaPorUsuario, onCambio }: {
  caja: Caja | null;
  cajaBloqueadaPorUsuario?: boolean;
  onCambio: () => void;
}) {
  const { aviso } = useNotificar();
  const [montoInicial, setMontoInicial] = useState('');
  const [configRecaudo, setConfigRecaudo] = useState<{ habilitado: boolean; baseEfectivoCaja: number | null } | null>(null);
  const [montoRetirado, setMontoRetirado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [reimprimiendo, setReimprimiendo] = useState(false);

  const reimprimirMiCierre = async () => {
    setReimprimiendo(true);
    try {
      const { data } = await api.post('/caja/reimprimir-mi-cierre');
      aviso(data.impreso ? 'Se mandó la colilla a la impresora de nuevo.' : `No se pudo imprimir: ${data.motivo || 'revisa que el agente de impresión esté conectado'}.`, data.impreso ? 'exito' : 'error');
    } catch (e: any) {
      aviso(e?.response?.data?.message || 'No se pudo reimprimir el cierre.', 'error');
    } finally {
      setReimprimiendo(false);
    }
  };
  const [modalCierre, setModalCierre] = useState(false);
  const [montoFinal, setMontoFinal] = useState(0);
  const [confirmoCero, setConfirmoCero] = useState(false);

  useEffect(() => {
    api.get('/caja/recaudo/configuracion')
      .then(({ data }) => {
        setConfigRecaudo(data);
        if (data.baseEfectivoCaja !== null) setMontoInicial(String(data.baseEfectivoCaja));
      })
      .catch((e) => setError(e?.response?.data?.message || 'No se pudo cargar la base configurada de caja.'));
  }, []);

  const recaudoActivo = caja
    ? !!caja.recaudoEfectivoHabilitado
    : !!configRecaudo?.habilitado && configRecaudo.baseEfectivoCaja !== null;
  const baseFija = caja?.baseEfectivoCaja ?? configRecaudo?.baseEfectivoCaja ?? null;
  const montoEsperadoDespuesRetiro = recaudoActivo && caja
    ? Number(caja.montoInicial) + Number(caja.totalEfectivo || 0) - Number(montoRetirado || 0)
    : Number(caja?.totalEsperado || 0);

  const abrir = async () => {
    if (configRecaudo?.habilitado && configRecaudo.baseEfectivoCaja === null) {
      setError('Un administrador debe configurar la base fija antes de abrir la caja.');
      return;
    }
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
      await api.post(`/caja/${caja.id}/cerrar`, {
        montoFinal,
        ...(recaudoActivo ? { montoRetirado: Number(montoRetirado) } : {}),
      });
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
            <input type="number" min={0} value={montoInicial} readOnly={configRecaudo?.habilitado && baseFija !== null} onChange={(e) => setMontoInicial(e.target.value)} className="mt-1 block w-40 rounded-lg border border-red-500/40 bg-gray-900 px-3 py-2 text-white read-only:opacity-70" />
          </label>
          <button type="button" onClick={abrir} disabled={ocupado || montoInicial === '' || (!!configRecaudo?.habilitado && baseFija === null)} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
            {ocupado ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </div>
        {configRecaudo?.habilitado && baseFija === null && <p className="mt-2 text-center text-xs text-yellow-200">Configura la base fija desde “Recaudo semanal” antes de abrir.</p>}
        {error && <p className="mt-2 text-center text-xs text-red-300">{error}</p>}
        <p className="mt-2 text-center text-xs">
          <button type="button" disabled={reimprimiendo} onClick={reimprimirMiCierre} className="text-red-200/80 underline hover:text-white disabled:opacity-50">
            {reimprimiendo ? 'Enviando…' : '¿No te imprimió el cierre anterior? Reimprimir'}
          </button>
        </p>
      </div>
    );
  }

  if (cajaBloqueadaPorUsuario) return null;

  return (
    <>
      <div className="pos-caja-abierta border-b border-green-500/20 bg-green-500/5 px-4 py-2 text-center text-sm text-green-300">
        <Unlock size={13} className="mr-1 inline" /> Caja abierta · {caja.usuario?.nombre || 'cajero'} · base {moneda(Number(caja.montoInicial))}
        <button type="button" onClick={() => { setMontoFinal(0); setMontoRetirado(String(caja.totalEfectivo || 0)); setConfirmoCero(false); setError(''); setModalCierre(true); }} className="pos-caja-cerrar ml-3 rounded-lg border border-green-500/30 px-3 py-1 text-xs font-semibold text-green-200 hover:bg-green-500/10">
          Cerrar caja
        </button>
        <RegistroAperturaLlave cajaId={caja.id} />
        <EscritorioEstado />
      </div>

      {modalCierre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Cerrar caja</h3>
              <button type="button" onClick={() => setModalCierre(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {recaudoActivo ? (
              <>
                <p className="mb-3 text-sm text-gray-400">Retira el efectivo vendido y deja la base fija de <strong className="text-white">{moneda(Number(caja.baseEfectivoCaja))}</strong> en la gaveta. La base no se incluye en el recaudo semanal.</p>
                <label className="mb-3 block text-sm text-gray-300">Efectivo retirado para recaudo
                  <input type="number" min={0} max={caja.totalEfectivo || 0} step="0.01" value={montoRetirado} onChange={(e) => { setMontoRetirado(e.target.value); setMontoFinal(0); setConfirmoCero(false); }} className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                </label>
                <p className="mb-3 text-sm text-gray-400">Cobros netos en efectivo: {moneda(caja.totalEfectivo || 0)} · Debe quedar en caja: <strong className="text-white">{moneda(Math.max(0, montoEsperadoDespuesRetiro))}</strong></p>
              </>
            ) : (
              <p className="mb-3 text-sm text-gray-400">Cuenta el efectivo que hay físicamente en la caja. Se espera <strong className="text-white">{moneda(caja.totalEsperado || 0)}</strong> en efectivo (base + cobros − reembolsos en efectivo del turno).</p>
            )}
            <CalculadoraBilletes objetivo={Math.max(0, montoEsperadoDespuesRetiro)} onCambiar={(v) => { setMontoFinal(v); if (v !== 0) setConfirmoCero(false); }} />
            {montoFinal === 0 && (
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
                <input type="checkbox" checked={confirmoCero} onChange={(e) => setConfirmoCero(e.target.checked)} />
                Confirmo que la caja realmente quedó en $0 (no he contado ningún billete o moneda)
              </label>
            )}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setModalCierre(false)} className="flex-1 rounded-lg bg-gray-800 py-3 text-white hover:bg-gray-700">Cancelar</button>
              <button type="button" onClick={cerrar} disabled={ocupado || (montoFinal === 0 && !confirmoCero) || (recaudoActivo && (montoRetirado === '' || Number(montoRetirado) < 0 || Number(montoRetirado) > Number(caja.totalEfectivo || 0)))} className="flex-1 rounded-lg bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                {ocupado ? 'Cerrando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
