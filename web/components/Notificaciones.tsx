"use client";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import DialogoSistema from "./DialogoSistema";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type Tipo = "exito" | "error" | "info";
type Toast = { id: number; mensaje: string; tipo: Tipo };
type OpcionesConfirmar = {
  titulo?: string;
  textoConfirmar?: string;
  peligroso?: boolean;
};
type OpcionesEntrada = { tipo?: "text" | "number" | "date" };
type Confirmacion = {
  mensaje: string;
  titulo: string;
  textoConfirmar: string;
  peligroso: boolean;
  resolver: (ok: boolean | string | null) => void;
  entrada?: boolean;
  tipoEntrada?: OpcionesEntrada["tipo"];
  valorInicial?: string;
};

type ContextoNotificaciones = {
  aviso: (mensaje: string, tipo?: Tipo) => void;
  confirmar: (
    mensaje: string,
    opciones?: OpcionesConfirmar,
  ) => Promise<boolean>;
  solicitar: (
    mensaje: string,
    valorInicial?: string,
    opciones?: OpcionesEntrada,
  ) => Promise<string | null>;
};

const ContextoNotificar = createContext<ContextoNotificaciones | null>(null);

const ESTILO_TOAST: Record<Tipo, string> = {
  exito: "border-green-500/40 bg-gray-900 text-green-300",
  error: "border-red-500/40 bg-gray-900 text-red-300",
  info: "border-gray-600 bg-gray-900 text-gray-200",
};
const ICONO_TOAST: Record<Tipo, typeof Info> = {
  exito: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const siguienteId = useRef(0);
  const pendientes = useRef<Confirmacion[]>([]);
  const activa = useRef(false);
  const [valor, setValor] = useState("");

  const cerrarToast = useCallback((id: number) => {
    setToasts((actuales) => actuales.filter((t) => t.id !== id));
  }, []);

  const aviso = useCallback(
    (mensaje: string, tipo: Tipo = "info") => {
      const id = ++siguienteId.current;
      setToasts((actuales) => [...actuales, { id, mensaje, tipo }]);
      window.setTimeout(() => cerrarToast(id), tipo === "error" ? 8000 : 5000);
    },
    [cerrarToast],
  );

  const encolar = useCallback((d: Confirmacion) => {
    if (activa.current) pendientes.current.push(d);
    else {
      activa.current = true;
      setValor(d.valorInicial || "");
      setConfirmacion(d);
    }
  }, []);
  const confirmar = useCallback(
    (mensaje: string, opciones: OpcionesConfirmar = {}) =>
      new Promise<boolean>((resolver) => {
        encolar({
          mensaje,
          titulo: opciones.titulo || "Confirmar acción",
          textoConfirmar: opciones.textoConfirmar || "Sí, continuar",
          peligroso: opciones.peligroso ?? false,
          resolver: (v) => resolver(v === true),
        });
      }),
    [encolar],
  );
  const solicitar = useCallback(
    (mensaje: string, valorInicial = "", opciones: OpcionesEntrada = {}) =>
      new Promise<string | null>((resolver) => {
        encolar({
          mensaje,
          titulo: "Completar información",
          textoConfirmar: "Continuar",
          peligroso: false,
          entrada: true,
          tipoEntrada: opciones.tipo || "text",
          valorInicial,
          resolver: (v) => resolver(typeof v === "string" ? v : null),
        });
      }),
    [encolar],
  );
  const responder = (ok: boolean) => {
    confirmacion?.resolver(
      confirmacion.entrada ? (ok ? valor.trim() : null) : ok,
    );
    const siguiente = pendientes.current.shift() || null;
    activa.current = !!siguiente;
    setValor(siguiente?.valorInicial || "");
    setConfirmacion(siguiente);
  };

  return (
    <ContextoNotificar.Provider value={{ aviso, confirmar, solicitar }}>
      {children}

      <div className="fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const Icono = ICONO_TOAST[t.tipo];
          return (
            <div
              key={t.id}
              role={t.tipo === "error" ? "alert" : "status"}
              className={`flex items-start gap-3 rounded-xl border p-3 shadow-lg ${ESTILO_TOAST[t.tipo]}`}
            >
              <Icono size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-sm leading-snug">{t.mensaje}</p>
              <button
                type="button"
                onClick={() => cerrarToast(t.id)}
                className="text-gray-500 hover:text-white"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {confirmacion && (
        <DialogoSistema
          titulo={confirmacion.titulo}
          onCancelar={() => responder(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              responder(true);
            }}
          >
            <p
              id="powerpos-confirmacion-mensaje"
              className="mb-5 text-sm leading-relaxed text-gray-200"
            >
              {confirmacion.mensaje}
            </p>
            {confirmacion.entrada && (
              <label className="mb-5 block text-sm">
                Respuesta
                <input
                  type={confirmacion.tipoEntrada || "text"}
                  step={
                    confirmacion.tipoEntrada === "number" ? "any" : undefined
                  }
                  required
                  maxLength={3000}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  aria-describedby="powerpos-confirmacion-mensaje"
                  className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-950 p-3 text-white"
                />
              </label>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => responder(false)}
                className="flex-1 rounded-lg bg-gray-800 px-3 py-2.5 font-medium text-white hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={confirmacion.entrada && !valor.trim()}
                className={`flex-1 rounded-lg px-3 py-2.5 font-bold text-white disabled:opacity-50 ${confirmacion.peligroso ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`}
              >
                {confirmacion.textoConfirmar}
              </button>
            </div>
          </form>
        </DialogoSistema>
      )}
    </ContextoNotificar.Provider>
  );
}

export function useNotificar(): ContextoNotificaciones {
  const contexto = useContext(ContextoNotificar);
  if (!contexto)
    throw new Error("useNotificar requiere NotificacionesProvider");
  return contexto;
}
