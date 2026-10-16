import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComprasService } from '../compras/compras.service';
import { ActorAdministrativo, dinero, texto } from './administracion.service';
import { Prisma } from '@prisma/client';

export type OrdenInput = { proveedorId: number; sucursalId: number; referencia: string; descripcion: string; items: { productoId: number; cantidad: number; costoUnitario: number }[] };
export type RecepcionInput = { clave: string; condicionPago: 'CONTADO' | 'CREDITO'; documento?: string; vencimiento?: string; items: { detalleId: number; cantidad: number }[] };
function entero(n: unknown) { return Number.isInteger(n) && Number(n) > 0 && Number(n) <= 1000000; }

@Injectable()
export class OrdenesCompraService {
  constructor(private readonly prisma: PrismaService, private readonly compras: ComprasService) {}
  listar(empresaId: number) {
    return this.prisma.ordenCompra.findMany({ where: { empresaId }, include: { detalles: true, recepciones: true }, orderBy: { id: 'desc' }, take: 100 });
  }
  async crear(datos: OrdenInput, actor: ActorAdministrativo) {
    const referencia = texto(datos.referencia, 'Referencia', 100);
    const descripcion = texto(datos.descripcion, 'Descripción');
    if (!entero(datos.proveedorId) || !entero(datos.sucursalId) || !Array.isArray(datos.items) || !datos.items.length || datos.items.length > 100 || datos.items.some(i => !entero(i.productoId) || !entero(i.cantidad)) || new Set(datos.items.map(i => i.productoId)).size !== datos.items.length) throw new BadRequestException('Selecciona proveedor, sucursal y hasta 100 productos sin repetir, con cantidades enteras en unidades base');
    const costos = datos.items.map(i => dinero(i.costoUnitario));
    if (datos.items.reduce((s,i,idx) => s + i.cantidad * Number(costos[idx]), 0) > 99999999.99) throw new BadRequestException('La orden supera el monto máximo permitido');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73107, ${actor.empresaId}::integer)`;
      if (!await tx.proveedor.findFirst({ where: { id: datos.proveedorId, empresaId: actor.empresaId, activo: true } }) || !await tx.sucursal.findFirst({ where: { id: datos.sucursalId, empresaId: actor.empresaId, activo: true } })) throw new BadRequestException('Proveedor o sucursal no disponible');
      if (await tx.ordenCompra.findUnique({ where: { empresaId_referencia: { empresaId: actor.empresaId, referencia } } })) throw new BadRequestException('La referencia ya está registrada');
      const productos = await tx.producto.findMany({ where: { id: { in: datos.items.map(i => i.productoId) }, empresaId: actor.empresaId, activo: true, controlaStock: true, esCombo: false }, select: { id: true, nombre: true } });
      if (productos.length !== datos.items.length) throw new BadRequestException('Hay productos que no controlan inventario o no están disponibles');
      const orden = await tx.ordenCompra.create({ data: { empresaId: actor.empresaId, sucursalId: datos.sucursalId, proveedorId: datos.proveedorId, usuarioId: actor.id, referencia, descripcion, detalles: { create: datos.items.map((i,idx) => ({ productoId: i.productoId, nombre: productos.find(p => p.id === i.productoId)!.nombre, cantidad: i.cantidad, costoUnitario: costos[idx] })) } }, include: { detalles: true } });
      await this.auditar(tx, actor, orden.id, 'CREAR', { referencia });
      return orden;
    });
  }
  async resolver(id: number, aprobar: boolean, motivo: string, actor: ActorAdministrativo) {
    if (typeof aprobar !== 'boolean') throw new BadRequestException('Decisión no válida');
    const razon = texto(motivo, 'Motivo');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73107, ${actor.empresaId}::integer)`;
      const orden = await tx.ordenCompra.findFirst({ where: { id, empresaId: actor.empresaId } });
      if (!orden) throw new NotFoundException('Orden no encontrada');
      if (aprobar ? orden.estado !== 'PENDIENTE' : !['PENDIENTE', 'APROBADA', 'PARCIAL'].includes(orden.estado)) throw new BadRequestException('Esta orden ya fue resuelta');
      const resultado = await tx.ordenCompra.update({ where: { id }, data: aprobar ? { estado: 'APROBADA', aprobadoPor: actor.id } : { estado: 'CERRADA', motivoCierre: razon } });
      await this.auditar(tx, actor, id, aprobar ? 'APROBAR' : 'CERRAR', { motivo: razon });
      return resultado;
    });
  }
  async recibir(id: number, datos: RecepcionInput, actor: ActorAdministrativo) {
    const clave = texto(datos.clave, 'Clave', 100);
    if (!['CONTADO', 'CREDITO'].includes(datos.condicionPago) || !Array.isArray(datos.items) || !datos.items.length || datos.items.length > 100 || datos.items.some(i => !entero(i.detalleId) || !entero(i.cantidad)) || new Set(datos.items.map(i => i.detalleId)).size !== datos.items.length) throw new BadRequestException('Recepción no válida');
    const solicitud = JSON.stringify({ ordenId: id, condicionPago: datos.condicionPago, documento: datos.documento || null, vencimiento: datos.vencimiento || null, items: [...datos.items].sort((a,b) => a.detalleId - b.detalleId) });
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73107, ${actor.empresaId}::integer)`;
      const previa = await tx.recepcionOrdenCompra.findUnique({ where: { empresaId_clave: { empresaId: actor.empresaId, clave } } });
      if (previa) {
        if (previa.solicitud !== solicitud) throw new BadRequestException('La clave ya identifica otra recepción');
        return previa;
      }
      const orden = await tx.ordenCompra.findFirst({ where: { id, empresaId: actor.empresaId }, include: { detalles: true } });
      if (!orden) throw new NotFoundException('Orden no encontrada');
      if (!['APROBADA', 'PARCIAL'].includes(orden.estado)) throw new BadRequestException('La orden debe estar aprobada y abierta');
      const productos = await tx.producto.findMany({ where: { empresaId: actor.empresaId, id: { in: orden.detalles.map(d => d.productoId) } }, select: { id: true, ventaGranel: true, unidadGranel: true } });
      const items = datos.items.map(i => {
        const detalle = orden.detalles.find(d => d.id === i.detalleId);
        if (!detalle || detalle.recibida + i.cantidad > detalle.cantidad) throw new BadRequestException('La recepción excede la cantidad pendiente');
        const producto = productos.find(p => p.id === detalle.productoId);
        const factor = producto?.ventaGranel && ['kg', 'l'].includes((producto.unidadGranel || '').toLowerCase()) ? 1000 : 1;
        return { productoId: detalle.productoId, cantidad: i.cantidad / factor, costoUnitario: Number(detalle.costoUnitario) * factor };
      });
      const compra = await this.compras.registrar({ categoria: 'COMPRA_MERCANCIA', descripcion: `Orden ${orden.referencia}: ${orden.descripcion}`, proveedorId: orden.proveedorId, condicionPago: datos.condicionPago, documento: datos.documento, vencimiento: datos.vencimiento, items }, actor.id, actor.empresaId, orden.sucursalId, tx);
      for (const i of datos.items) await tx.detalleOrdenCompra.update({ where: { id: i.detalleId }, data: { recibida: { increment: i.cantidad } } });
      const completa = orden.detalles.every(d => d.recibida + (datos.items.find(i => i.detalleId === d.id)?.cantidad || 0) === d.cantidad);
      await tx.ordenCompra.update({ where: { id }, data: { estado: completa ? 'RECIBIDA' : 'PARCIAL' } });
      const recepcion = await tx.recepcionOrdenCompra.create({ data: { empresaId: actor.empresaId, ordenId: id, compraId: compra.id, clave, solicitud } });
      await this.auditar(tx, actor, id, 'RECIBIR', { compraId: compra.id, recepcionId: recepcion.id, completa });
      return recepcion;
    }, { timeout: 15000 });
  }
  private auditar(tx: Prisma.TransactionClient, actor: ActorAdministrativo, id: number, accion: string, detalle: Prisma.InputJsonValue) {
    return tx.auditoria.create({ data: { empresaId: actor.empresaId, usuarioId: actor.id, entidad: 'ORDEN_COMPRA', entidadId: id, accion, detalle } });
  }
}
