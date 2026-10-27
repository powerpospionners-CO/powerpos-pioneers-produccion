export function sumarMeses(fecha: Date, meses: number) {
  const resultado = new Date(fecha);
  const dia = resultado.getDate();
  resultado.setDate(1);
  resultado.setMonth(resultado.getMonth() + meses);
  const ultimoDia = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(dia, ultimoDia));
  return resultado;
}

export function suscripcionSuspendida(empresa: {
  pagoExonerado?: boolean | null;
  suscripcionVenceEn?: Date | string | null;
} | null | undefined, ahora = Date.now()) {
  if (empresa?.pagoExonerado || !empresa?.suscripcionVenceEn) return false;
  const vence = new Date(empresa.suscripcionVenceEn).getTime();
  return Number.isFinite(vence) && ahora > vence + 5 * 86400000;
}

export function estadoCobro(empresa: { pagoExonerado?: boolean | null; suscripcionVenceEn?: Date | string | null }, ahora = Date.now()) {
  if (empresa.pagoExonerado) return 'EXONERADO' as const;
  if (!empresa.suscripcionVenceEn) return 'SIN_CONFIGURAR' as const;
  return new Date(empresa.suscripcionVenceEn).getTime() > ahora ? 'AL_DIA' as const : 'PENDIENTE' as const;
}
