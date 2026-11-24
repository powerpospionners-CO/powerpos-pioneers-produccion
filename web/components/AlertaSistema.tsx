import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
export default function AlertaSistema({
  tipo = "info",
  children,
}: {
  tipo?: "error" | "exito" | "info";
  children: ReactNode;
}) {
  const Icono =
    tipo === "error" ? AlertCircle : tipo === "exito" ? CheckCircle2 : Info;
  const estilo =
    tipo === "error"
      ? "border-red-500/50 bg-red-950/50 text-red-200"
      : tipo === "exito"
        ? "border-green-500/50 bg-green-950/40 text-green-200"
        : "border-blue-500/40 bg-blue-950/40 text-blue-200";
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      data-tipo={tipo}
      className={`powerpos-alerta my-3 flex items-start gap-3 rounded-xl border p-4 ${estilo}`}
    >
      <Icono aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
}
