import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinancieroService {
  constructor(private prisma: PrismaService) {}

  async registrarMovimiento(datos: any, usuarioId: number, empresaId: number, sucursalId: number) {
    const sucursal = await this.prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId, activo: true }, select: { id: true } });
    if (!sucursal) throw new BadRequestException('La sucursal no pertenece a esta empresa');
    if (datos.pedidoId) {
      const pedido = await this.prisma.pedido.findFirst({ where: { id: Number(datos.pedidoId), sucursal: { empresaId } }, select: { id: true } });
      if (!pedido) throw new BadRequestException('La venta no pertenece a esta empresa');
    }
    return this.prisma.movimientoFinanciero.create({
      data: {
        empresaId,
        sucursalId,
        usuarioId,
        tipo: datos.tipo,
        categoria: datos.categoria,
        descripcion: datos.descripcion,
        monto: datos.monto,
        pedidoId: datos.pedidoId || null,
        comprobante: datos.comprobante || null,
        fecha: datos.fecha ? new Date(datos.fecha) : new Date(),
      },
      include: {
        usuario: { select: { nombre: true } },
      },
    });
  }

  async listarMovimientos(empresaId: number, filtros?: any) {
    const where: any = { empresaId };

    if (filtros?.tipo) where.tipo = filtros.tipo;
    if (filtros?.categoria) where.categoria = filtros.categoria;
    if (filtros?.fechaDesde || filtros?.fechaHasta) {
      where.fecha = {};
      if (filtros.fechaDesde) where.fecha.gte = new Date(filtros.fechaDesde);
      if (filtros.fechaHasta) where.fecha.lte = new Date(filtros.fechaHasta);
    }

    return this.prisma.movimientoFinanciero.findMany({
      where,
      include: {
        usuario: { select: { nombre: true } },
        pedido: { select: { numero: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 100,
    });
  }

  async resumenFinanciero(empresaId: number, fechaDesde?: string, fechaHasta?: string) {
    const where: any = { empresaId };

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = new Date(fechaDesde);
      if (fechaHasta) where.fecha.lte = new Date(fechaHasta);
    }

    const movimientos = await this.prisma.movimientoFinanciero.findMany({ where });

    const totalIngresos = movimientos
      .filter(m => m.tipo === 'INGRESO')
      .reduce((acc, m) => acc + Number(m.monto), 0);

    const totalEgresos = movimientos
      .filter(m => m.tipo === 'EGRESO')
      .reduce((acc, m) => acc + Number(m.monto), 0);

    const utilidad = totalIngresos - totalEgresos;

    const porCategoria = movimientos.reduce((acc: any, m) => {
      if (!acc[m.categoria]) acc[m.categoria] = { ingreso: 0, egreso: 0 };
      if (m.tipo === 'INGRESO') acc[m.categoria].ingreso += Number(m.monto);
      else acc[m.categoria].egreso += Number(m.monto);
      return acc;
    }, {});

    // Ventas del día
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ventasHoy = await this.prisma.pedido.findMany({
      where: {
        sucursal: { empresaId },
        estado: { not: 'ANULADO' },
        creadoEn: { gte: hoy },
      },
    });
    const totalVentasHoy = ventasHoy.reduce((acc, p) => acc + Number(p.total), 0);

    return {
      totalIngresos,
      totalEgresos,
      utilidad,
      porCategoria,
      totalVentasHoy,
      cantidadPedidosHoy: ventasHoy.length,
    };
  }
}
