"use client";
import { useState } from "react";
import api from "@/lib/api";
export default function SelectorArchivoPersonal({
  name,
  required,
  className,
  onOcupado,
  onSubido,
  archivoActual,
}: {
  name: string;
  required?: boolean;
  className?: string;
  onOcupado: (ocupado: boolean) => void;
  onSubido?: (id: string) => void;
  archivoActual?: string | null;
}) {
  const [archivoId, setArchivoId] = useState(archivoActual || "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <input type="hidden" name={name} value={archivoId} />
      <input
        type="file"
        name={`${name}-seleccion`}
        accept="application/pdf"
        required={required && !archivoActual}
        disabled={ocupado}
        className={className}
        onChange={async (e) => {
          const input = e.currentTarget,
            archivo = input.files?.[0];
          setArchivoId("");
          onSubido?.("");
          setError("");
          if (!archivo) return;
          if (archivo.size > 5 * 1024 * 1024 || !/\.pdf$/i.test(archivo.name)) {
            input.value = "";
            setError("Selecciona un PDF de máximo 5 MB.");
            return;
          }
          setOcupado(true);
          onOcupado(true);
          try {
            const body = new FormData();
            body.append("archivo", archivo);
            const { data } = await api.post("/personal/archivos", body, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            if (typeof data.id !== "string" || !data.id)
              throw Error("No se pudo confirmar la carga del archivo");
            setArchivoId(data.id);
            onSubido?.(data.id);
          } catch (e: any) {
            input.value = "";
            setError(
              String(
                e.response?.data?.message ||
                  "No se pudo subir el PDF. Selecciónalo nuevamente para reintentar.",
              ),
            );
          } finally {
            setOcupado(false);
            onOcupado(false);
          }
        }}
      />
      {ocupado && (
        <span role="status" className="mt-2 block text-sm text-gray-300">
          Subiendo documento…
        </span>
      )}
      {archivoId && (
        <span role="status" className="mt-2 block text-sm text-green-400">
          Documento cargado. Pulsa Guardar para registrar los datos del
          formulario.
        </span>
      )}
      {error && (
        <span role="alert" className="mt-2 block text-sm text-red-400">
          {error}
        </span>
      )}
    </>
  );
}
