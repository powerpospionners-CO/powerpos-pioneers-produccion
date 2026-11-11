import { Prisma } from '@prisma/client';

type PedidoResumen = { distribuidorId: number; estado: string; estadoGestion: string; total: unknown; comisionMonto: unknown; liquidacionId: number | null; comisionDisponible: boolean; creadoEn: Date };
export function resumirVentasDistribuidores(pedidos: PedidoResumen[]) {
  const acumulados = new Map<number, { ventas: Prisma.Decimal; retiro: Prisma.Decimal; comision: Prisma.Decimal; base: Prisma.Decimal; cantidadVentas: number; cantidadRetiro: number; cantidadLiquidable: number; cantidadRevision: number; primera: Date | null }>();
  for (const p of pedidos) {
    if (p.estado === 'ANULADO' || p.estadoGestion === 'ANULADO') continue;
    let r = acumulados.get(p.distribuidorId);
    if (!r) { r = { ventas: new Prisma.Decimal(0), retiro: new Prisma.Decimal(0), comision: new Prisma.Decimal(0), base: new Prisma.Decimal(0), cantidadVentas: 0, cantidadRetiro: 0, cantidadLiquidable: 0, cantidadRevision: 0, primera: null }; acumulados.set(p.distribuidorId, r); }
    if (p.estadoGestion === 'PENDIENTE_RETIRO') { r.retiro = r.retiro.plus(String(p.total)); r.cantidadRetiro++; }
    else if (['PAGADO', 'PENDIENTE_PAGO', 'HISTORICO'].includes(p.estadoGestion)) { r.ventas = r.ventas.plus(String(p.total)); r.cantidadVentas++; }
    if (p.estadoGestion === 'EN_REVISION' || (p.estadoGestion === 'HISTORICO' && p.liquidacionId === null)) r.cantidadRevision++;
    if (p.comisionDisponible && p.liquidacionId === null) {
      r.comision = r.comision.plus(String(p.comisionMonto)); r.base = r.base.plus(String(p.total)); r.cantidadLiquidable++;
      if (!r.primera || p.creadoEn < r.primera) r.primera = p.creadoEn;
    }
  }
  return [...acumulados].map(([distribuidorId, r]) => ({ distribuidorId, ventasEntregadas: r.ventas.toDecimalPlaces(2).toNumber(), cantidadVentas: r.cantidadVentas, pendienteRetiro: r.retiro.toDecimalPlaces(2).toNumber(), cantidadRetiro: r.cantidadRetiro, comisionPendiente: r.comision.toDecimalPlaces(2).toNumber(), ventasPorLiquidar: r.base.toDecimalPlaces(2).toNumber(), cantidadLiquidable: r.cantidadLiquidable, cantidadRevision: r.cantidadRevision, primeraVentaLiquidable: r.primera?.toISOString() ?? null }));
}
