const DIA = 86400000;
function diaBogota(fecha: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha);
  const valor = (tipo: string) => Number(partes.find(p => p.type === tipo)!.value);
  return Date.UTC(valor('year'), valor('month') - 1, valor('day')) / DIA;
}

export function avisoSuscripcion(vence: Date | null, ahora = new Date()) {
  if (!vence || !Number.isFinite(vence.getTime())) return null;
  const finPlazo = new Date(vence.getTime() + 5 * DIA);
  const diasVencimiento = diaBogota(vence) - diaBogota(ahora);
  const diasPlazo = diaBogota(finPlazo) - diaBogota(ahora);
  // La segunda jornada permite recuperar un envío fallido sin avisar fuera de plazo.
  if (diasVencimiento >= 1 && diasVencimiento <= 2)
    return { etapa: 'VENCIMIENTO' as const, dias: diasVencimiento, vence, finPlazo };
  if (ahora >= vence && diasPlazo >= 1 && diasPlazo <= 2)
    return { etapa: 'FIN_PLAZO' as const, dias: diasPlazo, vence, finPlazo };
  return null;
}
