'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type Tipo = 'exito' | 'error' | 'info';
type Toast = { id: number; mensaje: string; tipo: Tipo };
type OpcionesConfirmar = { titulo?: string; textoConfirmar?: string; peligroso?: boolean };
type Confirmacion = { mensaje: string; titulo: string; textoConfirmar: string; peligroso: boolean; resolver: (ok: boolean) => void };

type ContextoNotificaciones = {
  aviso: (mensaje: string, tipo?: Tipo) => void;
  confirmar: (mensaje: string, opciones?: OpcionesConfirmar) => Promise<boolean>;
};

const ContextoNotificar = createContext<ContextoNotificaciones | null>(null);

const ESTILO_TOAST: Record<Tipo, string> = {
  exito: 'border-green-500/40 bg-gray-900 text-green-300',
  error: 'border-red-500/40 bg-gray-900 text-red-300',
  info: 'border-gray-600 bg-gray-900 text-gray-200',
};
const ICONO_TOAST: Record<Tipo, typeof Info> = { exito: CheckCircle2, error: AlertCircle, info: Info };

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const siguienteId = useRef(0);

  const cerrarToast = useCallback((id: number) => {
    setToasts((actuales) => actuales.filter((t) => t.id !== id));
  }, []);

  const aviso = useCallback((mensaje: string, tipo: Tipo = 'info') => {
    const id = ++siguienteId.current;
    setToasts((actuales) => [...actuales, { id, mensaje, tipo }]);
    window.setTimeout(() => cerrarToast(id), tipo === 'error' ? 8000 : 5000);
  }, [cerrarToast]);

  const confirmar = useCallback((mensaje: string, opciones: OpcionesConfirmar = {}) => new Promise<boolean>((resolver) => {
    setConfirmacion({
      mensaje,
      titulo: opciones.titulo || 'Confirmar acción',
      textoConfirmar: opciones.textoConfirmar || 'Sí, continuar',
      peligroso: opciones.peligroso ?? false,
      resolver,
    });
  }), []);

  const responder = (ok: boolean) => {
    confirmacion?.resolver(ok);
    setConfirmacion(null);
  };

  return (
    <ContextoNotificar.Provider value={{ aviso, confirmar }}>
      {children}

      <div className="fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const Icono = ICONO_TOAST[t.tipo];
          return (
            <div key={t.id} role="status" className={`flex items-start gap-3 rounded-xl border p-3 shadow-lg ${ESTILO_TOAST[t.tipo]}`}>
              <Icono size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-sm leading-snug">{t.mensaje}</p>
              <button type="button" onClick={() => cerrarToast(t.id)} className="text-gray-500 hover:text-white" aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {confirmacion && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-2 text-lg font-bold text-white">{confirmacion.titulo}</h3>
            <p className="mb-6 text-sm leading-relaxed text-gray-400">{confirmacion.mensaje}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => responder(false)} className="flex-1 rounded-lg bg-gray-800 py-2.5 font-medium text-white transition-colors hover:bg-gray-700">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => responder(true)}
                className={`flex-1 rounded-lg py-2.5 font-bold text-white transition-colors ${confirmacion.peligroso ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                {confirmacion.textoConfirmar}
              </button>
            </div>
          </div>
        </div>
      )}
    </ContextoNotificar.Provider>
  );
}

export function useNotificar(): ContextoNotificaciones {
  const contexto = useContext(ContextoNotificar);
  if (!contexto) throw new Error('useNotificar requiere NotificacionesProvider');
  return contexto;
}
