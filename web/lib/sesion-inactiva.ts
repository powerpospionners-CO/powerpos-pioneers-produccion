export const INACTIVIDAD_MS = 20 * 60 * 1000;
export const CLAVE_ACTIVIDAD = "powerpos-actividad-sesion";
type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function ultimaActividad(
  almacen: Almacen,
  inicioSesion: string,
): number {
  try {
    const marca = JSON.parse(almacen.getItem(CLAVE_ACTIVIDAD) || "null");
    if (marca?.sesion === inicioSesion && Number.isFinite(marca.instante))
      return marca.instante;
  } catch {
    /* Una marca inválida nunca renueva la sesión. */
  }
  return Date.parse(inicioSesion);
}
export function sesionInactiva(
  almacen: Almacen,
  inicioSesion: string,
  ahora = Date.now(),
): boolean {
  const ultima = ultimaActividad(almacen, inicioSesion);
  return (
    !Number.isFinite(ultima) ||
    ultima > ahora + 60000 ||
    ahora - ultima >= INACTIVIDAD_MS
  );
}
export function registrarActividad(
  almacen: Almacen,
  inicioSesion: string,
  ahora = Date.now(),
) {
  almacen.setItem(
    CLAVE_ACTIVIDAD,
    JSON.stringify({ sesion: inicioSesion, instante: ahora }),
  );
}
