export function origenPermitido(
  origen: string | undefined,
  desarrollo = false,
) {
  if (!origen) return true; // Clientes nativos; siguen necesitando autenticación.
  try {
    const u = new URL(origen);
    if (u.origin !== origen || u.username || u.password) return false;
    if (
      desarrollo &&
      u.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(u.hostname)
    )
      return true;
    return (
      u.protocol === 'https:' &&
      !u.port &&
      (u.hostname === 'powerpospioneers.com' ||
        u.hostname.endsWith('.powerpospioneers.com'))
    );
  } catch {
    return false;
  }
}
