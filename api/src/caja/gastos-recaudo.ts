import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const MARCA_GASTO_RECAUDO = 'GastoPagadoConRecaudo';
export const SNAPSHOT_RECAUDO = 'ConsignacionRecaudoResumen';
type Base = Pick<Prisma.TransactionClient, 'auditoria'>;

export function validarMarcaRecaudo(valor: unknown, tipo: string, categoria: string, pedidoId?: unknown) {
  if (valor !== undefined && typeof valor !== 'boolean') throw new BadRequestException('Indica si el gasto se pagó con dinero del recaudo');
  if (valor === true && (tipo !== 'EGRESO' || ['COSTO_VENTA', 'VENTA'].includes(categoria) || pedidoId)) throw new BadRequestException('Solo los gastos pagados pueden descontarse del recaudo; no costos de venta ni devoluciones');
}

export async function guardarMarcaRecaudo(base: Base, empresaId: number, usuarioId: number, movimientoId: number, valor: boolean | undefined) {
  if (valor === undefined) return;
  await base.auditoria.create({ data: { empresaId, usuarioId, entidad: MARCA_GASTO_RECAUDO, entidadId: movimientoId, accion: valor ? 'MARCAR' : 'DESMARCAR', detalle: { pagadoConRecaudo: valor } } });
}

export async function idsGastosRecaudo(base: Base, empresaId: number, ids?: number[]) {
  if (ids && !ids.length) return new Set<number>();
  const eventos = await base.auditoria.findMany({ where: { empresaId, entidad: MARCA_GASTO_RECAUDO, ...(ids ? { entidadId: { in: ids } } : {}) }, select: { entidadId: true, detalle: true }, orderBy: { id: 'asc' } });
  const marcados = new Set<number>();
  for (const evento of eventos) {
    if (evento.entidadId === null) continue;
    if ((evento.detalle as any)?.pagadoConRecaudo === true) marcados.add(evento.entidadId);
    else marcados.delete(evento.entidadId);
  }
  return marcados;
}

export function disponibleRecaudo(recaudado: number, gastos: number) {
  const saldo = new Prisma.Decimal(recaudado).minus(gastos).toDecimalPlaces(2).toNumber();
  return { saldoDespuesGastos: saldo, disponibleConsignar: Math.max(0, saldo), faltanteParaGastos: Math.max(0, -saldo) };
}
