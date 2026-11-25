// Los enlaces con parámetros pueden contener referencias privadas de pedidos o pagos.
export function paginaMedible(href: string, referrer = "") {
  try {
    const actual = new URL(href);
    if (!['https:', 'http:'].includes(actual.protocol) || actual.search || actual.hash) return false;
    if (referrer) {
      const origen = new URL(referrer);
      if (origen.search || origen.hash) return false;
    }
    return true;
  } catch { return false; }
}
