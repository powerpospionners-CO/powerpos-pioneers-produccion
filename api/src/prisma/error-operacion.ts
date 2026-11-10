// Solo códigos conocidos: nunca registrar mensajes de Prisma, SQL o URLs,
// porque pueden contener conexiones, parámetros o datos de clientes.
export function codigoErrorOperacion(error: unknown): string {
  const vistos = new Set<unknown>();
  let actual = error;
  for (let i = 0; i < 5 && actual && typeof actual === 'object' && !vistos.has(actual); i++) {
    vistos.add(actual);
    const e = actual as { code?: unknown; errorCode?: unknown; cause?: unknown };
    for (const codigo of [e.code, e.errorCode]) {
      if (typeof codigo === 'string' && /^P\d{4}$/.test(codigo)) return codigo;
    }
    actual = e.cause;
  }
  return 'SIN_CODIGO';
}
