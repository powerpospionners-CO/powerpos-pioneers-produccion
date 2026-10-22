"use client";
import { useEffect, useState } from "react";
import "@/lib/escritorio";
export default function EscritorioEstado() {
  const [disponible, setDisponible] = useState(false);
  useEffect(() => setDisponible(!!window.powerposDesktop), []);
  return disponible ? (
    <button
      type="button"
      onClick={() => void window.powerposDesktop?.configurar()}
      className="ml-3 rounded-lg border border-blue-400/40 px-3 py-1 text-xs font-semibold text-blue-200"
    >
      Impresora local · Configurar
    </button>
  ) : null;
}
