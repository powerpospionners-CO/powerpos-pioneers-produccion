"use client";
import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { LoaderCircle } from "lucide-react";
import {
  estadoCargas,
  estadoCargasServidor,
  observarCargas,
} from "@/lib/cargas";
import DialogoSistema from "./DialogoSistema";
import { useNotificar } from "./Notificaciones";
export default function ProcesandoArchivos() {
  const estado = useSyncExternalStore(
    observarCargas,
    estadoCargas,
    estadoCargasServidor,
  );
  const vistos = useRef(0);
  const { aviso } = useNotificar();
  useEffect(() => {
    if (!estado.activas && estado.fallos > vistos.current) {
      vistos.current = estado.fallos;
      aviso(
        "No se pudo completar la carga de uno o más archivos. Revisa el mensaje de la pantalla antes de reintentar.",
        "error",
      );
    }
  }, [estado, aviso]);
  if (!estado.activas) return null;
  return (
    <DialogoSistema titulo="Procesando archivos" ocupado>
      <div
        className="flex flex-col items-center gap-4 py-3 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="rounded-xl bg-white p-3">
          <Image
            src="/marca/logo-powerpos.png"
            alt="PowerPOS"
            width={80}
            height={82}
            unoptimized
            loading="eager"
            className="h-16 w-auto object-contain"
          />
        </div>
        <LoaderCircle
          aria-hidden="true"
          className="h-9 w-9 animate-spin text-orange-400 motion-reduce:animate-none"
        />
        <p className="font-semibold">
          {estado.activas === 1
            ? "Subiendo y procesando tu archivo…"
            : `Procesando ${estado.activas} archivos…`}
        </p>
        <p className="text-sm text-gray-300">
          Espera a que termine la carga. No cierres esta ventana.
        </p>
      </div>
    </DialogoSistema>
  );
}
