import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { bloquearCajaSucursal } from '../caja/caja-lock';

@Injectable()
export class PedidosDistribuidorService {
  constructor(private prisma: PrismaService) {}

  async crearPedido(datos: any, distribuidorId: number, sucursalId: number, empresaId: number, usuarioId: number) {
    const { items, clienteReferencia } = datos;
    if (!Array.isArray(items) || items.length < 1 || items.length > 100 || items.some((i: any) => !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 999999 || !Number.isInteger(i.productoId))) {
      throw new BadRequestException('Productos o cantidades no válidos');
    }

    return this.prisma.$transaction(async (tx) => {
      await bloquearCajaSucursal(tx, sucursalId);

      const distribuidor = await tx.distribuidor.findFirst({ where: { id: distribuidorId, empresaId, activo: true } });
      if (!distribuidor) throw new BadRequestException('Distribuidor no disponible');

      let subtotal = 0;
      const itemsValidados: { producto: any; cantidad: number; presentacionId: number | null; presentacionNombre: string | null; factorUnidades: number; precioUnitario: number; subtotal: number }[] = [];

      for (const item of items) {
        const producto = await tx.producto.findFirst({ where: { id: item.productoId, empresaId, activo: true } });
        if (!producto) throw new NotFoundException(`Producto ${item.productoId} no encontrado`);
        if (!producto.disponible) throw new BadRequestException(`${producto.nombre} no está disponible`);

        let presentacion: { id: number; nombre: string; factorUnidades: number; precio: Prisma.Decimal } | null = null;
        if (item.presentacionId) {
          presentacion = await tx.productoPresentacion.findFirst({ where: { id: Number(item.presentacionId), productoId: producto.id, activo: true } });
          if (!presentacion) throw new NotFoundException('La presentación seleccionada no está disponible');
        }
        const precioUnitario = presentacion ? Number(presentacion.precio) : Number(producto.precio);
        const factorUnidades = presentacion ? presentacion.factorUnidades : 1;
        const itemSubtotal = precioUnitario * item.cantidad;
        subtotal += itemSubtotal;

        itemsValidados.push({
          producto, cantidad: item.cantidad,
          presentacionId: presentacion?.id ?? null, presentacionNombre: presentacion?.nombre ?? null,
          factorUnidades, precioUnitario, subtotal: itemSubtotal,
        });
      }

      for (const item of itemsValidados) {
        if (!item.producto.controlaStock) continue;
        const unidadesBase = item.cantidad * item.factorUnidades;
        const actualizado = await tx.producto.updateMany({
          where: { id: item.producto.id, empresaId, stockActual: { gte: unidadesBase } },
          data: { stockActual: { decrement: unidadesBase } },
        });
        if (!actualizado.count) throw new BadRequestException(`Existencias insuficientes de ${item.producto.nombre}${item.presentacionNombre ? ` (${item.presentacionNombre})` : ''}`);
      }

      const total = Math.round(subtotal * 100) / 100;
      const comisionPorcentaje = Number(distribuidor.porcentajeComision);
      const comisionMonto = Math.round(total * comisionPorcentaje) / 100;
      const numero = await this.generarNumero(sucursalId, tx);

      const pedido = await tx.pedidoDistribuidor.create({
        data: {
          numero, empresaId, sucursalId, distribuidorId,
          clienteReferencia: clienteReferencia || null,
          total, comisionPorcentaje, comisionMonto,
          detalles: {
            create: itemsValidados.map((item) => ({
              productoId: item.producto.id, cantidad: item.cantidad,
              precioUnitario: item.precioUnitario, subtotal: item.subtotal,
              presentacionId: item.presentacionId, presentacionNombre: item.presentacionNombre,
              factorUnidades: item.factorUnidades,
            })),
          },
        },
        include: { detalles: { include: { producto: true } } },
      });

      await tx.movimientoFinanciero.create({
        data: {
          empresaId, sucursalId, usuarioId,
          tipo: 'INGRESO', categoria: 'VENTA',
          descripcion: `Venta distribuidor ${distribuidor.codigo} — ${numero}`,
          monto: total,
        },
      });

      const costoVenta = itemsValidados.reduce((acc, item) => {
        const costoUnitario = item.producto.costo !== null && item.producto.costo !== undefined ? Number(item.producto.costo) * item.factorUnidades : 0;
        return acc + costoUnitario * item.cantidad;
      }, 0);
      if (costoVenta > 0) {
        await tx.movimientoFinanciero.create({
          data: {
            empresaId, sucursalId, usuarioId,
            tipo: 'EGRESO', categoria: 'COSTO_VENTA',
            descripcion: `Costo de venta distribuidor ${numero}`,
            monto: Math.round(costoVenta * 100) / 100,
          },
        });
      }

      return pedido;
    }, { timeout: 15000 });
  }

  // "DIST-{sucursal}-{fecha Bogotá}-{consecutivo del día}" — igual patrón que
  // los pedidos normales del POS, pero con su propia secuencia para no mezclar
  // los dos conteos.
  private async generarNumero(sucursalId: number, db: Prisma.TransactionClient): Promise<string> {
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date())
      .replace(/-/g, '');
    const prefijo = `DIST-${sucursalId}-${fecha}-`;
    const delDia = await db.pedidoDistribuidor.count({ where: { sucursalId, numero: { startsWith: prefijo } } });
    return `${prefijo}${String(delDia + 1).padStart(4, '0')}`;
  }

  // El distribuidor solo ve sus propios pedidos; el admin puede filtrar por
  // cualquier distribuidor de su empresa (o verlos todos).
  async listar(empresaId: number, distribuidorId?: number) {
    return this.prisma.pedidoDistribuidor.findMany({
      where: { empresaId, ...(distribuidorId ? { distribuidorId } : {}) },
      include: { distribuidor: { select: { codigo: true, nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: 200,
    });
  }

  // `distribuidorId` solo llega cuando el que pregunta es un distribuidor
  // (no un admin): además de la empresa, el pedido tiene que ser suyo.
  async obtener(id: number, empresaId: number, distribuidorId?: number) {
    const pedido = await this.prisma.pedidoDistribuidor.findFirst({
      where: { id, empresaId, ...(distribuidorId ? { distribuidorId } : {}) },
      include: { detalles: { include: { producto: { select: { nombre: true } } } }, distribuidor: { select: { codigo: true, nombre: true } } },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  async anular(id: number, empresaId: number, usuarioId: number, distribuidorId?: number) {
    return this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoDistribuidor.findFirst({
        where: { id, empresaId, ...(distribuidorId ? { distribuidorId } : {}) },
        include: { detalles: { include: { producto: true } }, distribuidor: { select: { codigo: true } } },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.estado === 'ANULADO') throw new BadRequestException('Este pedido ya está anulado');
      if (pedido.liquidacionId) throw new BadRequestException('Este pedido ya fue liquidado y no se puede anular — requiere conciliación manual');

      await bloquearCajaSucursal(tx, pedido.sucursalId);

      for (const detalle of pedido.detalles) {
        if (!detalle.producto.controlaStock) continue;
        const unidadesBase = detalle.cantidad * (detalle.factorUnidades || 1);
        await tx.producto.update({ where: { id: detalle.productoId }, data: { stockActual: { increment: unidadesBase } } });
      }

      await tx.movimientoFinanciero.create({
        data: {
          empresaId, sucursalId: pedido.sucursalId, usuarioId,
          tipo: 'EGRESO', categoria: 'VENTA',
          descripcion: `Anulación venta distribuidor ${pedido.distribuidor.codigo} — ${pedido.numero}`,
          monto: pedido.total,
        },
      });

      return tx.pedidoDistribuidor.update({ where: { id }, data: { estado: 'ANULADO' } });
    });
  }
}
