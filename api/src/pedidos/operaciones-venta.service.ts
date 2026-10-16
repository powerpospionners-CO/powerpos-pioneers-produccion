import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bloquearCajaSucursal } from '../caja/caja-lock';
import { dinero, texto } from '../administracion/administracion.service';
import { desgloseCobros, importesNetos, MEDIOS_COBRO } from './operaciones-venta.reglas';
import { PedidosEventosService } from './pedidos-eventos.service';

export type ActorVenta = { id: number; empresaId: number; sucursalId?: number; rol: string };
export type CobroCredito = { clave: string; monto: number; metodoPago: string; referencia: string };
export type DevolucionVenta = { clave: string; metodoPago: string; motivo: string; reponer: boolean; items: { detalleId: number; cantidad: number }[] };
const redondear = (n: number) => Math.round(n*100)/100;
@Injectable()
export class OperacionesVentaService {
  constructor(private readonly prisma: PrismaService, private readonly eventos?: PedidosEventosService) {}
  async buscar(numero: string, actor: ActorVenta) {
    const referencia = texto(numero, 'Número de venta', 100);
    const pedido = await this.prisma.pedido.findFirst({ where: { numero: referencia, sucursal: { empresaId: actor.empresaId }, ...(actor.rol === 'CAJERO' ? { sucursalId: actor.sucursalId || -1 } : {}) }, select: { id: true } });
    if (!pedido) throw new NotFoundException('Venta no encontrada en esta sede');
    return pedido;
  }
  creditos(actor: ActorVenta) {
    return this.prisma.cuentaAdministrativa.findMany({ where: { empresaId: actor.empresaId, pedidoId: { not: null }, ...(actor.rol === 'CAJERO' ? { sucursalId: actor.sucursalId || -1 } : {}) }, include: { pedido: { select: { numero: true, devueltoTotal: true, cliente: { select: { nombre: true, documento: true } } } }, abonos: true }, orderBy: { id: 'desc' }, take: 200 });
  }
  private async caja(tx: Prisma.TransactionClient, pedidoId: number, actor: ActorVenta) {
    const p = await tx.pedido.findFirst({ where: { id: pedidoId, sucursal: { empresaId: actor.empresaId } }, select: { sucursalId: true } });
    if (!p) throw new NotFoundException('Venta no encontrada');
    if (actor.rol === 'CAJERO' && actor.sucursalId !== p.sucursalId) throw new BadRequestException('La venta pertenece a otra sede');
    await bloquearCajaSucursal(tx, p.sucursalId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${actor.empresaId}::integer)`;
    const caja = await tx.caja.findFirst({ where: { sucursalId: p.sucursalId, sucursal: { empresaId: actor.empresaId }, estado: 'ABIERTA' } });
    if (!caja || (actor.rol === 'CAJERO' && caja.usuarioId !== actor.id)) throw new BadRequestException('Se requiere una caja abierta asignada al cajero o autorización administrativa');
    return caja;
  }
  private validarMedio(medio: unknown) { if (!MEDIOS_COBRO.includes(String(medio))) throw new BadRequestException('Medio de pago no válido'); }
  private async repetida(tx: Prisma.TransactionClient, clave: string, actor: ActorVenta, solicitud: string) {
    const op = await tx.operacionVentaCaja.findUnique({ where: { clave } });
    if (!op) return null;
    if (op.empresaId !== actor.empresaId || (actor.rol === 'CAJERO' && op.usuarioId !== actor.id) || (op.detalle as any)?.solicitud !== solicitud) throw new BadRequestException('La clave ya identifica otra operación');
    return op;
  }
  async cobrar(id: number, datos: CobroCredito, actor: ActorVenta) {
    const monto = dinero(datos.monto), referencia = texto(datos.referencia, 'Referencia', 250), clave = texto(datos.clave, 'Clave', 100);
    this.validarMedio(datos.metodoPago);
    const solicitud = JSON.stringify({ tipo: 'COBRO_CREDITO', id, monto: monto.toString(), referencia, medio: datos.metodoPago });
    return this.prisma.$transaction(async tx => {
      // Serialize the operation before checking replay, including after a shift closes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73108, ${actor.empresaId}::integer)`;
      const repetida = await this.repetida(tx, clave, actor, solicitud); if (repetida) return repetida;
      const caja = await this.caja(tx, id, actor);
      const pedido = await tx.pedido.findFirst({ where: { id, sucursal: { empresaId: actor.empresaId } }, include: { cuentaCredito: true, operacionesCaja: { where: { tipo: 'DEVOLUCION' } } } });
      const cuenta = pedido?.cuentaCredito;
      if (!pedido || pedido.estado === 'ANULADO' || pedido.devueltoTotal || pedido.metodoPago !== 'CREDITO' || !cuenta || cuenta.anulada || cuenta.saldo.lt(monto)) throw new BadRequestException('El cobro supera el saldo o la venta no admite abonos');
      const movimiento = await tx.movimientoFinanciero.create({ data: { empresaId: actor.empresaId, sucursalId: pedido.sucursalId, usuarioId: actor.id, pedidoId: id, tipo: 'INGRESO', categoria: 'VENTA', monto, descripcion: `Cobro crédito ${pedido.numero}: ${referencia}`, comprobante: referencia } });
      await tx.abonoAdministrativo.create({ data: { cuentaId: cuenta.id, usuarioId: actor.id, monto, referencia, clave, movimientoId: movimiento.id } });
      await tx.cuentaAdministrativa.update({ where: { id: cuenta.id }, data: { saldo: { decrement: monto } } });
      const puntosOtorgados = cuenta.saldo.equals(monto) && pedido.clienteId ? pedido.puntosCreditoPendientes : 0;
      const puntosBaseDevuelto = (pedido.operacionesCaja || []).reduce((s,o)=>s+Number((o.detalle as any)?.valorTotal||0),0);
      if (puntosOtorgados > 0) {
        await tx.cliente.updateMany({ where: { id: pedido.clienteId, empresaId: actor.empresaId }, data: { puntos: { increment: pedido.puntosCreditoPendientes } } });
        await tx.pedido.update({ where: { id }, data: { puntosGanados: { increment: pedido.puntosCreditoPendientes }, puntosCreditoPendientes: 0 } });
      }
      const op = await tx.operacionVentaCaja.create({ data: { empresaId: actor.empresaId, pedidoId: id, cajaId: caja.id, usuarioId: actor.id, clave, tipo: 'COBRO_CREDITO', metodoPago: datos.metodoPago as any, monto, motivo: referencia, detalle: { solicitud, movimientoId: movimiento.id, puntosOtorgados, puntosBaseDevuelto } } });
      await this.auditar(tx, actor, op.id, { pedidoId: id, cajaId: caja.id, monto: monto.toString() });
      return op;
    }, { timeout: 15000 });
  }
  async devolver(id: number, datos: DevolucionVenta, actor: ActorVenta) {
    const clave = texto(datos.clave, 'Clave', 100), motivo = texto(datos.motivo, 'Motivo', 250);
    this.validarMedio(datos.metodoPago);
    if (typeof datos.reponer !== 'boolean' || !Array.isArray(datos.items) || !datos.items.length || datos.items.length > 100 || datos.items.some(i=>!i || !Number.isInteger(i.detalleId)||!Number.isInteger(i.cantidad)||i.cantidad<1) || new Set(datos.items.map(i=>i.detalleId)).size !== datos.items.length) throw new BadRequestException('Productos o cantidades de devolución no válidos');
    const solicitud = JSON.stringify({ tipo: 'DEVOLUCION', id, motivo, medio: datos.metodoPago, reponer: datos.reponer, items: [...datos.items].sort((a,b)=>a.detalleId-b.detalleId) });
    const resultado = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73108, ${actor.empresaId}::integer)`;
      const repetida = await this.repetida(tx, clave, actor, solicitud); if (repetida) return repetida;
      const caja = await this.caja(tx, id, actor);
      const pedido = await tx.pedido.findFirst({ where: { id, sucursal: { empresaId: actor.empresaId } }, include: { detalles: true, cuentaCredito: true, operacionesCaja: true } });
      if (!pedido || pedido.estado === 'ANULADO' || pedido.devueltoTotal) throw new BadRequestException('Esta venta ya fue anulada o devuelta');
      const web = await tx.pedidoWeb.findUnique({ where: { pedidoId: id }, select: { id: true } });
      if (web) throw new BadRequestException('Los domicilios requieren conciliación de entrega antes de devolver');
      const previas = pedido.operacionesCaja.filter(o=>o.tipo==='DEVOLUCION').map(o=>o.detalle as any);
      const cantidades = new Map<number,number>();
      for(const p of previas)for(const l of p.lineas || [])cantidades.set(l.detalleId,(cantidades.get(l.detalleId)||0)+l.cantidad);
      const netos = importesNetos(pedido.detalles.map(d=>Number(d.subtotal)), Number(pedido.subtotal)-Number(pedido.descuento));
      const lineas = datos.items.map(i=>{
        const idx = pedido.detalles.findIndex(d=>d.id===i.detalleId), d = pedido.detalles[idx];
        const anterior = cantidades.get(i.detalleId)||0;
        if(!d || anterior+i.cantidad>d.cantidad)throw new BadRequestException('La cantidad supera lo pendiente por devolver');
        const valor = redondear(netos[idx]*(anterior+i.cantidad)/d.cantidad)-redondear(netos[idx]*anterior/d.cantidad);
        const costo = d.costoVentaHistorico === null ? 0 : redondear(Number(d.costoVentaHistorico)*(anterior+i.cantidad)/d.cantidad)-redondear(Number(d.costoVentaHistorico)*anterior/d.cantidad);
        return { detalleId:d.id, cantidad:i.cantidad, productoId:d.productoId, valor:redondear(valor), costo:redondear(costo), anterior, original:d.cantidad, consumos:d.consumoInventario };
      });
      const completa = pedido.detalles.every(d=>(cantidades.get(d.id)||0)+(datos.items.find(i=>i.detalleId===d.id)?.cantidad||0)===d.cantidad);
      if (!completa && pedido.estado !== 'ENTREGADO') throw new BadRequestException('Una venta en preparación solo admite devolución completa; la devolución parcial requiere entrega confirmada');
      const devueltoAntes = previas.reduce((s,p)=>s+Number(p.valorTotal||0),0);
      const valorTotal = completa ? redondear(Number(pedido.total)-devueltoAntes) : redondear(lineas.reduce((s,l)=>s+l.valor,0));
      if(valorTotal<0 || devueltoAntes+valorTotal>Number(pedido.total)+0.001)throw new BadRequestException('El valor de devolución no es válido');
      const deuda = pedido.cuentaCredito && !pedido.cuentaCredito.anulada ? Math.min(Number(pedido.cuentaCredito.saldo),valorTotal) : 0;
      const reembolso = redondear(valorTotal-deuda);
      if(reembolso>0 && datos.metodoPago==='EFECTIVO') {
        const [ventas, operaciones] = await Promise.all([tx.pedido.findMany({ where: { cajaId:caja.id, estado:{not:'ANULADO'} }, select:{total:true,metodoPago:true,pagos:{select:{metodoPago:true,monto:true}}} }),tx.operacionVentaCaja.findMany({where:{cajaId:caja.id}})]);
        const efectivo = desgloseCobros(ventas,operaciones).find(m=>m.metodo==='EFECTIVO')?.total||0;
        if(Number(caja.montoInicial)+efectivo+0.001<reembolso)throw new BadRequestException('El efectivo registrado en esta caja no alcanza para el reembolso');
      }
      const consumos: {tipo:string;id:number;cantidad:number}[]=[];
      if(datos.reponer) {
        if(lineas.every(l=>Array.isArray(l.consumos))) {
          for(const l of lineas)for(const c of l.consumos as any[])consumos.push({tipo:c.tipo,id:c.id,cantidad:Math.round(Number(c.cantidad)*(l.anterior+l.cantidad)/l.original*1000)/1000-Math.round(Number(c.cantidad)*l.anterior/l.original*1000)/1000});
        } else if(completa && !previas.length && Array.isArray(pedido.consumoInventario)) consumos.push(...pedido.consumoInventario as any[]);
        else throw new BadRequestException('Esta venta no conserva consumo por línea. La devolución parcial debe registrarse sin reposición automática y ajustarse con un conteo aprobado');
        for(const c of consumos) {
          if(!Number.isFinite(c.cantidad)||c.cantidad<0||!Number.isInteger(c.id))throw new BadRequestException('Consumo histórico inválido');
          if(!c.cantidad)continue;
          if(c.tipo==='PRODUCTO') {
            const r=await tx.producto.updateMany({where:{id:c.id,empresaId:actor.empresaId,stockActual:{lte:2147483647-c.cantidad}},data:{stockActual:{increment:c.cantidad}}});
            if(!r.count)throw new BadRequestException('No se pudo reponer el producto de esta empresa');
          } else if(c.tipo==='INGREDIENTE') {
            const r=await tx.ingrediente.updateMany({where:{id:c.id,empresaId:actor.empresaId},data:{stock:{increment:c.cantidad}}});
            if(!r.count)throw new BadRequestException('No se pudo reponer el ingrediente de esta empresa');
          } else throw new BadRequestException('Tipo de consumo inválido');
        }
      }
      const puntosAntes = previas.reduce((s,p)=>s+Number(p.puntosRevertidos||0),0), canjesAntes=previas.reduce((s,p)=>s+Number(p.puntosRestituidos||0),0);
      const asignacion = pedido.operacionesCaja.find(o=>o.tipo==='COBRO_CREDITO' && Number((o.detalle as any)?.puntosOtorgados)>0)?.detalle as any;
      const basePuntos = Number(asignacion?.puntosBaseDevuelto || 0);
      const fraccion = Number(pedido.total)>basePuntos ? Math.min(1,Math.max(0,(devueltoAntes+valorTotal-basePuntos)/(Number(pedido.total)-basePuntos))) : completa?1:0;
      const puntosRevertidos = Math.floor(pedido.puntosGanados*fraccion)-puntosAntes;
      const puntosRestituidos = Math.floor(pedido.puntosCanjeados*fraccion)-canjesAntes;
      if(pedido.clienteId && (puntosRevertidos||puntosRestituidos)) {
        const neto=puntosRevertidos-puntosRestituidos;
        const r=await tx.cliente.updateMany({where:{id:pedido.clienteId,empresaId:actor.empresaId,puntos:{gte:Math.max(0,neto)}},data:{puntos:{increment:-neto}}});
        if(!r.count)throw new BadRequestException('El cliente ya utilizó los puntos de esta venta; se requiere conciliación de puntos');
      }
      if(deuda>0)await tx.cuentaAdministrativa.update({where:{id:pedido.cuentaCredito!.id},data:{saldo:{decrement:deuda}}});
      if(reembolso>0)await tx.movimientoFinanciero.create({data:{empresaId:actor.empresaId,sucursalId:pedido.sucursalId,usuarioId:actor.id,pedidoId:id,tipo:'EGRESO',categoria:'VENTA',monto:reembolso,descripcion:`Devolución ${pedido.numero}: ${motivo}`}});
      let costoRestituido=datos.reponer?redondear(lineas.reduce((s,l)=>s+l.costo,0)):0;
      if(datos.reponer && completa && !previas.length) {
        const costo=await tx.movimientoFinanciero.findFirst({where:{pedidoId:id,empresaId:actor.empresaId,tipo:'EGRESO',categoria:'COSTO_VENTA'},select:{monto:true}});
        costoRestituido=Number(costo?.monto||0);
      }
      if(costoRestituido>0)await tx.movimientoFinanciero.create({data:{empresaId:actor.empresaId,sucursalId:pedido.sucursalId,usuarioId:actor.id,pedidoId:id,tipo:'INGRESO',categoria:'COSTO_VENTA',monto:costoRestituido,descripcion:`Costo restituido por devolución ${pedido.numero}`}});
      const restante = Number(pedido.total)-devueltoAntes;
      await tx.pedido.update({where:{id},data:{devueltoTotal:completa,puntosCreditoPendientes:restante>0?Math.floor(pedido.puntosCreditoPendientes*Math.max(0,restante-valorTotal)/restante):0}});
      const op=await tx.operacionVentaCaja.create({data:{empresaId:actor.empresaId,pedidoId:id,cajaId:caja.id,usuarioId:actor.id,clave,tipo:'DEVOLUCION',metodoPago:datos.metodoPago as any,monto:reembolso,motivo,detalle:{solicitud,valorTotal,deudaReducida:deuda,reembolso,reponer:datos.reponer,puntosRevertidos,puntosRestituidos,costoRestituido,lineas:lineas.map(({consumos,...l})=>l),consumos} as Prisma.InputJsonValue}});
      await this.auditar(tx,actor,op.id,{pedidoId:id,cajaId:caja.id,valorTotal,reembolso,deudaReducida:deuda});
      return op;
    },{timeout:15000});
    this.eventos?.emitir(actor.empresaId, { tipo: 'ACTUALIZADO', pedidoId: id, estado: 'DEVOLUCION' });
    return resultado;
  }
  private auditar(tx: Prisma.TransactionClient,actor:ActorVenta,id:number,detalle:Prisma.InputJsonValue) { return tx.auditoria.create({data:{empresaId:actor.empresaId,usuarioId:actor.id,entidad:'OPERACION_VENTA_CAJA',entidadId:id,accion:'CREAR',detalle}}); }
}
