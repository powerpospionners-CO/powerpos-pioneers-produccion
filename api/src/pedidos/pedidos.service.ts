import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { calcularPuntos, puntosConfig, monto } from '../tienda/reglas';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PedidosEventosService } from './pedidos-eventos.service';
import { bloquearCajaSucursal } from '../caja/caja-lock';

@Injectable()
export class PedidosService {
  constructor(
    private prisma: PrismaService,
    private readonly eventos: PedidosEventosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private calcularCostoVenta(itemsValidados: { producto: any; cantidad: number }[]): number {
    return itemsValidados.reduce((total, item) => {
      const { producto, cantidad } = item;
      let costoUnitario = 0;
      if (producto.ingredientes && producto.ingredientes.length > 0) {
        costoUnitario = producto.ingredientes.reduce((acc: number, pi: any) => {
          const costoIngrediente = pi.ingrediente?.costoUnitario ? Number(pi.ingrediente.costoUnitario) : 0;
          return acc + costoIngrediente * Number(pi.cantidad);
        }, 0);
      } else if (producto.costo !== null && producto.costo !== undefined) {
        costoUnitario = Number(producto.costo);
      }
      return total + costoUnitario * cantidad;
    }, 0);
  }

  async crearPedido(datos: any, usuarioId: number, empresaId: number) {
    const pedido = await this.prisma.$transaction(tx => this.crearEnTransaccion(datos, usuarioId, empresaId, tx), { timeout: 15000 });
    this.eventos.emitir(empresaId, { tipo: 'CREADO', pedidoId: pedido.id, estado: pedido.estado });
    // La venta ya fue confirmada: una falla de un canal externo no debe inducir a repetirla.
    void this.notificaciones.enviarAlerta({ tipo: 'VENTA REGISTRADA', mensaje: `Venta ${pedido.numero}. Total: $${Number(pedido.total).toLocaleString('es-CO')}`, empresa: 'PowerPOS', sucursal: String(pedido.sucursalId), empresaId }).catch(() => undefined);
    return pedido;
  }

  async crearEnTransaccion(datos: any, usuarioId: number, empresaId: number, db: Prisma.TransactionClient, costoDomicilio = 0) {
    const { items, metodoPago, clienteId, observacion, sucursalId, cajaId } =
      datos;

    if (!Array.isArray(items) || items.length < 1 || items.length > 100 || items.some(i => !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 999 || !Number.isInteger(i.productoId))) throw new BadRequestException('Productos o cantidades no válidos');
    if (metodoPago && !['EFECTIVO','TARJETA','TRANSFERENCIA','NEQUI','DAVIPLATA'].includes(metodoPago)) throw new BadRequestException('Medio de pago no válido');
    const empresa = await db.empresa.findFirst({ where: { id: empresaId, activo: true } });
    if (!empresa) throw new NotFoundException('Empresa no disponible');
    const esRestaurante = empresa.tipoNegocio === 'RESTAURANTE';
    const reglas = puntosConfig(empresa.fidelizacionConfig);
    await bloquearCajaSucursal(db, sucursalId);
    const cajaAbierta = await db.caja.findFirst({
      where: { sucursalId, sucursal: { empresaId }, estado: 'ABIERTA' },
      include: { usuario: { select: { id: true, nombre: true } } },
    });

    if (!cajaAbierta) {
      throw new BadRequestException('Debe abrir la caja antes de registrar pedidos. Solo el administrador puede abrirla.');
    }

    const cajaActivaId = cajaId ? Number(cajaId) : cajaAbierta.id;
    if (cajaId && Number(cajaId) !== cajaAbierta.id) {
      throw new BadRequestException('La caja seleccionada no está abierta en esta sucursal');
    }

    const usuarioVendedor = await db.usuario.findUnique({
      where: { id: usuarioId },
      select: { nombre: true, rol: true },
    });

    const esSupervisor = usuarioVendedor?.rol === 'ADMIN_EMPRESA' || usuarioVendedor?.rol === 'GERENTE';
    if (cajaAbierta.usuarioId !== usuarioId && !esSupervisor) {
      throw new BadRequestException(`La caja abierta está asignada a ${cajaAbierta.usuario?.nombre || 'el cajero seleccionado'}. Solo ese usuario o un administrador puede registrar ventas.`);
    }

    const sucursal = await db.sucursal.findFirst({
      where: { id: sucursalId, empresaId, activo: true },
    });
    if (!sucursal)
      throw new NotFoundException('Sucursal no encontrada para esta empresa');
    if (clienteId) {
      const cliente = await db.cliente.findFirst({
        where: { id: clienteId, empresaId, activo: true },
      });
      if (!cliente)
        throw new NotFoundException('Cliente no encontrado para esta empresa');
    }
    if (cajaId) {
      const caja = await db.caja.findFirst({
        where: { id: Number(cajaId), sucursalId, ...(esSupervisor ? {} : { usuarioId }) },
      });
      if (!caja)
        throw new NotFoundException('Caja no encontrada para este usuario');
    }

    let subtotal = 0;
    const itemsValidados = [];

    for (const item of items) {
      const producto = await db.producto.findFirst({
        where: { id: item.productoId, empresaId, activo: true },
        include: {
          ingredientes: { include: { ingrediente: true } },
          adicionales: {
            include: { adicional: { include: { ingrediente: true } } },
          },
        },
      });

      if (!producto) {
        throw new NotFoundException(
          `Producto ${item.productoId} no encontrado`,
        );
      }

      if (!producto.disponible) {
        throw new BadRequestException(`${producto.nombre} no está disponible`);
      }
      if (!esRestaurante && ((Array.isArray(item.adicionales) && item.adicionales.length > 0) || (Array.isArray(item.exclusiones) && item.exclusiones.length > 0))) {
        throw new BadRequestException('Las recetas y adicionales solo se usan en restaurantes');
      }

      // Adicionales habilitados para este producto: los marcados en el producto,
      // o todo el catálogo activo de la empresa si el producto no tiene ninguno marcado
      // y "aceptaAdicionales" (las bebidas suelen tenerlo en false).
      const adicionalesPermitidos = new Map<number, any>();
      if (producto.adicionales.length > 0) {
        for (const pa of producto.adicionales) {
          if (pa.adicional.activo && pa.adicional.disponible) {
            adicionalesPermitidos.set(pa.adicional.id, pa.adicional);
          }
        }
      } else if (
        producto.aceptaAdicionales &&
        Array.isArray(item.adicionales) &&
        item.adicionales.length > 0
      ) {
        const catalogo = await db.adicional.findMany({
          where: { empresaId, activo: true, disponible: true },
          include: { ingrediente: true },
        });
        for (const ad of catalogo) adicionalesPermitidos.set(ad.id, ad);
      }

      const adicionalesValidados = [];
      let extrasPorUnidad = 0;
      for (const solicitud of Array.isArray(item.adicionales)
        ? item.adicionales
        : []) {
        const adicional = adicionalesPermitidos.get(solicitud.adicionalId);
        if (!adicional) {
          throw new BadRequestException(
            `El adicional ${solicitud.adicionalId} no está disponible para ${producto.nombre}`,
          );
        }
        const cantidadAdicional = Math.max(
          1,
          Math.floor(Number(solicitud.cantidad) || 1),
        );
        const precioAdicional = Number(adicional.precio);
        extrasPorUnidad += precioAdicional * cantidadAdicional;
        adicionalesValidados.push({
          adicional,
          cantidad: cantidadAdicional,
          precio: precioAdicional,
          subtotal: precioAdicional * cantidadAdicional * item.cantidad,
        });
      }

      const itemSubtotal =
        (Number(producto.precio) + extrasPorUnidad) * item.cantidad;
      subtotal += itemSubtotal;

      itemsValidados.push({
        producto,
        cantidad: item.cantidad,
        exclusiones: item.exclusiones || [],
        observacion: item.observacion || null,
        adicionales: adicionalesValidados,
        subtotal: itemSubtotal,
      });
    }

    const descuentoManual = monto(datos.descuento ?? 0, 'Descuento', 0, subtotal);
    const puntosCanjeados = datos.puntosCanjeados ?? 0;
    if (!Number.isInteger(puntosCanjeados) || puntosCanjeados < 0) throw new BadRequestException('Puntos no válidos');
    if (puntosCanjeados && (!clienteId || !reglas.habilitado || reglas.valorPunto <= 0)) throw new BadRequestException('El canje no está habilitado');
    const descuento = Math.round((descuentoManual + puntosCanjeados * reglas.valorPunto) * 100) / 100;
    if (descuento > subtotal) throw new BadRequestException('El canje excede el valor de los productos');
    if (puntosCanjeados) {
      const canje = await db.cliente.updateMany({ where: { id: clienteId, empresaId, activo: true, puntos: { gte: puntosCanjeados } }, data: { puntos: { decrement: puntosCanjeados } } });
      if (!canje.count) throw new BadRequestException('Saldo de puntos insuficiente');
    }
    const puntosGanados = clienteId ? calcularPuntos(itemsValidados, subtotal, descuento, reglas) : 0;
    const total = subtotal - descuento + costoDomicilio;
    monto(Math.round(total * 100) / 100, 'Total', 0, 99999999.99);
    if (puntosGanados > 2147483647) throw new BadRequestException('Revise la regla de acumulación: genera demasiados puntos');

    for (const item of itemsValidados) {
      if (!item.producto.controlaStock) continue;
      const actualizado = await db.producto.updateMany({
        where: { id: item.producto.id, empresaId, stockActual: { gte: item.cantidad } },
        data: { stockActual: { decrement: item.cantidad } },
      });
      if (!actualizado.count) throw new BadRequestException(`Existencias insuficientes de ${item.producto.nombre}`);
    }

    const numero = await this.generarNumeroPedido(sucursalId);

    const pedido = await db.pedido.create({
      data: {
        numero,
        puntosGanados, puntosCanjeados, valorPuntoAplicado: reglas.valorPunto, costoDomicilio,
        sucursalId,
        usuarioId,
        clienteId: clienteId || null,
        cajaId: cajaActivaId,
        metodoPago: metodoPago || 'EFECTIVO',
        subtotal,
        descuento,
        total,
        observacion: observacion || null,
        estado: esRestaurante ? 'PENDIENTE' : 'ENTREGADO',
        detalles: {
          create: itemsValidados.map((item) => ({
            productoId: item.producto.id,
            cantidad: item.cantidad,
            // precioUnitario guarda el precio base del producto; subtotal ya incluye adicionales
            precioUnitario: item.producto.precio,
            subtotal: item.subtotal,
            exclusiones: item.exclusiones,
            observacion: item.observacion,
            adicionales:
              item.adicionales.length > 0
                ? {
                    create: item.adicionales.map((a) => ({
                      adicionalId: a.adicional.id,
                      nombre: a.adicional.nombre,
                      precio: a.precio,
                      cantidad: a.cantidad,
                      subtotal: a.subtotal,
                    })),
                  }
                : undefined,
          })),
        },
      },
      include: {
        detalles: {
          include: {
            producto: true,
            adicionales: { include: { adicional: true } },
          },
        },
        usuario: { select: { nombre: true } },
        cliente: { select: { nombre: true, telefono: true } },
      },
    });

    // Descontar inventario respetando exclusiones
    if (esRestaurante) await this.descontarInventario(itemsValidados, db);

    // Registrar ingreso automático por venta
    await db.movimientoFinanciero.create({
      data: {
        empresaId,
        sucursalId,
        usuarioId,
        tipo: 'INGRESO',
        categoria: 'VENTA',
        descripcion: `Venta ${numero} — ${itemsValidados.length} producto(s)`,
        monto: total,
        pedidoId: pedido.id,
      },
    });

    // Registrar también el costo de lo vendido, para que la utilidad neta
    // reste lo invertido y no muestre el ingreso completo como si fuera
    // ganancia. En comercio/tienda usa el costo del producto; en
    // restaurante, el costo de la receta (igual que en Reportes).
    const costoVenta = this.calcularCostoVenta(itemsValidados);
    if (costoVenta > 0) {
      await db.movimientoFinanciero.create({
        data: {
          empresaId,
          sucursalId,
          usuarioId,
          tipo: 'EGRESO',
          categoria: 'COSTO_VENTA',
          descripcion: `Costo de venta ${numero}`,
          monto: Math.round(costoVenta * 100) / 100,
          pedidoId: pedido.id,
        },
      });
    }

    // Sumar puntos de fidelización si el pedido tiene cliente asociado
    if (clienteId) {

      if (puntosGanados > 0) {
        await db.cliente.update({
          where: { id: clienteId },
          data: { puntos: { increment: puntosGanados } },
        });
      }
    }

    return pedido;
  }

  private obtenerCantidadInventario(ingrediente: any, cantidadReceta: number) {
    const factorConversion = Number(ingrediente?.factorConversion ?? 0);
    const tieneUnidadCompra =
      !!ingrediente?.unidadCompra &&
      String(ingrediente.unidadCompra).trim() !== '' &&
      factorConversion > 0;

    if (!tieneUnidadCompra) {
      return Number(cantidadReceta);
    }

    return Number(cantidadReceta) * factorConversion;
  }

  private async descontarInventario(items: any[], db: Prisma.TransactionClient) {
    for (const item of items) {
      for (const productoIngrediente of item.producto.ingredientes) {
        const excluido = item.exclusiones.includes(
          productoIngrediente.ingrediente.nombre,
        );

        if (!excluido) {
          const cantidadADescontar =
            this.obtenerCantidadInventario(
              productoIngrediente.ingrediente,
              Number(productoIngrediente.cantidad),
            ) * item.cantidad;

          await db.ingrediente.update({
            where: { id: productoIngrediente.ingredienteId },
            data: {
              stock: {
                decrement: cantidadADescontar,
              },
            },
          });
        }
      }

      // Descontar inventario de los adicionales enlazados a un ingrediente
      for (const adicionalValidado of item.adicionales || []) {
        const { adicional } = adicionalValidado;
        if (adicional.ingredienteId && adicional.cantidad) {
          const cantidadADescontar =
            Number(adicional.cantidad) *
            adicionalValidado.cantidad *
            item.cantidad;

          await db.ingrediente.update({
            where: { id: adicional.ingredienteId },
            data: { stock: { decrement: cantidadADescontar } },
          });
        }
      }
    }
  }

  async listarPedidos(empresaId: number, sucursalId?: number) {
    return this.prisma.pedido.findMany({
      where: {
        sucursal: { empresaId },
        ...(sucursalId && { sucursalId }),
      },
      include: {
        detalles: {
          include: {
            producto: true,
            adicionales: { include: { adicional: true } },
          },
        },
        usuario: { select: { nombre: true } },
        cliente: { select: { nombre: true, telefono: true } },
      },
      orderBy: { creadoEn: 'desc' },
      take: 50,
    });
  }

  async obtenerPedido(id: number, empresaId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, sucursal: { empresaId } },
      include: {
        detalles: {
          include: {
            producto: {
              include: { ingredientes: { include: { ingrediente: true } } },
            },
            adicionales: { include: { adicional: true } },
          },
        },
        usuario: { select: { nombre: true } },
        cliente: { select: { nombre: true, telefono: true } },
        sucursal: { select: { nombre: true } },
      },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  async actualizarEstado(id: number, estado: string, empresaId: number, usuarioId?: number) {
    if (!['PENDIENTE','EN_COCINA','LISTO','ENTREGADO','ANULADO'].includes(estado)) throw new BadRequestException('Estado no válido');
    const referencia = await this.prisma.pedido.findFirst({ where: { id, sucursal: { empresaId } }, select: { sucursalId: true } });
    if (!referencia) throw new NotFoundException('Pedido no encontrado');
    const actualizado = await this.prisma.$transaction(async tx => {
    await bloquearCajaSucursal(tx, referencia.sucursalId);
    const empresa = await tx.empresa.findUnique({ where: { id: empresaId }, select: { tipoNegocio: true } });
    if (empresa?.tipoNegocio !== 'RESTAURANTE') throw new BadRequestException('Las ventas comerciales requieren un flujo de devoluciones y conciliación para modificarse');
    const pedido = await tx.pedido.findFirst({
      where: { id, sucursal: { empresaId } },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    if (pedido.estado === 'ANULADO') throw new BadRequestException('Un pedido anulado no puede reabrirse');
    const web = await tx.pedidoWeb.findUnique({ where: { pedidoId: id } });
    if (web && (['ENTREGADO','ANULADO'].includes(estado) || ['EN_CAMINO','ENTREGADO'].includes(web.estado))) throw new BadRequestException('Gestione este pedido desde Domicilios. Las ventas aceptadas requieren conciliación antes de cancelar.');
    if (estado === 'ANULADO' && (pedido.puntosGanados || pedido.puntosCanjeados)) throw new BadRequestException('Esta venta tiene movimientos de puntos. Requiere conciliación antes de anular para no alterar saldos sin respaldo.');
    if (estado === 'ANULADO') {
      const caja = pedido.cajaId ? await tx.caja.findUnique({ where: { id: pedido.cajaId } }) : null;
      if (!caja || caja.estado !== 'ABIERTA') throw new BadRequestException('La caja está cerrada. Esta venta requiere conciliación antes de anular.');
      const ingreso = await tx.movimientoFinanciero.findFirst({ where: { pedidoId: id, empresaId, tipo: 'INGRESO', categoria: 'VENTA' } });
      if (!ingreso) throw new BadRequestException('No se encontró el ingreso de la venta. Requiere conciliación.');
      await tx.movimientoFinanciero.create({ data: {
        empresaId, sucursalId: pedido.sucursalId, usuarioId: usuarioId ?? pedido.usuarioId,
        pedidoId: id, tipo: 'EGRESO', categoria: 'VENTA', monto: ingreso.monto,
        descripcion: `Anulación de venta ${pedido.numero}`,
      } });
    }
    return tx.pedido.update({
      where: { id },
      data: { estado: estado as any },
    });
    });
    this.eventos.emitir(empresaId, {
      tipo: 'ACTUALIZADO',
      pedidoId: id,
      estado: actualizado.estado,
    });
    return actualizado;
  }

  async obtenerEstadisticas(empresaId: number) {
    const pedidos = await this.prisma.pedido.findMany({
      where: {
        sucursal: { empresaId },
        estado: { not: 'ANULADO' },
      },
      include: {
        detalles: { include: { producto: { include: { categoria: true } } } },
      },
    });

    const haceTreintaDias = new Date();
    haceTreintaDias.setDate(haceTreintaDias.getDate() - 29);

    // Ventas por día (últimos 7 días)
    const ventasPorDiaMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      const clave = fecha.toLocaleDateString('es-CO', {
        weekday: 'short',
        day: 'numeric',
      });
      ventasPorDiaMap.set(clave, 0);
    }
    for (const pedido of pedidos) {
      if (new Date(pedido.creadoEn) < haceTreintaDias) continue;
      const clave = new Date(pedido.creadoEn).toLocaleDateString('es-CO', {
        weekday: 'short',
        day: 'numeric',
      });
      if (ventasPorDiaMap.has(clave)) {
        ventasPorDiaMap.set(
          clave,
          ventasPorDiaMap.get(clave) + Number(pedido.total),
        );
      }
    }
    const ventasPorDia = Array.from(ventasPorDiaMap.entries()).map(
      ([dia, total]) => ({ dia, total }),
    );

    // Productos más vendidos
    const productosMap = new Map<string, number>();
    for (const pedido of pedidos) {
      for (const detalle of pedido.detalles) {
        const nombre = detalle.producto.nombre;
        productosMap.set(
          nombre,
          (productosMap.get(nombre) || 0) + detalle.cantidad,
        );
      }
    }
    const productosMasVendidos = Array.from(productosMap.entries())
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 6);

    // Ventas por método de pago
    const metodoPagoMap = new Map<string, number>();
    for (const pedido of pedidos) {
      metodoPagoMap.set(
        pedido.metodoPago,
        (metodoPagoMap.get(pedido.metodoPago) || 0) + Number(pedido.total),
      );
    }
    const ventasPorMetodoPago = Array.from(metodoPagoMap.entries()).map(
      ([metodo, total]) => ({ metodo, total }),
    );

    // Ventas por categoría
    const categoriaMap = new Map<string, number>();
    for (const pedido of pedidos) {
      for (const detalle of pedido.detalles) {
        const categoria = detalle.producto.categoria?.nombre || 'Sin categoría';
        categoriaMap.set(
          categoria,
          (categoriaMap.get(categoria) || 0) + Number(detalle.subtotal),
        );
      }
    }
    const ventasPorCategoria = Array.from(categoriaMap.entries()).map(
      ([categoria, total]) => ({ categoria, total }),
    );

    const ventasPorMesMap = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(1);
      fecha.setMonth(fecha.getMonth() - i);
      const clave = fecha.toLocaleDateString('es-CO', {
        month: 'short',
        year: 'numeric',
      });
      ventasPorMesMap.set(clave, 0);
    }
    for (const pedido of pedidos) {
      const fecha = new Date(pedido.creadoEn);
      const clave = fecha.toLocaleDateString('es-CO', {
        month: 'short',
        year: 'numeric',
      });
      if (ventasPorMesMap.has(clave)) {
        ventasPorMesMap.set(
          clave,
          ventasPorMesMap.get(clave) + Number(pedido.total),
        );
      }
    }

    const hoy = new Date();
    const pedidosHoy = pedidos.filter((pedido) => {
      const fecha = new Date(pedido.creadoEn);
      return (
        fecha.getFullYear() === hoy.getFullYear() &&
        fecha.getMonth() === hoy.getMonth() &&
        fecha.getDate() === hoy.getDate()
      );
    });

    return {
      ventasPorDia,
      ventasPorMes: Array.from(ventasPorMesMap.entries()).map(
        ([mes, total]) => ({ mes, total }),
      ),
      productosMasVendidos,
      ventasPorMetodoPago,
      ventasPorCategoria,
      totalHistorico: pedidos.reduce(
        (acc, pedido) => acc + Number(pedido.total),
        0,
      ),
      pedidosHistoricos: pedidos.length,
      totalHoy: pedidosHoy.reduce(
        (acc, pedido) => acc + Number(pedido.total),
        0,
      ),
      pedidosHoy: pedidosHoy.length,
    };
  }

  private async generarNumeroPedido(sucursalId: number): Promise<string> { return 'PED-' + sucursalId + '-' + randomUUID(); }
}
