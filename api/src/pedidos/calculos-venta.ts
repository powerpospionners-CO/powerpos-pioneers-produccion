import { BadRequestException } from '@nestjs/common';

const METODOS_PAGO_VALIDOS = [
  'EFECTIVO',
  'TARJETA',
  'TRANSFERENCIA',
  'NEQUI',
  'DAVIPLATA',
];

// Valida y normaliza el desglose de pago de una venta. Acepta el campo
// clásico `metodoPago` (pago único) o `pagos: [{metodoPago, monto}]` para
// pagos mixtos (ej. parte en efectivo, parte por transferencia).
export function normalizarPagos(
  datos: { pagos?: unknown; metodoPago?: unknown },
  total: number,
): { metodoPago: string; pagos: { metodoPago: string; monto: number }[] } {
  if (Array.isArray(datos.pagos) && datos.pagos.length > 0) {
    if (datos.pagos.length > 5)
      throw new BadRequestException('Un pago admite máximo 5 medios distintos');
    const pagos = datos.pagos.map((valor: unknown) => {
      if (!valor || typeof valor !== 'object' || Array.isArray(valor))
        throw new BadRequestException('Pago inválido');
      const p = valor as Record<string, unknown>;
      if (
        typeof p.metodoPago !== 'string' ||
        !METODOS_PAGO_VALIDOS.includes(p.metodoPago)
      )
        throw new BadRequestException('Medio de pago no válido');
      const monto = Number(p.monto);
      if (!Number.isFinite(monto) || monto <= 0)
        throw new BadRequestException(
          'El monto de cada pago debe ser mayor a cero',
        );
      return { metodoPago: p.metodoPago, monto: Math.round(monto * 100) / 100 };
    });
    const suma = pagos.reduce((acc, p) => acc + p.monto, 0);
    if (Math.round(suma * 100) !== Math.round(total * 100)) {
      throw new BadRequestException(
        `La suma de los pagos ($${suma.toLocaleString('es-CO')}) no coincide con el total de la venta ($${total.toLocaleString('es-CO')})`,
      );
    }
    const metodoPago = pagos.length > 1 ? 'MIXTO' : pagos[0].metodoPago;
    return { metodoPago, pagos };
  }
  const metodoPago = datos.metodoPago || 'EFECTIVO';
  if (
    typeof metodoPago !== 'string' ||
    !METODOS_PAGO_VALIDOS.includes(metodoPago)
  )
    throw new BadRequestException('Medio de pago no válido');
  return { metodoPago, pagos: [{ metodoPago, monto: total }] };
}

export function calcularCostoVenta(
  itemsValidados: {
    producto: {
      ingredientes?: {
        ingrediente?: { costoUnitario?: unknown };
        cantidad: unknown;
      }[];
      costo?: unknown;
    };
    cantidad: number;
    factorUnidades?: number;
  }[],
): number {
  return itemsValidados.reduce((total, item) => {
    const { producto, cantidad } = item;
    const factorUnidades = item.factorUnidades ?? 1;
    let costoUnitario = 0;
    if (producto.ingredientes && producto.ingredientes.length > 0) {
      costoUnitario = producto.ingredientes.reduce((acc, pi) => {
        const costoIngrediente = pi.ingrediente?.costoUnitario
          ? Number(pi.ingrediente.costoUnitario)
          : 0;
        return acc + costoIngrediente * Number(pi.cantidad);
      }, 0);
    } else if (producto.costo !== null && producto.costo !== undefined) {
      // El costo del producto es por unidad base; una presentación de
      // varias unidades (ej. un tarro) cuesta ese costo multiplicado por
      // cuántas unidades base contiene.
      costoUnitario = Number(producto.costo) * factorUnidades;
    }
    return total + costoUnitario * cantidad;
  }, 0);
}
