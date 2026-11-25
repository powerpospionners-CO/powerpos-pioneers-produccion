// Ficha de sesión del cliente, separada por tienda; nunca se envía a otra tienda.
const clave = (slug: string) => `cuenta:${slug}`;
export const EVENTO_CUENTA = "cuenta-tienda";

export function leerToken(slug: string) {
  try {
    const t = localStorage.getItem(clave(slug)) || "";
    return t.startsWith("cli.") ? t : "";
  } catch {
    return "";
  }
}

export function guardarToken(slug: string, token: string) {
  try {
    if (token) localStorage.setItem(clave(slug), token);
    else localStorage.removeItem(clave(slug));
  } catch {
    /* Sin almacenamiento la sesión dura lo que la página abierta. */
  }
  window.dispatchEvent(new Event(EVENTO_CUENTA));
}

export function encabezadoCuenta(slug: string): Record<string, string> {
  const t = leerToken(slug);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Identificador de idempotencia: el mismo envío repetido no crea dos registros.
export function claveEnvio(actual: { body: string; id: string }, body: string) {
  return actual.body === body ? actual : { body, id: crypto.randomUUID() };
}
