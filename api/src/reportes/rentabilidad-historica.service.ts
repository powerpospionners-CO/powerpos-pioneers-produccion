import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { fechaDia } from '../administracion/administracion.service';
import { excelReport } from '../common/excel-report';

const redondear = (n: number) => Math.round(n * 100) / 100;
@Injectable()
export class RentabilidadHistoricaService {
  constructor(private readonly prisma: PrismaService) {}
  async consultar(empresaId: number, desdeInput: string, hastaInput: string, sucursalInput?: string) {
    const desde = fechaDia(desdeInput);
    const hasta = new Date(fechaDia(hastaInput).getTime() + 86400000);
    if (hasta <= desde || hasta.getTime() - desde.getTime() > 93 * 86400000) throw new BadRequestException('Selecciona entre uno y 93 días');
    const sucursalId = sucursalInput ? Number(sucursalInput) : undefined;
    if (sucursalInput && (!Number.isInteger(sucursalId) || sucursalId! <= 0 || !await this.prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId }, select: { id: true } }))) throw new BadRequestException('Sucursal no disponible');
    const where = { sucursal: { empresaId }, ...(sucursalId ? { sucursalId } : {}), estado: { not: 'ANULADO' as const }, creadoEn: { gte: desde, lt: hasta } };
    if (await this.prisma.pedido.count({ where }) > 50000) throw new BadRequestException('Selecciona un periodo más corto o una sucursal');
    const pedidos = await this.prisma.pedido.findMany({ where, select: { subtotal: true, descuento: true, costoVentaHistorico: true, detalles: { select: { productoId: true, cantidad: true, subtotal: true, costoVentaHistorico: true, producto: { select: { nombre: true } } } } } });
    let ventasCubiertas = 0, costo = 0, ventasSinCosto = 0, pedidosSinCosto = 0;
    const productos = new Map<number, { nombre: string; cantidad: number; ventas: number; costo: number }>();
    for (const p of pedidos) {
      const ventas = Number(p.subtotal) - Number(p.descuento);
      if (p.costoVentaHistorico === null) { pedidosSinCosto++; ventasSinCosto += ventas; continue; }
      ventasCubiertas += ventas;
      costo += Number(p.costoVentaHistorico);
      const factor = Number(p.subtotal) ? ventas / Number(p.subtotal) : 0;
      for (const d of p.detalles) {
        const grupo = productos.get(d.productoId) || { nombre: d.producto.nombre, cantidad: 0, ventas: 0, costo: 0 };
        grupo.cantidad += d.cantidad;
        grupo.ventas += Number(d.subtotal) * factor;
        grupo.costo += Number(d.costoVentaHistorico);
        productos.set(d.productoId, grupo);
      }
    }
    return { desde: desdeInput, hasta: hastaInput, sucursalId: sucursalId ?? null, pedidosConCosto: pedidos.length - pedidosSinCosto, pedidosSinCosto, ventasSinCosto: redondear(ventasSinCosto), ventasCubiertas: redondear(ventasCubiertas), costo: redondear(costo), margenBruto: redondear(ventasCubiertas - costo), productos: [...productos.values()].map(p => ({ ...p, ventas: redondear(p.ventas), costo: redondear(p.costo), margenBruto: redondear(p.ventas - p.costo) })).sort((a,b) => b.margenBruto - a.margenBruto) };
  }
  async exportar(empresaId: number, desde: string, hasta: string, sucursalId?: string) {
    const d = await this.consultar(empresaId, desde, hasta, sucursalId);
    return excelReport('Rentabilidad histórica', `${desde} a ${hasta} · Sucursal: ${d.sucursalId ?? 'Consolidado'} · Margen bruto antes de gastos. Solo ventas con costo conservado. Domicilio excluido.`, [
      { name: 'Resumen', headers: ['Indicador', 'Valor'], rows: [['Ventas cubiertas (COP)', d.ventasCubiertas], ['Costo conservado (COP)', d.costo], ['Margen bruto (COP)', d.margenBruto], ['Pedidos cubiertos', d.pedidosConCosto], ['Pedidos sin costo', d.pedidosSinCosto], ['Ventas sin costo (COP)', d.ventasSinCosto]] },
      { name: 'Productos', headers: ['Producto', 'Cantidad', 'Ventas netas', 'Costo conservado', 'Margen bruto'], money: [2,3,4], rows: d.productos.map(p => [p.nombre, p.cantidad, p.ventas, p.costo, p.margenBruto]), chart: { title: 'Margen bruto histórico · COP', label: 0, value: 4 } },
    ]);
  }
}
