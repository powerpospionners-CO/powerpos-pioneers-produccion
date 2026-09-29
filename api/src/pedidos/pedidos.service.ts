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

const METODOS_PAGO_VALIDOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA'];

@Injectable()
export class PedidosService {
  constructor(
    private prisma: PrismaService,
    private readonly eventos: PedidosEventosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // Valida y normaliza el desglose de pago de una venta. Acepta el campo
  // clásico `metodoPago` (pago único) o `pagos: [{metodoPago, monto}]` para
  // pagos mixtos (ej. parte en efectivo, parte por transferencia).
  private normalizarPagos(datos: any, total: number): { metodoPago: string; pagos: { metodoPago: string; monto: number }[] } {
    if (Array.isArray(datos.pagos) && datos.pagos.length > 0) {
      if (datos.pagos.length > 5) throw new BadRequestException('Un pago admite máximo 5 medios distintos');
      const pagos = datos.pagos.map((p: any) => {
        if (!METODOS_PAGO_VALIDOS.includes(p.metodoPago)) throw new BadRequestException('Medio de pago no válido');
        const monto = Number(p.monto);
        if (!Number.isFinite(monto) || monto <= 0) throw new BadRequestException('El monto de cada pago debe ser mayor a cero');
        return { metodoPago: p.metodoPago, monto: Math.round(monto * 100) / 100 };
      });
      const suma = pagos.reduce((acc: number, p: any) => acc + p.monto, 0);
      if (Math.round(suma * 100) !== Math.round(total * 100)) {
        throw new BadRequestException(`La suma de los pagos ($${suma.toLocaleString('es-CO')}) no coincide con el total de la venta ($${total.toLocaleString('es-CO')})`);
      }
      const metodoPago = pagos.length > 1 ? 'MIXTO' : pagos[0].metodoPago;
      return { metodoPago, pagos };
    }
    const metodoPago = datos.metodoPago || 'EFECTIVO';
    if (!METODOS_PAGO_VALIDOS.includes(metodoPago)) throw new BadRequestException('Medio de pago no válido');
    return { metodoPago, pagos: [{ metodoPago, monto: total }] };
  }

  private calcularCostoVenta(itemsValidados: { producto: any; cantidad: number; factorUnidades?: number }[]): number {
    return itemsValidados.reduce((total, item) => {
      const { producto, cantidad } = item;
      const factorUnidades = item.factorUnidades ?? 1;
      let costoUnitario = 0;
      if (producto.ingredientes && producto.ingredientes.length > 0) {
        costoUnitario = producto.ingredientes.reduce((acc: number, pi: any) => {
          const costoIngrediente = pi.ingrediente?.costoUnitario ? Number(pi.ingrediente.costoUnitario) : 0;
          return acc + costoIngrediente * Number(pi.cantidad);
        }, 0);
      } else if (producto.costo !== null && producto.costo !== undefined) {
        // El costo del producto es por unidad base; una presentación de
        // varias unidades (ej. un tarro) cuesta ese costo multiplicado por
        // cuántas unidades base contiene.
        costoUnitario = Number(producto.costo) * factorUnidades;
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
    const { items, clienteId, observacion, sucursalId, cajaId } =
      datos;

    if (!Array.isArray(items) || items.length < 1 || items.length > 100 || items.some(i => !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 999 || !Number.isInteger(i.productoId))) throw new BadRequestException('Productos o cantidades no válidos');
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

      // Presentación vendida (ej. "Tarro" vs "Unidad"): comparte el mismo
      // stockActual del producto, contado en la unidad base. `factorUnidades`
      // es cuántas unidades base representa una unidad de esta presentación.
      let presentacion: { id: number; nombre: string; factorUnidades: number; precio: Prisma.Decimal } | null = null;
      if (item.presentacionId) {
        presentacion = await db.productoPresentacion.findFirst({
          where: { id: Number(item.presentacionId), productoId: producto.id, activo: true },
        });
        if (!presentacion) throw new NotFoundException('La presentación seleccionada no está disponible');
      }
      const precioUnitario = presentacion ? Number(presentacion.precio) : Number(producto.precio);
      const factorUnidades = presentacion ? presentacion.factorUnidades : 1;

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
        (precioUnitario + extrasPorUnidad) * item.cantidad;
      subtotal += itemSubtotal;

      itemsValidados.push({
        producto,
        cantidad: item.cantidad,
        exclusiones: item.exclusiones || [],
        observacion: item.observacion || null,
        adicionales: adicionalesValidados,
        subtotal: itemSubtotal,
        presentacionId: presentacion?.id ?? null,
        presentacionNombre: presentacion?.nombre ?? null,
        factorUnidades,
        precioUnitario,
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
    const { metodoPago, pagos } = this.normalizarPagos(datos, Math.round(total * 100) / 100);

    for (const item of itemsValidados) {
      if (!item.producto.controlaStock) continue;
      const unidadesBase = item.cantidad * item.factorUnidades;
      const actualizado = await db.producto.updateMany({
        where: { id: item.producto.id, empresaId, stockActual: { gte: unidadesBase } },
        data: { stockActual: { decrement: unidadesBase } },
      });
      if (!actualizado.count) throw new BadRequestException(`Existencias insuficientes de ${item.producto.nombre}${item.presentacionNombre ? ` (${item.presentacionNombre})` : ''}`);
    }

    const numero = await this.generarNumeroPedido(sucursalId, db);

    const pedido = await db.pedido.create({
      data: {
        numero,
        puntosGanados, puntosCanjeados, valorPuntoAplicado: reglas.valorPunto, costoDomicilio,
        sucursalId,
        usuarioId,
        clienteId: clienteId || null,
        cajaId: cajaActivaId,
        metodoPago: metodoPago as any,
        subtotal,
        descuento,
        total,
        observacion: observacion || null,
        estado: esRestaurante ? 'PENDIENTE' : 'ENTREGADO',
        pagos: {
          create: pagos.map((p) => ({ metodoPago: p.metodoPago as any, monto: p.monto })),
        },
        detalles: {
          create: itemsValidados.map((item) => ({
            productoId: item.producto.id,
            cantidad: item.cantidad,
            // precioUnitario guarda el precio de la presentación vendida (o el del producto si no aplica); subtotal ya incluye adicionales
            precioUnitario: item.precioUnitario,
            presentacionId: item.presentacionId,
            presentacionNombre: item.presentacionNombre,
            factorUnidades: item.factorUnidades,
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
        pagos: true,
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

  async listarPedidos(empresaId: number, sucursalId?: number, cajaId?: number) {
    return this.prisma.pedido.findMany({
      where: {
        sucursal: { empresaId },
        ...(sucursalId && { sucursalId }),
        ...(cajaId && { cajaId }),
      },
      include: {
        detalles: {
          include: {
            producto: true,
            adicionales: { include: { adicional: true } },
          },
        },
        pagos: true,
        usuario: { select: { nombre: true } },
        cliente: { select: { nombre: true, telefono: true } },
      },
      orderBy: { creadoEn: 'desc' },
      // Sin filtro por caja el límite evita listas enormes; filtrando por una
      // sola caja (el turno actual) todas sus ventas deben verse, así no se
      // "pierdan" ventas viejas del turno cuando la sucursal ya tiene +50.
      take: cajaId ? undefined : 50,
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
        pagos: true,
        usuario: { select: { nombre: true } },
        cliente: { select: { nombre: true, telefono: true } },
        sucursal: { select: { nombre: true } },
      },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return pedido;
  }

  async actualizarPago(id: number, datos: any, usuarioId: number, empresaId: number) {
    const pedido = await this.prisma.pedido.findFirst({ where: { id, sucursal: { empresaId } } });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    if (pedido.estado === 'ANULADO') throw new BadRequestException('Una venta anulada no puede modificarse');
    if (pedido.cajaId) {
      const caja = await this.prisma.caja.findUnique({ where: { id: pedido.cajaId } });
      if (!caja || caja.estado !== 'ABIERTA') {
        throw new BadRequestException('La caja de esta venta ya está cerrada. Requiere conciliación para modificar el pago.');
      }
    }

    const { metodoPago, pagos } = this.normalizarPagos(datos, Number(pedido.total));
    const metodoAnterior = pedido.metodoPago;

    const actualizado = await this.prisma.$transaction(async (db) => {
      await db.pagoPedido.deleteMany({ where: { pedidoId: id } });
      return db.pedido.update({
        where: { id },
        data: {
          metodoPago: metodoPago as any,
          pagos: { create: pagos.map((p) => ({ metodoPago: p.metodoPago as any, monto: p.monto })) },
        },
        include: { pagos: true },
      });
    });

    if (pedido.cajaId) {
      await this.prisma.eventoCaja.create({
        data: {
          cajaId: pedido.cajaId,
          tipo: 'EDICION_PAGO',
          descripcion: `Pago de la venta ${pedido.numero} cambiado de ${metodoAnterior} a ${metodoPago}`,
          usuarioId,
        },
      });
    }

    this.eventos.emitir(empresaId, { tipo: 'ACTUALIZADO', pedidoId: id, estado: actualizado.estado });
    return actualizado;
  }

  async actualizarEstado(id: number, estado: string, empresaId: number, usuarioId?: number) {
    if (!['PENDIENTE','EN_COCINA','LISTO','ENTREGADO','ANULADO'].includes(estado)) throw new BadRequestException('Estado no válido');
    const referencia = await this.prisma.pedido.findFirst({ where: { id, sucursal: { empresaId } }, select: { sucursalId: true } });
    if (!referencia) throw new NotFoundException('Pedido no encontrado');
    const actualizado = await this.prisma.$transaction(async tx => {
      await bloquearCajaSucursal(tx, referencia.sucursalId);
      const empresa = await tx.empresa.findUnique({ where: { id: empresaId }, select: { tipoNegocio: true } });
      // Los estados de cocina solo aplican a restaurantes; anular una venta
      // (con reposición de inventario y reversión contable) aplica a
      // cualquier tipo de negocio.
      if (estado !== 'ANULADO' && empresa?.tipoNegocio !== 'RESTAURANTE') throw new BadRequestException('Las ventas comerciales requieren un flujo de devoluciones y conciliación para modificarse');
      const pedido = await tx.pedido.findFirst({
        where: { id, sucursal: { empresaId } },
        include: estado === 'ANULADO' ? {
          detalles: {
            include: {
              producto: { include: { ingredientes: { include: { ingrediente: true } } } },
              adicionales: { include: { adicional: true } },
            },
          },
        } : undefined,
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.estado === 'ANULADO') throw new BadRequestException('Un pedido anulado no puede reabrirse');
      const web = await tx.pedidoWeb.findUnique({ where: { pedidoId: id } });
      if (web && (['ENTREGADO','ANULADO'].includes(estado) || ['EN_CAMINO','ENTREGADO'].includes(web.estado))) throw new BadRequestException('Gestione este pedido desde Domicilios. Las ventas aceptadas requieren conciliación antes de cancelar.');
      if (estado === 'ANULADO' && (pedido.puntosGanados || pedido.puntosCanjeados)) throw new BadRequestException('Esta venta tiene movimientos de puntos. Requiere conciliación antes de anular para no alterar saldos sin respaldo.');
      if (estado === 'ANULADO') {
        const caja = pedido.cajaId ? await tx.caja.findUnique({ where: { id: pedido.cajaId } }) : null;
        if (!caja || caja.estado !== 'ABIERTA') throw new BadRequestException('La caja está cerrada. Esta venta requiere conciliación antes de anular.');

        // Reponer existencias: stockActual directo (comercio) y, si la venta
        // usó receta, los ingredientes descontados en la venta original.
        for (const detalle of (pedido as any).detalles || []) {
          if (detalle.producto.controlaStock) {
            const unidadesBase = detalle.cantidad * (detalle.factorUnidades || 1);
            await tx.producto.update({ where: { id: detalle.productoId }, data: { stockActual: { increment: unidadesBase } } });
          }
          for (const pi of detalle.producto.ingredientes) {
            const excluido = detalle.exclusiones.includes(pi.ingrediente.nombre);
            if (!excluido) {
              const cantidad = this.obtenerCantidadInventario(pi.ingrediente, Number(pi.cantidad)) * detalle.cantidad;
              await tx.ingrediente.update({ where: { id: pi.ingredienteId }, data: { stock: { increment: cantidad } } });
            }
          }
          for (const da of detalle.adicionales || []) {
            if (da.adicional?.ingredienteId) {
              const cantidad = Number(da.cantidad) * detalle.cantidad;
              await tx.ingrediente.update({ where: { id: da.adicional.ingredienteId }, data: { stock: { increment: cantidad } } });
            }
          }
        }

        // Revertir los movimientos financieros de la venta creando el
        // movimiento contrario (no se borra el original) para conservar el
        // rastro de auditoría completo.
        const ingreso = await tx.movimientoFinanciero.findFirst({ where: { pedidoId: id, empresaId, tipo: 'INGRESO', categoria: 'VENTA' } });
        if (!ingreso) throw new BadRequestException('No se encontró el ingreso de la venta. Requiere conciliación.');
        await tx.movimientoFinanciero.create({ data: {
          empresaId, sucursalId: pedido.sucursalId, usuarioId: usuarioId ?? pedido.usuarioId,
          pedidoId: id, tipo: 'EGRESO', categoria: 'VENTA', monto: ingreso.monto,
          descripcion: `Anulación de venta ${pedido.numero}`,
        } });
        const costo = await tx.movimientoFinanciero.findFirst({ where: { pedidoId: id, empresaId, tipo: 'EGRESO', categoria: 'COSTO_VENTA' } });
        if (costo) {
          await tx.movimientoFinanciero.create({ data: {
            empresaId, sucursalId: pedido.sucursalId, usuarioId: usuarioId ?? pedido.usuarioId,
            pedidoId: id, tipo: 'INGRESO', categoria: 'COSTO_VENTA', monto: costo.monto,
            descripcion: `Reversión de costo de venta ${pedido.numero}`,
          } });
        }
        await tx.eventoCaja.create({
          data: {
            cajaId: pedido.cajaId!,
            tipo: 'ANULACION',
            descripcion: `Venta ${pedido.numero} anulada (total $${Number(ingreso.monto).toLocaleString('es-CO')})`,
            usuarioId: usuarioId ?? pedido.usuarioId,
            esAlerta: true,
          },
        });
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

  // "PED-{sucursal}-{fecha Bogotá}-{consecutivo del día}", ej. PED-2-20260928-0007.
  // El consecutivo se cuenta dentro de la misma transacción, ya serializada por
  // bloquearCajaSucursal (llamado antes en crearEnTransaccion), así que no hay
  // riesgo de dos pedidos de la misma sucursal calculando el mismo número a la vez.
  private async generarNumeroPedido(sucursalId: number, db: Prisma.TransactionClient): Promise<string> {
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date())
      .replace(/-/g, '');
    const prefijo = `PED-${sucursalId}-${fecha}-`;
    const delDia = await db.pedido.count({ where: { sucursalId, numero: { startsWith: prefijo } } });
    return `${prefijo}${String(delDia + 1).padStart(4, '0')}`;
  }
}
