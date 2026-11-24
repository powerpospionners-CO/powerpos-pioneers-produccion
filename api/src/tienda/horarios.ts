import { BadRequestException } from '@nestjs/common';
export type HorarioDia = {
  dia: number;
  abierto: boolean;
  apertura: string;
  cierre: string;
};
const dias = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];
export function validarHorarios(value: unknown): HorarioDia[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 7)
    throw new BadRequestException('Configura los siete días del horario');
  return dias.map((_, dia) => {
    const h = value.find((h) => h?.dia === dia);
    if (
      !h ||
      typeof h.abierto !== 'boolean' ||
      value.filter((h) => h?.dia === dia).length !== 1
    )
      throw new BadRequestException('No repitas ni omitas días del horario');
    if (!h.abierto) return { dia, abierto: false, apertura: '', cierre: '' };
    if (
      ![h.apertura, h.cierre].every(
        (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
      ) ||
      h.apertura === h.cierre
    )
      throw new BadRequestException(
        `Selecciona apertura y cierre diferentes para ${dias[dia]}`,
      );
    return { dia, abierto: true, apertura: h.apertura, cierre: h.cierre };
  });
}
function hora(h: string) {
  const [hh, mm] = h.split(':');
  const n = Number(hh);
  return `${n % 12 || 12}:${mm} ${n < 12 ? 'a. m.' : 'p. m.'}`;
}
export function resumenHorarios(horarios: HorarioDia[]) {
  const partes: string[] = [];
  for (let i = 0; i < horarios.length; i++) {
    const h = horarios[i];
    let fin = i;
    while (
      fin + 1 < horarios.length &&
      ['abierto', 'apertura', 'cierre'].every(
        (k) => horarios[fin + 1][k] === h[k],
      )
    )
      fin++;
    const rango = fin > i ? `${dias[i]} a ${dias[fin].toLowerCase()}` : dias[i];
    partes.push(
      `${rango}: ${h.abierto ? `${hora(h.apertura)} – ${hora(h.cierre)}${h.cierre < h.apertura ? ' (día siguiente)' : ''}` : 'cerrado'}`,
    );
    i = fin;
  }
  return partes.join('; ');
}
