import { BadRequestException } from '@nestjs/common';
import { hash, texto } from './personal.reglas';

export function cuentaNomina(d: any, anterior?: any) {
  const campos = ['banco', 'tipoCuenta', 'numeroCuenta'];
  if (campos.every((k) => d[k] === undefined)) return anterior || null;
  if (campos.every((k) => !d[k])) return null;
  const numero = texto(d.numeroCuenta, 'número de cuenta', 24).replace(
    /\s/g,
    '',
  );
  if (
    !/^\d{5,24}$/.test(numero) ||
    !['AHORROS', 'CORRIENTE'].includes(d.tipoCuenta)
  )
    throw new BadRequestException(
      'Completa banco, tipo y número de cuenta (5 a 24 dígitos)',
    );
  return {
    banco: texto(d.banco, 'banco', 120),
    tipo: d.tipoCuenta,
    numero,
    titular: texto(d.nombre, 'titular de la cuenta', 200),
  };
}
export const revisionCuenta = (cuenta: any) =>
  hash(JSON.stringify(cuenta || null));
export function cuentaResumida(cuenta: any) {
  return cuenta
    ? {
        banco: cuenta.banco,
        tipo: cuenta.tipo,
        titular: cuenta.titular,
        terminacion: String(cuenta.numero).slice(-4),
      }
    : null;
}
export function empleadoDocumental(datos: any) {
  const { cuentaNomina: _cuenta, ...resto } = datos;
  return resto;
}
export function totalesNomina(conceptos: any[]) {
  const devengado = conceptos
    .filter((c) => c.tipo === 'DEVENGADO')
    .reduce((n, c) => n + c.montoCentavos, 0);
  const deducido = conceptos
    .filter((c) => c.tipo === 'DEDUCCION')
    .reduce((n, c) => n + c.montoCentavos, 0);
  return { devengado, deducido, neto: devengado - deducido };
}
