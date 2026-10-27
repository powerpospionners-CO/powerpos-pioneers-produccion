import { normalizarPagos, normalizarAbonosIniciales, calcularCostoVenta } from './calculos-venta';
import { createHash } from 'node:crypto';
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
import { costoHistoricoItem } from './costo-historico';
import { fechaDia } from '../administracion/administracion.service';
import { adicionalesConEmpaque } from './empaque';
import { estadisticasCalendario } from './estadisticas-calendario';
import { esBebida, adicionalListo } from '../adicionales/reglas-trailer';


@Injectable()
export class PedidosService {
  constructor(
    private prisma: PrismaService,
    private readonly eventos: PedidosEventosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async crearPedido(datos: any, usuarioId: number, empresaId: number) {
    const pedido = await this.prisma.$transaction(tx => this.crearEnTransaccion(datos, usuarioId, empresaId, tx), { timeout: 15000 });
    await this.eventos.emitir(empresaId, { tipo: 'CREADO', pedidoId: pedido.id, estado: pedido.estado });
    // La venta ya fue confirmada: una falla de un canal externo no debe inducir a repetirla.
    void this.notificaciones.enviarAlerta({ tipo: 'VENTA REGISTRADA', mensaje: `Venta ${pedido.numero}. Total: $${Number(pedido.total).toLocaleString('es-CO')}`, empresa: 'PowerPOS', sucursal: String(pedido.sucursalId), empresaId }).catch(() => undefined);
    return pedido;
  }

  async crearEnTransaccion(datos: any, usuarioId: number, empresaId: number, db: Prisma.TransactionClient, costoDomicilio = 0) {
    const { items, clienteId, observacion, sucursalId, cajaId } =
      datos;

    // Reintento de una venta guardada offline: si ya se procesó (se perdió
    // la respuesta, no la petición), se devuelve la misma venta en vez de
    // volver a validar todo — el stock ya pudo cambiar desde entonces y no
    // tendría sentido rechazar un reintento de algo que ya se vendió.
    const claveIdempotencia = datos.claveIdempotencia ? String(datos.claveIdempotencia).slice(0, 100) : null;
    if (claveIdempotencia) {
      const existente = await db.pedido.findUnique({
        where: { claveIdempotencia },
        include: {
          cuentaCredito: true,
          operacionesCaja: { where: { tipo: 'COBRO_CREDITO' } },
          detalles: { include: { producto: true, adicionales: { include: { adicional: true } } } },
          pagos: true,
          usuario: { select: { nombre: true } },
          cliente: { select: { nombre: true, telefono: true } },
        },
      });
      if (existente) {
        const pertenece = await db.sucursal.findFirst({
          where: { id: existente.sucursalId, empresaId }, select: { id: true },
        });
        if (!pertenece) throw new BadRequestException('La clave de la venta no está disponible');
        return existente.metodoPago === 'CREDITO' ? { ...existente, abonosCredito: existente.operacionesCaja.map(o=>({metodoPago:o.metodoPago,monto:Number(o.monto)})) } : existente;
      }
    }

    // El tope de la cantidad no puede ser el mismo para unidades que para
    // venta al granel: ahí "cantidad" son gramos/mililitros (ej. 2000 = 2kg),
    // así que un límite pensado para unidades (999) bloqueaba ventas al
    // granel normales. Se sube para dar cabida a varios kilos/litros y
    // seguir descartando valores absurdos por error de digitación.
    if (!Array.isArray(items) || items.length < 1 || items.length > 100 || items.some(i => !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 999999 || !Number.isInteger(i.productoId))) throw new BadRequestException('Productos o cantidades no válidos');
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
          categoria: { include: { categoriaPadre: true } },
          adicionales: {
            include: { adicional: { include: { ingrediente: true } } },
          },
          presentaciones: {
            where: { activo: true },
            select: { id: true },
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
      let varianteSabor: string | null = null;
      if (item.codigoVarianteId !== undefined && item.codigoVarianteId !== null) {
        if (item.presentacionId) {
          throw new BadRequestException('Un código por sabor no puede combinarse con una presentación');
        }
        if (!Number.isInteger(item.codigoVarianteId) || item.codigoVarianteId < 1) {
          throw new BadRequestException('La variante del producto no es válida');
        }
        const variante = await db.productoCodigoBarras.findFirst({
          where: {
            id: item.codigoVarianteId,
            empresaId,
            productoId: producto.id,
          },
          select: { sabor: true },
        });
        if (!variante) throw new NotFoundException('El sabor seleccionado no está disponible para este producto');
        varianteSabor = variante.sabor;
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
      if (empresaId === 1) {
        // Los empaques siguen ligados a su producto; los extras de comida son globales.
        for (const pa of producto.adicionales) {
          if (pa.adicional.empaqueParaLlevar && adicionalListo(pa.adicional))
            adicionalesPermitidos.set(pa.adicional.id, pa.adicional);
        }
        if (!esBebida(producto) && Array.isArray(item.adicionales) && item.adicionales.length) {
          const catalogo = await db.adicional.findMany({
            where: { empresaId, activo: true, disponible: true, empaqueParaLlevar: false },
            include: { ingrediente: true },
          });
          for (const ad of catalogo) if (adicionalListo(ad)) adicionalesPermitidos.set(ad.id, ad);
        }
      } else if (producto.adicionales.length > 0) {
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
          where: { empresaId, activo: true, disponible: true, empaqueParaLlevar: false },
          include: { ingrediente: true },
        });
        for (const ad of catalogo) adicionalesPermitidos.set(ad.id, ad);
      }

      const adicionalesValidados = [];
      let extrasPorUnidad = 0;
      for (const solicitud of adicionalesConEmpaque(item, producto)) {
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
        observacion: item.tipoConsumo
          ? `[${item.tipoConsumo === 'PARA_LLEVAR' ? 'Para llevar' : 'Comer aquí'}] ${item.observacion || ''}`.trim()
          : item.observacion || null,
        adicionales: adicionalesValidados,
        subtotal: itemSubtotal,
        presentacionId: presentacion?.id ?? null,
        presentacionNombre:
          presentacion?.nombre ??
          (!producto.ventaGranel && (producto.presentaciones?.length ?? 0) > 0
            ? 'Unidad'
            : null),
        varianteSabor,
        factorUnidades,
        precioUnitario,
        consumos: [] as { tipo: 'PRODUCTO' | 'INGREDIENTE'; id: number; cantidad: number }[],
        componentes: producto.esCombo ? await db.comboComponente.findMany({ where: { comboId: producto.id, producto: { empresaId } }, include: { producto: true } }) : [],
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
    if (datos.condicionPago !== undefined && !['CONTADO', 'CREDITO'].includes(datos.condicionPago)) throw new BadRequestException('Condición de pago no válida');
    const credito = datos.condicionPago === 'CREDITO';
    if (credito && (!clienteId || puntosCanjeados || costoDomicilio || !claveIdempotencia)) throw new BadRequestException('El crédito requiere cliente y clave de operación; no admite canje de puntos ni domicilio');
    const vencimientoCredito = credito ? fechaDia(datos.vencimientoCredito) : null;
    const hoyCredito = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    if (vencimientoCredito && vencimientoCredito < fechaDia(hoyCredito)) throw new BadRequestException('El vencimiento no puede estar en el pasado');
    const puntosCalculados = clienteId ? calcularPuntos(itemsValidados, subtotal, descuento, reglas) : 0;
    const puntosGanados = credito ? 0 : puntosCalculados;
    const total = subtotal - descuento + costoDomicilio;
    monto(Math.round(total * 100) / 100, 'Total', 0, 99999999.99);
    if (puntosCalculados > 2147483647) throw new BadRequestException('Revise la regla de acumulación: genera demasiados puntos');
    const cambio = monto(datos.cambio ?? 0, 'Cambio', 0, 99999999.99);
    const abonosIniciales = credito ? normalizarAbonosIniciales(datos, total) : [];
    if (credito && (total <= 0 || (cambio > 0 && !abonosIniciales.some(p=>p.metodoPago==='EFECTIVO')))) throw new BadRequestException('El crédito requiere un saldo pendiente; el cambio solo aplica a un abono en efectivo');
    const { metodoPago, pagos } = credito ? { metodoPago: 'CREDITO', pagos: [] } : normalizarPagos(datos, Math.round(total * 100) / 100);

    const consumoInventario: { tipo: 'PRODUCTO' | 'INGREDIENTE'; id: number; cantidad: number }[] = [];
    for (const item of itemsValidados) {
      // Un combo/canasta no tiene stock propio: vender uno descuenta el de
      // cada producto que lo compone (ej. vender 1 "Canasta básica" baja
      // tomate, cebolla y huevos por separado, según lo que se armó).
      if (item.producto.esCombo) {
        const componentes = item.componentes;
        for (const componente of componentes) {
          if (!componente.producto.controlaStock) continue;
          const unidadesBase = componente.cantidad * item.cantidad;
          const actualizado = await db.producto.updateMany({
            where: { id: componente.productoId, empresaId, stockActual: { gte: unidadesBase } },
            data: { stockActual: { decrement: unidadesBase } },
          });
          if (!actualizado.count) throw new BadRequestException(`Existencias insuficientes de ${componente.producto.nombre} (para ${item.producto.nombre})`);
          consumoInventario.push({ tipo: 'PRODUCTO', id: componente.productoId, cantidad: unidadesBase });
          item.consumos.push({ tipo: 'PRODUCTO', id: componente.productoId, cantidad: unidadesBase });
        }
        continue;
      }
      if (!item.producto.controlaStock) continue;
      const unidadesBase = item.cantidad * item.factorUnidades;
      const actualizado = await db.producto.updateMany({
        where: { id: item.producto.id, empresaId, stockActual: { gte: unidadesBase } },
        data: { stockActual: { decrement: unidadesBase } },
      });
      if (!actualizado.count) throw new BadRequestException(`Existencias insuficientes de ${item.producto.nombre}${item.presentacionNombre ? ` (${item.presentacionNombre})` : ''}`);
      consumoInventario.push({ tipo: 'PRODUCTO', id: item.producto.id, cantidad: unidadesBase });
      item.consumos.push({ tipo: 'PRODUCTO', id: item.producto.id, cantidad: unidadesBase });
    }

    if (esRestaurante) {
      for (const item of itemsValidados) {
        for (const pi of item.producto.ingredientes) {
          if (!item.exclusiones.includes(pi.ingrediente.nombre)) {
            const consumo = { tipo: 'INGREDIENTE' as const, id: pi.ingredienteId, cantidad: this.obtenerCantidadInventario(pi.ingrediente, Number(pi.cantidad)) * item.cantidad };
            consumoInventario.push(consumo); item.consumos.push(consumo);
          }
        }
        for (const a of item.adicionales) {
          if (a.adicional.ingredienteId && a.adicional.cantidad) {
            const consumo = { tipo: 'INGREDIENTE' as const, id: a.adicional.ingredienteId, cantidad: Number(a.adicional.cantidad) * a.cantidad * item.cantidad };
            consumoInventario.push(consumo); item.consumos.push(consumo);
          }
        }
      }
    }

    const numero = await this.generarNumeroPedido(sucursalId, db);
    const costosHistoricos = itemsValidados.map(costoHistoricoItem);
    const sumaHistorica = costosHistoricos.reduce((sum, c) => sum + (c ?? 0), 0);
    const costoHistorico = costosHistoricos.every(c => c !== null) && sumaHistorica <= 9999999999
      ? Math.round(sumaHistorica * 10000) / 10000 : null;

    const pedido = await db.pedido.create({
      data: {
        numero,
        puntosGanados, puntosCanjeados, valorPuntoAplicado: reglas.valorPunto, costoDomicilio, cambio,
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
        claveIdempotencia,
        consumoInventario,
        costoVentaHistorico: costoHistorico,
        puntosCreditoPendientes: credito ? puntosCalculados : 0,
        pagos: {
          create: pagos.map((p) => ({ metodoPago: p.metodoPago as any, monto: p.monto })),
        },
        detalles: {
          create: itemsValidados.map((item, indice) => ({
            costoVentaHistorico: costosHistoricos[indice],
            consumoInventario: item.consumos,
            productoId: item.producto.id,
            cantidad: item.cantidad,
            // precioUnitario guarda el precio de la presentación vendida (o el del producto si no aplica); subtotal ya incluye adicionales
            precioUnitario: item.precioUnitario,
            presentacionId: item.presentacionId,
            presentacionNombre: item.presentacionNombre,
            varianteSabor: item.varianteSabor,
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
    if (!credito) await db.movimientoFinanciero.create({
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

    let cuentaCredito: any = null;
    if (credito) {
      const abonado = abonosIniciales.reduce((s,p)=>s+p.monto,0);
      cuentaCredito = await db.cuentaAdministrativa.create({ data: {
      empresaId, sucursalId, usuarioId, pedidoId: pedido.id,
      tipo: 'COBRAR', categoria: 'VENTA', documento: `POS-${pedido.numero}`,
      tercero: `Cliente #${clienteId}`, descripcion: `Venta a crédito ${pedido.numero}`,
      monto: total, saldo: Math.round((total-abonado)*100)/100, vencimiento: vencimientoCredito!,
    } });
      for (const [indice, abono] of abonosIniciales.entries()) {
        const clave = createHash('sha256').update(`abono-inicial:${claveIdempotencia}:${indice}`).digest('hex');
        const referencia = `Abono inicial ${abono.metodoPago} ${pedido.numero}`;
        const movimiento = await db.movimientoFinanciero.create({ data: { empresaId, sucursalId, usuarioId, pedidoId: pedido.id, tipo: 'INGRESO', categoria: 'VENTA', monto: abono.monto, descripcion: referencia, comprobante: referencia } });
        await db.abonoAdministrativo.create({ data: { cuentaId: cuentaCredito.id, usuarioId, monto: abono.monto, referencia, clave, movimientoId: movimiento.id } });
        const op = await db.operacionVentaCaja.create({ data: { empresaId, pedidoId: pedido.id, cajaId: cajaActivaId, usuarioId, clave, tipo: 'COBRO_CREDITO', metodoPago: abono.metodoPago as any, monto: abono.monto, motivo: referencia, detalle: { origen: 'ABONO_INICIAL', movimientoId: movimiento.id, puntosOtorgados: 0, puntosBaseDevuelto: 0 } } });
        await db.auditoria.create({ data: { empresaId, usuarioId, accion: 'CREAR', entidad: 'OPERACION_VENTA_CAJA', entidadId: op.id, detalle: { pedidoId: pedido.id, cajaId: cajaActivaId, monto: abono.monto, origen: 'ABONO_INICIAL' } } });
      }
    }

    // Registrar también el costo de lo vendido, para que la utilidad neta
    // reste lo invertido y no muestre el ingreso completo como si fuera
    // ganancia. En comercio/tienda usa el costo del producto; en
    // restaurante, el costo de la receta (igual que en Reportes).
    const costoVenta = costoHistorico === null ? calcularCostoVenta(itemsValidados) : Number(costoHistorico);
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

    return credito ? { ...pedido, cuentaCredito, abonosCredito: abonosIniciales } : pedido;
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

  async listarPedidos(empresaId: number, sucursalId?: number, cajaId?: number, fecha?: string) {
    // Colombia no tiene horario de verano, así que un offset fijo de -05:00
    // alcanza para delimitar "todo el día" de `fecha` sin necesitar Intl.
    let rangoFecha: { gte: Date; lt: Date } | undefined;
    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const inicio = new Date(`${fecha}T00:00:00-05:00`);
      const fin = new Date(`${fecha}T00:00:00-05:00`);
      fin.setUTCDate(fin.getUTCDate() + 1);
      rangoFecha = { gte: inicio, lt: fin };
    }
    return this.prisma.pedido.findMany({
      where: {
        sucursal: { empresaId },
        ...(sucursalId && { sucursalId }),
        ...(cajaId && { cajaId }),
        ...(rangoFecha && { creadoEn: rangoFecha }),
        ...(!cajaId && !rangoFecha ? { devueltoTotal: false } : {}),
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
      // Sin filtro por caja ni por fecha el límite evita listas enormes;
      // filtrando por una sola caja o por un día concreto deben verse todas
      // sus ventas, así no se "pierdan" ventas viejas cuando la sucursal ya
      // tiene +50 pedidos recientes.
      take: cajaId || rangoFecha ? undefined : 50,
    });
  }

  async obtenerPedido(id: number, empresaId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, sucursal: { empresaId } },
      include: {
        cuentaCredito: true,
        operacionesCaja: { where: { tipo: { in: ['DEVOLUCION', 'COBRO_CREDITO'] } } },
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
    return pedido.metodoPago === 'CREDITO' ? { ...pedido, abonosCredito: pedido.operacionesCaja.filter(o=>o.tipo==='COBRO_CREDITO').map(o=>({metodoPago:o.metodoPago,monto:Number(o.monto)})) } : pedido;
  }

  async actualizarPago(id: number, datos: any, usuarioId: number, empresaId: number) {
    const referencia = await this.prisma.pedido.findFirst({ where: { id, sucursal: { empresaId } }, select: { sucursalId: true } });
    if (!referencia) throw new NotFoundException('Pedido no encontrado');
    const actualizado = await this.prisma.$transaction(async (db) => {
      await bloquearCajaSucursal(db, referencia.sucursalId);
      const pedido = await db.pedido.findFirst({ where: { id, sucursal: { empresaId } } });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.estado === 'ANULADO') throw new BadRequestException('Una venta anulada no puede modificarse');
      if (await db.operacionVentaCaja.count({ where: { pedidoId: id, tipo: 'DEVOLUCION' } })) throw new BadRequestException('Una venta con devoluciones no admite cambios de pago');
      if (pedido.metodoPago === 'CREDITO') throw new BadRequestException('Use el flujo de cobros de crédito para esta venta');
      if (pedido.cajaId) {
        const caja = await db.caja.findUnique({ where: { id: pedido.cajaId } });
        if (!caja || caja.estado !== 'ABIERTA') throw new BadRequestException('La caja de esta venta ya está cerrada. Requiere conciliación para modificar el pago.');
      }
      const { metodoPago, pagos } = normalizarPagos(datos, Number(pedido.total));
      await db.pagoPedido.deleteMany({ where: { pedidoId: id } });
      if (pedido.cajaId) await db.eventoCaja.create({
        data: { cajaId: pedido.cajaId, tipo: 'EDICION_PAGO',
          descripcion: `Pago de la venta ${pedido.numero} cambiado de ${pedido.metodoPago} a ${metodoPago}`, usuarioId },
      });
      return db.pedido.update({
        where: { id },
        data: {
          metodoPago: metodoPago as any,
          pagos: { create: pagos.map((p) => ({ metodoPago: p.metodoPago as any, monto: p.monto })) },
        },
        include: { pagos: true },
      });
    });

    await this.eventos.emitir(empresaId, { tipo: 'ACTUALIZADO', pedidoId: id, estado: actualizado.estado });
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
      if (await tx.operacionVentaCaja.count({ where: { pedidoId: id, tipo: 'DEVOLUCION' } })) throw new BadRequestException('Una venta con devoluciones no admite cambios de estado');
      if (estado === 'ANULADO' && pedido.metodoPago === 'CREDITO') throw new BadRequestException('Use el flujo de devolución y conciliación de crédito');
      const web = await tx.pedidoWeb.findUnique({ where: { pedidoId: id } });
      if (web && (['ENTREGADO','ANULADO'].includes(estado) || ['EN_CAMINO','ENTREGADO'].includes(web.estado))) throw new BadRequestException('Gestione este pedido desde Domicilios. Las ventas aceptadas requieren conciliación antes de cancelar.');
      if (estado === 'ANULADO' && (pedido.puntosGanados || pedido.puntosCanjeados)) throw new BadRequestException('Esta venta tiene movimientos de puntos. Requiere conciliación antes de anular para no alterar saldos sin respaldo.');
      if (estado === 'ANULADO') {
        const caja = pedido.cajaId ? await tx.caja.findUnique({ where: { id: pedido.cajaId } }) : null;
        if (!caja || caja.estado !== 'ABIERTA') throw new BadRequestException('La caja está cerrada. Esta venta requiere conciliación antes de anular.');

        // Reponer existencias: stockActual directo (comercio), los
        // componentes de un combo si la venta fue de una canasta, y si la
        // venta usó receta, los ingredientes descontados en la venta original.
        if (Array.isArray(pedido.consumoInventario)) {
          for (const consumo of pedido.consumoInventario as { tipo: string; id: number; cantidad: number }[]) {
            if (consumo.tipo === 'PRODUCTO') {
              await tx.producto.update({ where: { id: consumo.id }, data: { stockActual: { increment: consumo.cantidad } } });
            } else {
              await tx.ingrediente.update({ where: { id: consumo.id }, data: { stock: { increment: consumo.cantidad } } });
            }
          }
        } else for (const detalle of (pedido as any).detalles || []) {
          if (detalle.producto.esCombo) {
            const componentes = await tx.comboComponente.findMany({ where: { comboId: detalle.productoId }, include: { producto: true } });
            for (const componente of componentes) {
              if (!componente.producto.controlaStock) continue;
              const unidadesBase = componente.cantidad * detalle.cantidad;
              await tx.producto.update({ where: { id: componente.productoId }, data: { stockActual: { increment: unidadesBase } } });
            }
          } else if (detalle.producto.controlaStock) {
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
              const cantidad = Number(da.adicional.cantidad || 0) * Number(da.cantidad) * detalle.cantidad;
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
    await this.eventos.emitir(empresaId, {
      tipo: 'ACTUALIZADO',
      pedidoId: id,
      estado: actualizado.estado,
    });
    if (actualizado.estado === 'ANULADO') {
      void Promise.resolve().then(() => this.notificaciones.enviarAlerta({ empresaId, tipo: 'ANULACIÓN DE VENTA', empresa: 'PowerPOS', sucursal: String(actualizado.sucursalId), mensaje: `Se anuló la venta ${actualizado.numero}, por $${Number(actualizado.total).toLocaleString('es-CO')}. Usuario responsable: ${usuarioId ?? actualizado.usuarioId}.` })).catch(() => undefined);
    }
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

    const { ventasPorDia, ventasPorMes, pedidosHoy } = estadisticasCalendario(pedidos);

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

    return {
      ventasPorDia,
      ventasPorMes,
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
