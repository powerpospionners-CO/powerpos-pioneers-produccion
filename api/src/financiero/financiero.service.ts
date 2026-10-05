import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  // Solo los egresos que el admin registró a mano (sin pedidoId) se pueden
  // editar — los ingresos de ventas y el costo de venta se generan solos al
  // registrar un pedido, y editarlos a mano rompería el cuadre con Caja.
  async editarMovimiento(id: number, datos: any, empresaId: number) {
    const movimiento = await this.prisma.movimientoFinanciero.findFirst({ where: { id, empresaId } });
    if (!movimiento) throw new NotFoundException('Movimiento no encontrado');
    if (movimiento.tipo !== 'EGRESO' || movimiento.pedidoId !== null) {
      throw new ForbiddenException('Solo se pueden editar los egresos registrados manualmente, no los generados por una venta');
    }

    const data: Record<string, unknown> = {};
    if (datos.categoria !== undefined) data.categoria = datos.categoria;
    if (datos.descripcion !== undefined) {
      const descripcion = String(datos.descripcion).trim();
      if (!descripcion) throw new BadRequestException('La descripción es obligatoria');
      data.descripcion = descripcion;
    }
    if (datos.monto !== undefined) {
      const monto = Number(datos.monto);
      if (!Number.isFinite(monto) || monto <= 0) throw new BadRequestException('El monto debe ser un número mayor a 0');
      data.monto = monto;
    }
    if (datos.comprobante !== undefined) data.comprobante = datos.comprobante || null;
    if (datos.fecha !== undefined) data.fecha = new Date(datos.fecha);

    return this.prisma.movimientoFinanciero.update({
      where: { id },
      data,
      include: { usuario: { select: { nombre: true } } },
    });
  }

  // Mismo criterio que editar: solo egresos registrados a mano.
  async eliminarMovimiento(id: number, empresaId: number) {
    const movimiento = await this.prisma.movimientoFinanciero.findFirst({ where: { id, empresaId } });
    if (!movimiento) throw new NotFoundException('Movimiento no encontrado');
    if (movimiento.tipo !== 'EGRESO' || movimiento.pedidoId !== null) {
      throw new ForbiddenException('Solo se pueden eliminar los egresos registrados manualmente, no los generados por una venta');
    }
    await this.prisma.movimientoFinanciero.delete({ where: { id } });
    return { ok: true };
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
    const pedidos = await this.prisma.pedido.findMany({
      where,
      select: { total: true, metodoPago: true, pagos: { select: { metodoPago: true, monto: true } } },
    });
    // Una venta con pago mixto (metodoPago = 'MIXTO') no debe sumarse como un
    // solo bloque: se reparte entre sus medios reales (tabla `pagos`) para que
    // el desglose coincida con el de Caja. Las ventas anteriores a los pagos
    // mixtos no tienen filas en `pagos`, así que usan `metodoPago` de respaldo.
    const mapa = new Map<string, number>();
    for (const p of pedidos) {
      if (p.pagos.length > 0) {
        for (const pago of p.pagos) {
          mapa.set(pago.metodoPago, (mapa.get(pago.metodoPago) || 0) + Number(pago.monto));
        }
      } else {
        mapa.set(p.metodoPago, (mapa.get(p.metodoPago) || 0) + Number(p.total));
      }
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

    // Al anular una venta se crea el movimiento contrario (EGRESO/VENTA) para
    // no perder el rastro, pero no es un gasto real del negocio -- es solo la
    // reversión de la venta, así que no debe sumar en el total de egresos.
    const totalEgresos = movimientos
      .filter(m => m.tipo === 'EGRESO' && m.categoria !== 'VENTA')
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
