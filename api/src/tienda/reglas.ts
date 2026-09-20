import { BadRequestException } from '@nestjs/common';

export const tiendaDefaults = {
  publicada: true,
  pedidosHabilitados: false,
  titulo: '',
  descripcion: '',
  color: '#0f766e',
  portada: '',
  whatsapp: '',
  horario: '',
  sucursalId: 0,
  minimo: 0,
  zonas: [] as { nombre: string; costo: number }[],
};
export const puntosDefaults = {
  habilitado: false,
  compraPorPunto: 0,
  valorPunto: 0,
  categoriasExcluidas: [] as number[],
  productosExcluidos: [] as number[],
};
export function puntosConfig(value: unknown) {
  return { ...puntosDefaults, ...((value as object) || {}) };
}
export function tiendaConfig(value: unknown) {
  return { ...tiendaDefaults, ...((value as object) || {}) };
}
export function texto(
  value: unknown,
  campo: string,
  max = 200,
  requerido = false,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length > max ||
    (requerido && !value.trim())
  )
    throw new BadRequestException(`${campo} no válido`);
  return value.trim();
}
export function monto(value: unknown, campo: string, min = 0, max = 9999999) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.00001
  )
    throw new BadRequestException(`${campo} no válido`);
  return value;
}
export function calcularPuntos(
  items: { producto: { id: number; categoriaId: number }; subtotal: number }[],
  subtotal: number,
  descuento: number,
  config: ReturnType<typeof puntosConfig>,
) {
  if (!config.habilitado || config.compraPorPunto <= 0 || subtotal <= 0)
    return 0;
  const elegible = items
    .filter(
      (i) =>
        !config.productosExcluidos.includes(i.producto.id) &&
        !config.categoriasExcluidas.includes(i.producto.categoriaId),
    )
    .reduce((s, i) => s + i.subtotal, 0);
  // Distribuir el descuento proporcionalmente. Domicilio no genera puntos.
  return Math.floor(
    Math.max(0, elegible * (1 - descuento / subtotal)) / config.compraPorPunto,
  );
}
