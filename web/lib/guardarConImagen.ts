export async function guardarConImagen<T>({
  guardar,
  recordar,
  subirImagen,
}: {
  guardar: () => Promise<T>;
  recordar: (registro: T) => void;
  subirImagen?: (registro: T) => Promise<unknown>;
}) {
  const registro = await guardar();
  // Conservar la identidad antes de subir el archivo permite reintentar sin crear duplicados.
  recordar(registro);
  if (subirImagen) await subirImagen(registro);
  return registro;
}
