import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
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
      take: filtros?.completo ? undefined : 100,
    });
  }

  private async ventasPorMetodoPagoEnRango(empresaId: number, fechaDesde?: string, fechaHasta?: string) {
    const where: any = { sucursal: { empresaId }, estado: { not: 'ANULADO' } };
    if (fechaDesde || fechaHasta) {
      where.creadoEn = {};
      if (fechaDesde) where.creadoEn.gte = new Date(fechaDesde);
      if (fechaHasta) where.creadoEn.lte = new Date(fechaHasta);
    }
    const pedidos = await this.prisma.pedido.findMany({ where, select: { total: true, metodoPago: true } });
    const mapa = new Map<string, number>();
    for (const p of pedidos) {
      mapa.set(p.metodoPago, (mapa.get(p.metodoPago) || 0) + Number(p.total));
    }
    return {
      ventasPorMetodoPago: Array.from(mapa.entries()).map(([metodo, total]) => ({ metodo, total })),
      totalVentasRango: pedidos.reduce((acc, p) => acc + Number(p.total), 0),
      cantidadPedidosRango: pedidos.length,
    };
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

    const { ventasPorMetodoPago, totalVentasRango, cantidadPedidosRango } = await this.ventasPorMetodoPagoEnRango(empresaId, fechaDesde, fechaHasta);

    return {
      totalIngresos,
      totalEgresos,
      utilidad,
      porCategoria,
      totalVentasHoy,
      cantidadPedidosHoy: ventasHoy.length,
      ventasPorMetodoPago,
      totalVentasRango,
      cantidadPedidosRango,
    };
  }

  async exportarExcel(empresaId: number, fechaDesde?: string, fechaHasta?: string): Promise<Buffer> {
    const resumen = await this.resumenFinanciero(empresaId, fechaDesde, fechaHasta);
    const movimientos = await this.listarMovimientos(empresaId, { fechaDesde, fechaHasta, completo: true });

    const ETIQUETAS_METODO: Record<string, string> = {
      EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata',
    };

    const filasResumen: any[] = [
      ['Reporte financiero'],
      ['Periodo', `${fechaDesde ? new Date(fechaDesde).toLocaleDateString('es-CO') : 'Inicio'} a ${fechaHasta ? new Date(fechaHasta).toLocaleDateString('es-CO') : 'Hoy'}`],
      [],
      ['Total ingresos', resumen.totalIngresos],
      ['Total egresos', resumen.totalEgresos],
      ['Utilidad neta', resumen.utilidad],
      [],
      ['Ventas por forma de pago'],
      ['Forma de pago', 'Total'],
      ...resumen.ventasPorMetodoPago.map((v: any) => [ETIQUETAS_METODO[v.metodo] || v.metodo, v.total]),
      ['Total ventas del periodo', resumen.totalVentasRango],
      [],
      ['Movimientos por categoría', '', 'Ingreso', 'Egreso'],
      ...Object.entries(resumen.porCategoria as Record<string, { ingreso: number; egreso: number }>).map(([categoria, v]) => [categoria, '', v.ingreso, v.egreso]),
    ];
    const hojaResumen = XLSX.utils.aoa_to_sheet(filasResumen);
    hojaResumen['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];

    const hojaMovimientos = XLSX.utils.json_to_sheet(
      movimientos.map((m: any) => ({
        Fecha: new Date(m.fecha).toLocaleString('es-CO'),
        Tipo: m.tipo,
        Categoría: m.categoria,
        Descripción: m.descripcion,
        Monto: Number(m.monto),
        Usuario: m.usuario?.nombre || '',
      })),
    );
    hojaMovimientos['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 18 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');
    XLSX.utils.book_append_sheet(libro, hojaMovimientos, 'Movimientos');

    return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
