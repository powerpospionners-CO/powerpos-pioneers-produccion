import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { bloquearCajaSucursal } from '../caja/caja-lock';

const pesos = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class CorreccionCostosService {
  constructor(private readonly prisma: PrismaService) {}

  async corregir(empresaId: number, usuarioId: number, datos: { productoId: number; costoRegistrado: number; aplicar?: boolean }) {
    if (!Number.isSafeInteger(datos.productoId) || datos.productoId <= 0 || !Number.isFinite(datos.costoRegistrado) || datos.costoRegistrado <= 0 || (datos.aplicar !== undefined && typeof datos.aplicar !== 'boolean')) throw new BadRequestException('Indica producto y costo por kilo/litro registrado incorrectamente.');
    return this.prisma.$transaction(async tx => {
      // Mismo orden que las devoluciones: operaciones, cajas y productos.
      // Una venta simultánea debe leer el costo después de esta conversión.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73108, ${empresaId}::integer)`;
      const sedes = await tx.sucursal.findMany({ where: { empresaId }, select: { id: true }, orderBy: { id: 'asc' } });
      for (const sede of sedes) await bloquearCajaSucursal(tx, sede.id);
      await tx.$queryRaw`SELECT id FROM productos WHERE id = ${datos.productoId} AND "empresaId" = ${empresaId} FOR UPDATE`;
      const producto = await tx.producto.findFirst({ where: { id: datos.productoId, empresaId } });
      if (!producto?.ventaGranel || !['kg', 'l'].includes(producto.unidadGranel || '')) throw new BadRequestException('Esta corrección solo convierte kilos/litros a gramos/mililitros.');
      const costoBase = datos.costoRegistrado / 1000;
      const anterior = await tx.auditoria.findFirst({ where: { empresaId, entidad: 'CORRECCION_COSTO_GRANEL', entidadId: producto.id }, orderBy: { id: 'desc' } });
      if (Number(producto.costo) === costoBase && (anterior?.detalle as any)?.costoRegistrado === datos.costoRegistrado) return { ...(anterior!.detalle as any), yaAplicada: true };
      if (Number(producto.costo) !== datos.costoRegistrado || costoBase < 0.01 || Math.abs(pesos(costoBase) - costoBase) > 0.00001) throw new BadRequestException('El costo cambió o no se puede representar con precisión; revisa antes de corregir.');
      const pedidos = await tx.pedido.findMany({ where: { sucursal: { empresaId }, detalles: { some: { productoId: producto.id } } }, include: { detalles: true, operacionesCaja: true } });
      const ajustes: any[] = [], pendientes: string[] = [];
      for (const pedido of pedidos) {
        const lineas = pedido.detalles.filter(d => d.productoId === producto.id && d.costoVentaHistorico !== null && Math.abs(Number(d.costoVentaHistorico) - d.cantidad * d.factorUnidades * datos.costoRegistrado) < 0.01);
        if (!lineas.length) continue;
        // Las devoluciones parciales necesitan corregir también su distribución histórica.
        // Se conservan intactas y se enumeran para revisión, nunca se inventa un costo.
        if (pedido.operacionesCaja.some(o => o.tipo === 'DEVOLUCION')) { pendientes.push(pedido.numero); continue; }
        const movimientos = await tx.movimientoFinanciero.findMany({ where: { empresaId, pedidoId: pedido.id, categoria: 'COSTO_VENTA' } });
        const delta = lineas.reduce((s, d) => s + Number(d.costoVentaHistorico) * 0.999, 0);
        if (movimientos.some(m => Number(m.monto) < delta - 0.01) || movimientos.filter(m => m.tipo === 'EGRESO').length !== 1) { pendientes.push(pedido.numero); continue; }
        const ajuste = { pedidoId: pedido.id, numero: pedido.numero, costoAnterior: Number(movimientos.find(m => m.tipo === 'EGRESO')!.monto), costoCorregido: pesos(Number(movimientos.find(m => m.tipo === 'EGRESO')!.monto) - delta), costoCompleto: pedido.costoVentaHistorico !== null, lineas: lineas.map(d => ({ id: d.id, anterior: Number(d.costoVentaHistorico), nuevo: Math.round(Number(d.costoVentaHistorico) / 1000 * 10000) / 10000 })), movimientos: movimientos.map(m => ({ id: m.id, anterior: Number(m.monto), nuevo: pesos(Number(m.monto) - delta) })) };
        ajustes.push(ajuste);
        if (datos.aplicar) {
          for (const l of ajuste.lineas) await tx.detallePedido.update({ where: { id: l.id }, data: { costoVentaHistorico: l.nuevo } });
          if (pedido.costoVentaHistorico !== null) await tx.pedido.update({ where: { id: pedido.id }, data: { costoVentaHistorico: Math.round((Number(pedido.costoVentaHistorico) - delta) * 10000) / 10000 } });
          for (const m of ajuste.movimientos) await tx.movimientoFinanciero.update({ where: { id: m.id }, data: { monto: m.nuevo } });
        }
      }
      const resultado = { productoId: producto.id, nombre: producto.nombre, costoRegistrado: datos.costoRegistrado, costoBase, precioConservado: Number(producto.precio), ajustes, pendientes, aplicada: datos.aplicar === true };
      if (datos.aplicar) {
        if (pendientes.length) throw new BadRequestException('Hay ventas con devoluciones o costos incompatibles. No se aplicó ningún ajuste: ' + pendientes.join(', '));
        await tx.producto.update({ where: { id: producto.id }, data: { costo: costoBase } });
        await tx.auditoria.create({ data: { empresaId, usuarioId, accion: 'CORREGIR', entidad: 'CORRECCION_COSTO_GRANEL', entidadId: producto.id, detalle: resultado } });
      }
      return resultado;
    }, { timeout: 30000 });
  }
}
