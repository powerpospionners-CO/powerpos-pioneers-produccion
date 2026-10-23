import { BadRequestException } from '@nestjs/common';

const ZONA_BOGOTA = 'America/Bogota';

export function sumarDias(fecha: string, dias: number) {
  const utc = new Date(`${fecha}T12:00:00.000Z`);
  utc.setUTCDate(utc.getUTCDate() + dias);
  return utc.toISOString().slice(0, 10);
}

export function fechaBogota(fecha: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_BOGOTA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

export function rangoSemana(periodoInicio: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodoInicio)) {
    throw new BadRequestException(
      'La fecha de inicio debe tener formato AAAA-MM-DD',
    );
  }
  const medioDiaUtc = new Date(`${periodoInicio}T12:00:00.000Z`);
  if (
    Number.isNaN(medioDiaUtc.getTime()) ||
    medioDiaUtc.toISOString().slice(0, 10) !== periodoInicio ||
    medioDiaUtc.getUTCDay() !== 1
  ) {
    throw new BadRequestException('El período debe iniciar un lunes válido');
  }
  return {
    desde: new Date(`${periodoInicio}T05:00:00.000Z`),
    hasta: new Date(`${sumarDias(periodoInicio, 7)}T05:00:00.000Z`),
    fin: sumarDias(periodoInicio, 6),
  };
}
