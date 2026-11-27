import { BadRequestException } from '@nestjs/common';

const DIA = 86400000;

// Un día de calendario de Bogotá (UTC-5 todo el año).
export function diaBogota(fecha?: unknown) {
  const texto = fecha === undefined || fecha === '' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()) : fecha;
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) throw new BadRequestException('Fecha no válida');
  const inicio = new Date(`${texto}T00:00:00.000-05:00`);
  if (Number.isNaN(inicio.getTime())) throw new BadRequestException('Fecha no válida');
  return { fecha: texto, inicio, fin: new Date(inicio.getTime() + DIA - 1) };
}

export function semanaAntes(d: { inicio: Date; fin: Date }) {
  return { inicio: new Date(d.inicio.getTime() - 7 * DIA), fin: new Date(d.fin.getTime() - 7 * DIA) };
}

export function rango(desde: unknown, hasta: unknown, maxDias = 92) {
  const a = diaBogota(desde), b = diaBogota(hasta);
  if (b.fin < a.inicio || b.fin.getTime() - a.inicio.getTime() > maxDias * DIA) throw new BadRequestException(`El periodo debe ser de máximo ${maxDias} días`);
  return { inicio: a.inicio, fin: b.fin };
}

// Variación porcentual frente al mismo día de la semana anterior.
export function variacion(actual: number, anterior: number) {
  if (!(anterior > 0)) return null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

// Hora local 0–23 de una fecha.
export const horaBogota = (f: Date) => (new Date(f.getTime() - 5 * 3600000).getUTCHours());

export type ControlUsuario = {
  clave: string;
  nombre: string;
  rol: string;
  sedes: string[];
  ventas: number;
  totalVendido: number;
  descuentos: number;
  anulaciones: number;
  montoAnulado: number;
  devoluciones: number;
  montoDevuelto: number;
  correccionesPago: number;
  aperturasIrregulares: number;
  diferenciasCaja: number;
  faltanteCaja: number;
  alertas: string[];
};

export function nuevoControl(clave: string, nombre: string, rol: string): ControlUsuario {
  return { clave, nombre, rol, sedes: [], ventas: 0, totalVendido: 0, descuentos: 0, anulaciones: 0, montoAnulado: 0, devoluciones: 0, montoDevuelto: 0, correccionesPago: 0, aperturasIrregulares: 0, diferenciasCaja: 0, faltanteCaja: 0, alertas: [] };
}

// Señales para revisar, no acusaciones: proporciones altas frente a lo vendido.
export function alertasControl(u: ControlUsuario) {
  const alertas: string[] = [];
  const base = u.totalVendido + u.montoAnulado;
  if (u.anulaciones >= 3 && base > 0 && u.montoAnulado / base > 0.05) alertas.push('Anula más del 5 % de lo que vende');
  if (u.totalVendido > 0 && u.descuentos / (u.totalVendido + u.descuentos) > 0.1) alertas.push('Descuentos mayores al 10 %');
  if (u.devoluciones >= 3 && u.totalVendido > 0 && u.montoDevuelto / u.totalVendido > 0.05) alertas.push('Devoluciones mayores al 5 %');
  if (u.faltanteCaja < -20000) alertas.push('Faltantes de caja acumulados');
  if (u.aperturasIrregulares > 0) alertas.push('Aperturas irregulares de caja');
  return alertas;
}
