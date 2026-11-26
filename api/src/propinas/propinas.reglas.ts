import { BadRequestException } from '@nestjs/common';

// Ley 1935 de 2018: la propina es voluntaria, se sugiere como máximo el 10 % y no es ingreso del negocio.
export const PORCENTAJE_MAXIMO = 10;
export const METODOS_PROPINA = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA'];
export type ConfigPropinas = { habilitado: boolean; porcentaje: number };
export const CONFIG_INICIAL: ConfigPropinas = { habilitado: false, porcentaje: 10 };

export function normalizarConfig(valor: unknown): ConfigPropinas {
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const porcentaje = Number(v.porcentaje);
  return {
    habilitado: v.habilitado === true,
    porcentaje: Number.isFinite(porcentaje) && porcentaje >= 0 && porcentaje <= PORCENTAJE_MAXIMO ? Math.round(porcentaje * 10) / 10 : CONFIG_INICIAL.porcentaje,
  };
}

export function validarConfig(body: unknown): ConfigPropinas {
  const v = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (typeof v.habilitado !== 'boolean') throw new BadRequestException('Indica si las propinas están habilitadas');
  const porcentaje = Number(v.porcentaje);
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > PORCENTAJE_MAXIMO)
    throw new BadRequestException(`La propina sugerida debe estar entre 0 % y ${PORCENTAJE_MAXIMO} %`);
  return { habilitado: v.habilitado, porcentaje: Math.round(porcentaje * 10) / 10 };
}

// Propina sugerida en pesos enteros sobre lo consumido (sin domicilio).
export function propinaSugerida(base: number, porcentaje: number) {
  return Math.max(0, Math.round((base * porcentaje) / 100));
}

// La propina viaja con la venta: { monto, metodoPago }. Cero o ausente = el cliente no la quiso.
export function leerPropina(valor: unknown, totalVenta: number): { monto: number; metodoPago: string } | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'object' || Array.isArray(valor)) throw new BadRequestException('Propina no válida');
  const v = valor as Record<string, unknown>;
  const monto = Number(v.monto);
  if (!Number.isFinite(monto) || monto < 0 || Math.round(monto * 100) !== monto * 100)
    throw new BadRequestException('El valor de la propina no es válido');
  if (monto === 0) return null;
  if (monto > Math.max(0, totalVenta)) throw new BadRequestException('La propina no puede superar el valor de la venta');
  if (typeof v.metodoPago !== 'string' || !METODOS_PROPINA.includes(v.metodoPago))
    throw new BadRequestException('Medio de pago de la propina no válido');
  return { monto, metodoPago: v.metodoPago };
}

// Partes iguales; conserva centavos cuando existen, sin perder dinero por redondeo.
export function repartirIgual(total: number, personas: number) {
  if (personas < 1) return [];
  const unidad = Number.isInteger(total) ? 1 : 100;
  const pesos = Math.round(total * unidad);
  const base = Math.floor(pesos / personas);
  const sobrante = pesos - base * personas;
  return Array.from({ length: personas }, (_, i) => (base + (i < sobrante ? 1 : 0)) / unidad);
}
