"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
export default function DialogoSistema({
  titulo,
  children,
  onCancelar,
  ocupado = false,
}: {
  titulo: string;
  children: ReactNode;
  onCancelar?: () => void;
  ocupado?: boolean;
}) {
  const tituloId = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogo.current;
    const anterior = document.activeElement;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
      if (anterior instanceof HTMLElement && anterior.isConnected)
        anterior.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogo}
      aria-labelledby={tituloId}
      aria-busy={ocupado || undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!ocupado) onCancelar?.();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <h2 id={tituloId} className="mb-3 text-xl font-bold">
        {titulo}
      </h2>
      {children}
    </dialog>
  );
}
