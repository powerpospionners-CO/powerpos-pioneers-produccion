import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { excelReport } from '../common/excel-report';
import { desgloseCobros } from '../pedidos/operaciones-venta.reglas';
import { PrismaService } from '../prisma/prisma.service';
import { guardarMarcaRecaudo, idsGastosRecaudo, validarMarcaRecaudo } from '../caja/gastos-recaudo';

@Injectable()
export class FinancieroService {
  constructor(private prisma: PrismaService) {}

  async registrarMovimiento(datos: any, usuarioId: number, empresaId: number, sucursalId: number) {
    validarMarcaRecaudo(datos.pagadoConRecaudo, datos.tipo, datos.categoria, datos.pedidoId);
    if (datos.categoria === 'COMPRA_MERCANCIA') {
      throw new BadRequestException('Registra la compra de mercancía desde el módulo Compras para actualizar el inventario');
    }
    const sucursal = await this.prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId, activo: true }, select: { id: true } });
    if (!sucursal) throw new BadRequestException('La sucursal no pertenece a esta empresa');
    if (datos.pedidoId) {
      const pedido = await this.prisma.pedido.findFirst({ where: { id: Number(datos.pedidoId), sucursal: { empresaId } }, select: { id: true } });
      if (!pedido) throw new BadRequestException('La venta no pertenece a esta empresa');
    }
    return this.prisma.$transaction(async (tx) => {
      const movimiento = await tx.movimientoFinanciero.create({
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
        include: { usuario: { select: { nombre: true } } },
      });
      await tx.auditoria.create({
        data: {
          empresaId,
          usuarioId,
          accion: 'CREAR',
          entidad: 'MOVIMIENTO_FINANCIERO',
          entidadId: movimiento.id,
          detalle: {
            tipo: movimiento.tipo,
            categoria: movimiento.categoria,
            descripcion: movimiento.descripcion,
            monto: Number(movimiento.monto),
            fecha: movimiento.fecha.toISOString(),
          },
        },
      });
      await guardarMarcaRecaudo(tx, empresaId, usuarioId, movimiento.id, datos.pagadoConRecaudo === true ? true : undefined);
      return { ...movimiento, pagadoConRecaudo: datos.pagadoConRecaudo === true };
    });
  }

  // Solo los egresos que el admin registró a mano (sin pedidoId) se pueden
  // editar — los ingresos de ventas y el costo de venta se generan solos al
  // registrar un pedido, y editarlos a mano rompería el cuadre con Caja.
  async editarMovimiento(id: number, datos: any, empresaId: number, usuarioId: number) {
    const movimiento = await this.prisma.movimientoFinanciero.findFirst({ where: { id, empresaId } });
    if (!movimiento) throw new NotFoundException('Movimiento no encontrado');
    validarMarcaRecaudo(datos.pagadoConRecaudo, movimiento.tipo, datos.categoria ?? movimiento.categoria, movimiento.pedidoId);
    if (movimiento.compraGastoId !== null) {
      throw new ForbiddenException('Este movimiento está vinculado a Compras y no se puede editar aquí');
    }
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

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM movimientos_financieros WHERE id = ${id} AND "empresaId" = ${empresaId} FOR UPDATE`;
      await this.validarMovimientoAdministrativo(tx, id);
      const actualizado = await tx.movimientoFinanciero.update({
        where: { id },
        data,
        include: { usuario: { select: { nombre: true } } },
      });
      await tx.auditoria.create({
        data: {
          empresaId,
          usuarioId,
          accion: 'EDITAR',
          entidad: 'MOVIMIENTO_FINANCIERO',
          entidadId: id,
          detalle: {
            anterior: {
              categoria: movimiento.categoria,
              descripcion: movimiento.descripcion,
              monto: Number(movimiento.monto),
              fecha: movimiento.fecha.toISOString(),
            },
            nuevo: {
              categoria: actualizado.categoria,
              descripcion: actualizado.descripcion,
              monto: Number(actualizado.monto),
              fecha: actualizado.fecha.toISOString(),
            },
          },
        },
      });
      await guardarMarcaRecaudo(tx, empresaId, usuarioId, id, datos.pagadoConRecaudo);
      return actualizado;
    });
  }

  // Mismo criterio que editar: solo egresos registrados a mano.
  async eliminarMovimiento(id: number, empresaId: number, usuarioId: number) {
    const movimiento = await this.prisma.movimientoFinanciero.findFirst({ where: { id, empresaId } });
    if (!movimiento) throw new NotFoundException('Movimiento no encontrado');
    if (movimiento.compraGastoId !== null) {
      throw new ForbiddenException('Este movimiento está vinculado a Compras y no se puede eliminar aquí');
    }
    if (movimiento.tipo !== 'EGRESO' || movimiento.pedidoId !== null) {
      throw new ForbiddenException('Solo se pueden eliminar los egresos registrados manualmente, no los generados por una venta');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM movimientos_financieros WHERE id = ${id} AND "empresaId" = ${empresaId} FOR UPDATE`;
      await this.validarMovimientoAdministrativo(tx, id);
      await tx.auditoria.create({
        data: {
          empresaId,
          usuarioId,
          accion: 'ELIMINAR',
          entidad: 'MOVIMIENTO_FINANCIERO',
          entidadId: id,
          detalle: {
            tipo: movimiento.tipo,
            categoria: movimiento.categoria,
            descripcion: movimiento.descripcion,
            monto: Number(movimiento.monto),
            fecha: movimiento.fecha.toISOString(),
          },
        },
      });
      await tx.movimientoFinanciero.delete({ where: { id } });
    });
    return { ok: true };
  }

  private async validarMovimientoAdministrativo(tx: import('@prisma/client').Prisma.TransactionClient, id: number) {
    const [abono, conciliacion] = await Promise.all([
      tx.abonoAdministrativo.findUnique({ where: { movimientoId: id }, select: { id: true } }),
      tx.conciliacionAdministrativa.findUnique({ where: { movimientoId: id }, select: { id: true } }),
    ]);
    if (abono || conciliacion) throw new ForbiddenException('Un abono o movimiento conciliado requiere una reversión documentada; no se puede editar ni eliminar');
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

    // El límite de 100 solo tiene sentido cuando no hay rango de fechas (para
    // no traer el historial completo por accidente) — una vez hay fechaDesde
    // o fechaHasta, el propio rango ya acota el resultado, y capar encima de
    // eso esconde movimientos reales en meses con muchas ventas (cada venta
    // genera su propio ingreso + costo de venta, así que el tope de 100 se
    // llenaba de eso y dejaba por fuera egresos de días anteriores del mismo
    // rango, aunque sí cumplían el filtro de fecha).
    const sinLimite = filtros?.completo || filtros?.fechaDesde || filtros?.fechaHasta;

    const movimientos = await this.prisma.movimientoFinanciero.findMany({
      where,
      include: {
        usuario: { select: { nombre: true } },
        pedido: { select: { numero: true } },
      },
      orderBy: { fecha: 'desc' },
      take: sinLimite ? undefined : 100,
    });
    const marcados = await idsGastosRecaudo(this.prisma, empresaId, movimientos.map(m => m.id));
    return movimientos.map(m => ({ ...m, pagadoConRecaudo: marcados.has(m.id) }));
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
    const operaciones = await this.prisma.operacionVentaCaja.findMany({ where: { empresaId, ...(where.creadoEn ? { creadoEn: where.creadoEn } : {}) } });
    const devoluciones = operaciones.filter(o=>o.tipo==='DEVOLUCION').reduce((s,o)=>s+Number((o.detalle as any)?.valorTotal||0),0);
    return {
      ajusteCartera: pedidos.filter(p=>p.metodoPago==='CREDITO').reduce((s,p)=>s+Number(p.total),0) - operaciones.filter(o=>o.tipo==='COBRO_CREDITO').reduce((s,o)=>s+Number(o.monto),0) - operaciones.filter(o=>o.tipo==='DEVOLUCION').reduce((s,o)=>s+Number((o.detalle as any)?.deudaReducida||0),0),
      ventasPorMetodoPago: desgloseCobros(pedidos, operaciones),
      totalVentasRango: pedidos.reduce((acc, p) => acc + Number(p.total), 0) - devoluciones,
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
      .filter(m => m.tipo === 'INGRESO' && m.categoria !== 'COSTO_VENTA')
      .reduce((acc, m) => acc + Number(m.monto), 0) - movimientos.filter(m => m.tipo === 'EGRESO' && m.categoria === 'VENTA').reduce((acc,m)=>acc+Number(m.monto),0);

    // Al anular una venta se crea el movimiento contrario (EGRESO/VENTA) para
    // no perder el rastro, pero no es un gasto real del negocio -- es solo la
    // reversión de la venta, así que no debe sumar en el total de egresos.
    const totalEgresos = movimientos
      .filter(m => m.tipo === 'EGRESO' && m.categoria !== 'VENTA')
      .reduce((acc, m) => acc + Number(m.monto), 0) - movimientos.filter(m => m.tipo === 'INGRESO' && m.categoria === 'COSTO_VENTA').reduce((acc,m)=>acc+Number(m.monto),0);

    const totalComprasInventario = movimientos
      .filter(m => m.tipo === 'EGRESO' && ['COMPRA_MERCANCIA', 'COMPRA_INSUMOS'].includes(m.categoria))
      .reduce((acc, m) => acc + Number(m.monto), 0);

    // Las compras aumentan el inventario y salen de caja, pero su costo se
    // reconoce en la utilidad mediante COSTO_VENTA cuando se vende el producto.


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

    const { ventasPorMetodoPago, totalVentasRango, cantidadPedidosRango, ajusteCartera } = await this.ventasPorMetodoPagoEnRango(empresaId, fechaDesde, fechaHasta);

    const ingresosDevengados = totalIngresos + ajusteCartera;
    const utilidad = ingresosDevengados - totalEgresos + totalComprasInventario;
    return {
      ingresosDevengados,
      ajusteCartera,
      totalIngresos,
      totalEgresos,
      totalComprasInventario,
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
    const evolucion = new Map<string, { ingreso: number; egreso: number }>();
    for (const m of movimientos) {
      const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(m.fecha));
      const d = evolucion.get(fecha) || { ingreso: 0, egreso: 0 };
      if (m.categoria === 'COSTO_VENTA' && m.tipo === 'INGRESO') d.egreso -= Number(m.monto);
      else if (m.tipo === 'INGRESO') d.ingreso += Number(m.monto);
      else if (m.categoria === 'VENTA') d.ingreso -= Number(m.monto);
      else d.egreso += Number(m.monto);
      evolucion.set(fecha, d);
    }

    return excelReport('Financiero', `Periodo: ${fechaDesde || 'Inicio'} a ${fechaHasta || 'Hoy'} · COP`, [
      { name: 'Resumen', headers: ['Indicador', 'Valor'], money: [1], rows: [['Ingresos', resumen.totalIngresos], ['Egresos', resumen.totalEgresos], ['Compras inventario', resumen.totalComprasInventario], ['Utilidad neta', resumen.utilidad], ['Ventas del periodo', resumen.totalVentasRango]], chart: { title: 'Resumen financiero · COP', label: 0, value: 1 } },
      { name: 'Medios de pago', headers: ['Medio', 'Ventas'], money: [1], rows: resumen.ventasPorMetodoPago.map(v => [v.metodo, v.total]), chart: { title: 'Ventas por medio de pago · COP', label: 0, value: 1, type: 'pie' } },
      { name: 'Evolucion', headers: ['Día con movimientos', 'Ingresos', 'Egresos'], money: [1,2], rows: [...evolucion].sort(([a],[b]) => a.localeCompare(b)).map(([fecha,v]) => [fecha, Math.round(v.ingreso * 100) / 100, Math.round(v.egreso * 100) / 100]), chart: { title: 'Evolución del resumen financiero · COP', label: 0, value: 1, type: 'line', limit: 366, series: [{ name: 'Ingresos', value: 1 }, { name: 'Egresos', value: 2 }] } },
      { name: 'Categorias', headers: ['Categoría', 'Ingresos', 'Egresos'], money: [1,2], rows: Object.entries(resumen.porCategoria as Record<string, { ingreso: number; egreso: number }>).map(([k,v]) => [k,v.ingreso,v.egreso]) },
      { name: 'Movimientos', headers: ['Fecha (Colombia)', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Usuario'], money: [4], rows: movimientos.map(m => [new Date(m.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' }), m.tipo, m.categoria, m.descripcion, Number(m.monto), m.usuario?.nombre || '']) },
    ]);
  }
}
