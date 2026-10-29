import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { bloquearCajaSucursal } from '../caja/caja-lock';
import { PedidosService } from '../pedidos/pedidos.service';
import { CONTROL_DISTRIBUIDOR, controlesDistribuidor, gestionPedidos } from './gestion-pedidos';
import { createHash } from 'node:crypto';

@Injectable()
export class PedidosDistribuidorService {
  constructor(private prisma: PrismaService, private readonly pedidos: PedidosService) {}

  async crearPedido(datos: any, distribuidorId: number, sucursalId: number, empresaId: number, usuarioId: number) {
    const { items, clienteReferencia } = datos;
    if (!['PAGO_ANTES','COBRO_POSTERIOR'].includes(datos.modalidad) || typeof datos.clave !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(datos.clave)) throw new BadRequestException('Actualiza la aplicación y selecciona la modalidad de retiro.');
    if (!Array.isArray(items) || items.length < 1 || items.length > 100 || items.some((i: any) => !i || !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 999999 || !Number.isInteger(i.productoId) || (i.presentacionId != null && (!Number.isInteger(i.presentacionId) || i.presentacionId < 1)))) {
      throw new BadRequestException('Productos o cantidades no válidos');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73111, ${empresaId}::integer)`;
      await bloquearCajaSucursal(tx, sucursalId);

      const distribuidor = await tx.distribuidor.findFirst({ where: { id: distribuidorId, empresaId, activo: true } });
      if (!distribuidor) throw new BadRequestException('Distribuidor no disponible');
      if (distribuidor.sucursalId !== sucursalId) throw new BadRequestException('El distribuidor pertenece a otra sede.');
      if (clienteReferencia !== undefined && (typeof clienteReferencia !== 'string' || clienteReferencia.length > 180)) throw new BadRequestException('La referencia del cliente admite máximo 180 caracteres.');

      const solicitud = JSON.stringify({ items, clienteReferencia: clienteReferencia || null, modalidad: datos.modalidad, sucursalId });
      const anteriores = await tx.auditoria.findMany({ where: { empresaId, entidad: 'SOLICITUD_DISTRIBUIDOR', entidadId: distribuidorId }, orderBy: { id: 'desc' } });
      const repetida = anteriores.find(a=>(a.detalle as any)?.clave === datos.clave);
      if (repetida) {
        if ((repetida.detalle as any).solicitud !== solicitud) throw new BadRequestException('Esta clave pertenece a otro pedido.');
        const anterior = await tx.pedidoDistribuidor.findFirst({ where: { id: (repetida.detalle as any).pedidoId, empresaId, distribuidorId }, include: { detalles: { include: { producto: true } } } });
        if (!anterior) throw new BadRequestException('El pedido anterior requiere revisión administrativa.');
        return (await gestionPedidos(tx,empresaId,[anterior]))[0];
      }
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
        if (item.producto.controlaStock && item.producto.stockActual < item.cantidad * item.factorUnidades) throw new BadRequestException(`Existencias insuficientes de ${item.producto.nombre}`);
      }

      const total = Math.round(subtotal * 100) / 100;
      if (!Number.isFinite(total) || total <= 0 || total > 99999999.99) throw new BadRequestException('El total del pedido no es válido.');
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

      await tx.auditoria.create({ data: { empresaId, usuarioId, entidad: 'SOLICITUD_DISTRIBUIDOR', entidadId: distribuidorId, accion: 'CREAR', detalle: { clave: datos.clave, solicitud, pedidoId: pedido.id } } });
      await tx.auditoria.create({ data: { empresaId, usuarioId, entidad: CONTROL_DISTRIBUIDOR, entidadId: pedido.id, accion: 'CREAR', detalle: { modalidad: datos.modalidad, pedidoCajaId: null } } });

      return {...pedido,modalidad:datos.modalidad,estadoGestion:'PENDIENTE_RETIRO',entregado:false,saldoPendiente:total,comisionDisponible:false};
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
  async listar(empresaId: number, distribuidorId?: number, sucursalId?: number) {
    const pedidos = await this.prisma.pedidoDistribuidor.findMany({
      where: { empresaId, ...(distribuidorId ? { distribuidorId } : {}), ...(sucursalId ? { sucursalId } : {}) },
      include: { distribuidor: { select: { codigo: true, nombre: true } }, detalles: { include: { producto: { select: { nombre: true } } } } },
      orderBy: { creadoEn: 'desc' },
      take: 200,
    });
    return gestionPedidos(this.prisma, empresaId, pedidos);
  }

  // `distribuidorId` solo llega cuando el que pregunta es un distribuidor
  // (no un admin): además de la empresa, el pedido tiene que ser suyo.
  async obtener(id: number, empresaId: number, distribuidorId?: number, sucursalId?: number) {
    const pedido = await this.prisma.pedidoDistribuidor.findFirst({
      where: { id, empresaId, ...(distribuidorId ? { distribuidorId } : {}), ...(sucursalId ? { sucursalId } : {}) },
      include: { detalles: { include: { producto: { select: { nombre: true } } } }, distribuidor: { select: { codigo: true, nombre: true } } },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return (await gestionPedidos(this.prisma, empresaId, [pedido]))[0];
  }

  async entregar(id: number, datos: any, actor: { id: number; empresaId: number; sucursalId?: number; rol: string }) {
    if (typeof datos.clave !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(datos.clave)) throw new BadRequestException('Se requiere una clave válida de entrega.');
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73111, ${actor.empresaId}::integer)`;
      const p = await tx.pedidoDistribuidor.findFirst({ where: { id, empresaId: actor.empresaId, ...(actor.rol==='CAJERO'?{sucursalId:actor.sucursalId || -1}:{}) }, include: { detalles:true, distribuidor:true } });
      if (!p || p.estado==='ANULADO') throw new BadRequestException('El pedido no está disponible en esta sede.');
      await bloquearCajaSucursal(tx,p.sucursalId);
      const control = (await controlesDistribuidor(tx,actor.empresaId,[id])).get(id);
      if (!control) throw new BadRequestException('Pedido histórico: requiere conciliación administrativa, no un nuevo cobro.');
      const solicitud = JSON.stringify({ pagos:datos.pagos || [], condicionPago:datos.condicionPago || 'CONTADO', vencimientoCredito:datos.vencimientoCredito || null, cambio:datos.cambio || 0 });
      if (control.pedidoCajaId) {
        if (control.claveEntrega!==datos.clave || control.solicitudEntrega!==solicitud) throw new BadRequestException('Este pedido ya fue entregado.');
        const venta = await tx.pedido.findFirst({ where:{id:control.pedidoCajaId,sucursal:{empresaId:actor.empresaId}},include:{cuentaCredito:true} });
        return {pedidoCajaId:venta!.id,numero:venta!.numero,saldoPendiente:Number(venta!.cuentaCredito?.saldo || 0)};
      }
      if (!p.distribuidor.activo || p.distribuidor.sucursalId!==p.sucursalId) throw new BadRequestException('El distribuidor no está activo en esta sede.');
      if (control.modalidad==='PAGO_ANTES' && datos.condicionPago==='CREDITO') throw new BadRequestException('Esta modalidad exige el pago completo antes de retirar.');
      const aCredito = datos.condicionPago==='CREDITO';
      if (!aCredito && (!Array.isArray(datos.pagos) || !datos.pagos.length)) throw new BadRequestException('Registra el medio de pago y el monto recibido antes de entregar.');
      let clienteId: number | undefined;
      if (aCredito) {
        const documento = `DISTRIBUIDOR-${p.distribuidorId}`;
        const cliente = await tx.cliente.upsert({ where:{empresaId_documento:{empresaId:actor.empresaId,documento}},create:{empresaId:actor.empresaId,documento,nombre:`Distribuidor ${p.distribuidor.codigo} · ${p.distribuidor.nombre}`},update:{} });
        if (!cliente.activo) throw new BadRequestException('La cuenta del distribuidor está inactiva.');
        clienteId=cliente.id;
      }
      const precios = Object.fromEntries(p.detalles.map(d=>[`${d.productoId}:${d.presentacionId || 0}`,Number(d.precioUnitario)]));
      const factores = Object.fromEntries(p.detalles.map(d=>[`${d.productoId}:${d.presentacionId || 0}`,d.factorUnidades]));
      const claveIdempotencia = createHash('sha256').update(`entrega-distribuidor:${actor.empresaId}:${id}`).digest('hex');
      const venta = await this.pedidos.crearEnTransaccion({ sucursalId:p.sucursalId,claveIdempotencia,clienteId,metodoPago:datos.metodoPago,pagos:datos.pagos,condicionPago:datos.condicionPago,vencimientoCredito:datos.vencimientoCredito,cambio:datos.cambio,observacion:`Pedido distribuidor ${p.numero} · ${p.distribuidor.nombre}${p.clienteReferencia?` · Cliente: ${p.clienteReferencia}`:''}`,items:p.detalles.map(d=>({productoId:d.productoId,presentacionId:d.presentacionId,cantidad:d.cantidad})) },actor.id,actor.empresaId,tx,0,{precios,factores});
      if (Math.round(Number(venta.total)*100)!==Math.round(Number(p.total)*100)) throw new BadRequestException('El total del pedido cambió; revisa sus presentaciones antes de entregar.');
      await tx.auditoria.create({data:{empresaId:actor.empresaId,usuarioId:actor.id,entidad:CONTROL_DISTRIBUIDOR,entidadId:id,accion:'ENTREGAR',detalle:{...control,pedidoCajaId:venta.id,claveEntrega:datos.clave,solicitudEntrega:solicitud,entregadoEn:new Date().toISOString()}}});
      return {pedidoCajaId:venta.id,numero:venta.numero,saldoPendiente:Number((venta as any).cuentaCredito?.saldo || 0)};
    },{timeout:20000});
  }

  async anular(id: number, empresaId: number, usuarioId: number, distribuidorId?: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73111, ${empresaId}::integer)`;
      const pedido = await tx.pedidoDistribuidor.findFirst({
        where: { id, empresaId, ...(distribuidorId ? { distribuidorId } : {}) },
        include: { detalles: { include: { producto: true } }, distribuidor: { select: { codigo: true } } },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.estado === 'ANULADO') throw new BadRequestException('Este pedido ya está anulado');
      if (pedido.liquidacionId) throw new BadRequestException('Este pedido ya fue liquidado y no se puede anular — requiere conciliación manual');

      await bloquearCajaSucursal(tx, pedido.sucursalId);
      const control = (await controlesDistribuidor(tx, empresaId, [id])).get(id);
      if (control) {
        if (control.pedidoCajaId) throw new BadRequestException('La mercancía ya fue entregada. La devolución debe gestionarse por la venta de caja vinculada.');
        return tx.pedidoDistribuidor.update({ where: { id }, data: { estado: 'ANULADO' } });
      }
      if (distribuidorId) throw new BadRequestException('Los pedidos históricos requieren revisión administrativa antes de anular.');

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
