import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { CategoriaMovimiento, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fechaDia, texto } from '../administracion/administracion.service';

const CATEGORIAS_EGRESO = new Set<CategoriaMovimiento>([
  CategoriaMovimiento.COMPRA_MERCANCIA,
  CategoriaMovimiento.COMPRA_INSUMOS,
  CategoriaMovimiento.NOMINA,
  CategoriaMovimiento.SERVICIOS,
  CategoriaMovimiento.ARRIENDO,
  CategoriaMovimiento.MANTENIMIENTO,
  CategoriaMovimiento.IMPUESTOS,
  CategoriaMovimiento.COMISION_DISTRIBUIDOR,
  CategoriaMovimiento.OTROS,
]);

type ItemCompraInput = {
  productoId: number;
  presentacionId?: number | null;
  cantidad: number;
  costoUnitario: number;
};

type CompraInput = {
  proveedorId?: number;
  condicionPago?: 'CONTADO' | 'CREDITO';
  documento?: string;
  vencimiento?: string;
  categoria: CategoriaMovimiento;
  descripcion: string;
  fecha?: string;
  monto?: number;
  items?: ItemCompraInput[];
};

const redondearPesos = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerSaldo(empresaId: number) {
    const saldoInicial = await this.prisma.saldoInicialCuenta.findUnique({
      where: { empresaId },
      select: { monto: true, desde: true, creadoEn: true, usuario: { select: { nombre: true } } },
    });
    if (!saldoInicial) {
      return { configurado: false, saldoInicial: null, desde: null, saldoDisponible: null };
    }

    const movimientos = await this.prisma.movimientoFinanciero.findMany({
      where: { empresaId, fecha: { gte: saldoInicial.desde, lte: new Date() } },
      select: { tipo: true, categoria: true, monto: true },
    });
    const saldoMovimientos = movimientos.reduce((saldo, movimiento) => {
      // COSTO_VENTA se registra para calcular utilidad; no es una salida nueva
      // de dinero de la cuenta y restarlo duplicaría el costo ya pagado al comprar.
      if (movimiento.categoria === CategoriaMovimiento.COSTO_VENTA) return saldo;
      const monto = Number(movimiento.monto);
      return saldo + (movimiento.tipo === 'INGRESO' ? monto : -monto);
    }, 0);

    return {
      configurado: true,
      saldoInicial: Number(saldoInicial.monto),
      desde: saldoInicial.desde,
      configuradoPor: saldoInicial.usuario.nombre,
      saldoDisponible: redondearPesos(Number(saldoInicial.monto) + saldoMovimientos),
    };
  }

  async configurarSaldoInicial(montoInput: number, empresaId: number, usuarioId: number) {
    const entradaMonto = Number(montoInput);
    if (!Number.isFinite(entradaMonto) || entradaMonto < 0 || entradaMonto > 99_999_999.99) {
      throw new BadRequestException('El saldo inicial debe ser un valor entre $0 y $99.999.999,99');
    }
    const monto = redondearPesos(entradaMonto);

    return this.prisma.$transaction(async (tx) => {
      const anterior = await tx.saldoInicialCuenta.findUnique({ where: { empresaId } });
      const saldo = await tx.saldoInicialCuenta.upsert({
        where: { empresaId },
        create: { empresaId, usuarioId, monto },
        update: { usuarioId, monto },
      });
      await tx.auditoria.create({
        data: {
          empresaId,
          usuarioId,
          accion: anterior ? 'ACTUALIZAR' : 'CREAR',
          entidad: 'SALDO_INICIAL_CUENTA',
          entidadId: saldo.id,
          detalle: {
            anterior: anterior ? Number(anterior.monto) : null,
            nuevo: monto,
            desde: saldo.desde.toISOString(),
          },
        },
      });
      return {
        configurado: true,
        saldoInicial: Number(saldo.monto),
        desde: saldo.desde,
        saldoDisponible: (await this.obtenerSaldoDentroTransaccion(tx, empresaId, saldo.monto, saldo.desde)),
      };
    });
  }

  private async obtenerSaldoDentroTransaccion(
    tx: Prisma.TransactionClient,
    empresaId: number,
    montoInicial: Prisma.Decimal,
    desde: Date,
  ) {
    const movimientos = await tx.movimientoFinanciero.findMany({
      where: { empresaId, fecha: { gte: desde, lte: new Date() } },
      select: { tipo: true, categoria: true, monto: true },
    });
    const neto = movimientos.reduce((saldo, movimiento) => {
      if (movimiento.categoria === CategoriaMovimiento.COSTO_VENTA) return saldo;
      const monto = Number(movimiento.monto);
      return saldo + (movimiento.tipo === 'INGRESO' ? monto : -monto);
    }, 0);
    return redondearPesos(Number(montoInicial) + neto);
  }

  async registrar(datos: CompraInput, usuarioId: number, empresaId: number, sucursalId: number, transaccion?: Prisma.TransactionClient) {
    const consulta = transaccion || this.prisma;
    const condicionPago = datos.condicionPago ?? 'CONTADO';
    if (!['CONTADO', 'CREDITO'].includes(condicionPago)) throw new BadRequestException('Condición de pago no válida');
    const credito = condicionPago === 'CREDITO';
    let documento: string | undefined;
    let vencimiento: Date | undefined;
    if (credito || datos.proveedorId !== undefined) {
      const empresa = await consulta.empresa.findUnique({ where: { id: empresaId }, select: { permisos: true } });
      if (process.env.ADMINISTRACION_HABILITADA !== 'true' || (empresa?.permisos as Record<string, unknown>)?.administracion !== true) throw new BadRequestException('Los controles administrativos no están habilitados');
      if (!Number.isInteger(datos.proveedorId) || datos.proveedorId <= 0) throw new BadRequestException('Selecciona un proveedor');
    }
    if (credito) {
      documento = texto(datos.documento, 'Referencia del proveedor y factura', 100);
      vencimiento = fechaDia(datos.vencimiento);
    }
    if (!CATEGORIAS_EGRESO.has(datos.categoria)) {
      throw new BadRequestException('Selecciona una categoría de egreso válida');
    }
    const descripcion = String(datos.descripcion || '').trim();
    if (!descripcion) throw new BadRequestException('La descripción es obligatoria');
    const fecha = datos.fecha ? new Date(datos.fecha) : new Date();
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('La fecha no es válida');
    const esCompraMercancia = datos.categoria === CategoriaMovimiento.COMPRA_MERCANCIA;
    const items = Array.isArray(datos.items) ? datos.items : [];
    if (esCompraMercancia && items.length === 0) {
      throw new BadRequestException('Agrega al menos un producto a la compra de mercancía');
    }
    if (!esCompraMercancia && items.length > 0) {
      throw new BadRequestException('Solo las compras de mercancía pueden incluir productos');
    }

    const montoManual = Number(datos.monto);
    if (!esCompraMercancia && (!Number.isFinite(montoManual) || montoManual <= 0 || montoManual > 99_999_999.99)) {
      throw new BadRequestException('El monto debe ser mayor a cero y no superar $99.999.999,99');
    }

    const saldoInicial = await consulta.saldoInicialCuenta.findUnique({ where: { empresaId } });
    if (!saldoInicial) {
      throw new BadRequestException('Antes de registrar movimientos, configura el saldo inicial real de la cuenta');
    }
    if (fecha < saldoInicial.desde) {
      throw new BadRequestException('La fecha del movimiento no puede ser anterior al inicio del control de saldo');
    }
    const sucursal = await consulta.sucursal.findFirst({
      where: { id: sucursalId, empresaId, activo: true },
      select: { id: true },
    });
    if (!sucursal) throw new BadRequestException('La sucursal no pertenece a esta empresa o está inactiva');

    const productoIds = [...new Set(items.map((item) => Number(item.productoId)))];
    if (items.some((item) => !Number.isInteger(Number(item.productoId)) || Number(item.productoId) <= 0)) {
      throw new BadRequestException('Uno de los productos seleccionados no es válido');
    }

    const operar = async (tx: Prisma.TransactionClient) => {
      const proveedor = datos.proveedorId ? await tx.proveedor.findFirst({ where: { id: datos.proveedorId, empresaId, activo: true } }) : null;
      if (datos.proveedorId && !proveedor) throw new BadRequestException('Proveedor no disponible para esta empresa');
      if (credito) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${empresaId}::integer)`;
        if (await tx.cuentaAdministrativa.findUnique({ where: { empresaId_tipo_documento: { empresaId, tipo: 'PAGAR', documento } } })) throw new BadRequestException('Ya existe una obligación con este documento');
      }
      if (productoIds.length) {
        await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM productos
          WHERE id IN (${Prisma.join(productoIds)})
          ORDER BY id
          FOR UPDATE
        `;
      }

      const productos = await tx.producto.findMany({
        where: { id: { in: productoIds }, empresaId, activo: true, controlaStock: true, esCombo: false },
        include: { presentaciones: { where: { activo: true } } },
      });
      if (productos.length !== productoIds.length) {
        throw new BadRequestException('Hay productos que no existen, están inactivos o no controlan inventario');
      }
      const porId = new Map(productos.map((producto) => [producto.id, producto]));
      const detalles: Array<{
        productoId: number;
        productoNombre: string;
        cantidad: number;
        unidadCompra: string;
        factorAplicado: number;
        cantidadInventario: number;
        costoUnitario: number;
        subtotal: number;
      }> = [];

      for (const item of items) {
        const cantidad = Number(item.cantidad);
        const costoUnitario = Number(item.costoUnitario);
        if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999_999.999) {
          throw new BadRequestException('La cantidad comprada debe ser mayor a cero');
        }
        if (Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 1e-7) {
          throw new BadRequestException('La cantidad comprada admite máximo tres decimales');
        }
        if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) {
          throw new BadRequestException('El costo unitario debe ser mayor a cero');
        }
        const costoUnitarioRedondeado = redondearPesos(costoUnitario);
        if (costoUnitarioRedondeado <= 0) {
          throw new BadRequestException('El costo unitario debe ser mayor a cero');
        }
        const producto = porId.get(Number(item.productoId));
        if (!producto) throw new BadRequestException('Producto no encontrado para esta empresa');
        const presentacion = item.presentacionId
          ? producto.presentaciones.find((actual) => actual.id === Number(item.presentacionId))
          : undefined;
        if (item.presentacionId && !presentacion) {
          throw new BadRequestException(`La presentación de ${producto.nombre} no es válida`);
        }
        const granelEnUnidadMayor = producto.ventaGranel &&
          ['kg', 'l'].includes((producto.unidadGranel || '').toLowerCase());
        const factorAplicado = presentacion?.factorUnidades ?? (granelEnUnidadMayor ? 1000 : 1);
        const cantidadInventario = cantidad * factorAplicado;
        if (!Number.isInteger(cantidadInventario) || cantidadInventario <= 0 || cantidadInventario > 2_000_000_000) {
          throw new BadRequestException(`La cantidad de ${producto.nombre} no equivale a una cantidad válida de inventario`);
        }
        const unidadCompra = presentacion?.nombre ??
          (granelEnUnidadMayor ? producto.unidadGranel! : producto.unidadGranel || 'Unidad');
        const subtotal = redondearPesos(cantidad * costoUnitarioRedondeado);
        if (!Number.isFinite(subtotal) || subtotal <= 0) {
          throw new BadRequestException(`El subtotal de ${producto.nombre} no es válido`);
        }
        detalles.push({
          productoId: producto.id,
          productoNombre: producto.nombre,
          cantidad,
          unidadCompra,
          factorAplicado,
          cantidadInventario,
          costoUnitario: costoUnitarioRedondeado,
          subtotal,
        });

        const stockAnterior = producto.stockActual;
        const stockNuevo = stockAnterior + cantidadInventario;
        if (stockNuevo > 2_147_483_647) {
          throw new BadRequestException(`La cantidad resultante de ${producto.nombre} supera el máximo de inventario`);
        }
        const costoAnterior = producto.costo === null ? null : Number(producto.costo);
        const costoPromedio = costoAnterior === null || stockAnterior <= 0
          ? subtotal / cantidadInventario
          : (stockAnterior * costoAnterior + subtotal) / stockNuevo;
        await tx.producto.update({
          where: { id: producto.id },
          data: { stockActual: stockNuevo, costo: redondearPesos(costoPromedio) },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: producto.id,
            usuarioId,
            tipo: 'ENTRADA',
            cantidadMovida: cantidadInventario,
            unidadCompra,
            factorAplicado,
            stockAnterior,
            stockNuevo,
            descripcion: `Compra de mercancía: ${descripcion}`,
          },
        });
        porId.set(producto.id, {
          ...producto,
          stockActual: stockNuevo,
          costo: new Prisma.Decimal(redondearPesos(costoPromedio)),
        });
      }

      const monto = esCompraMercancia
        ? redondearPesos(detalles.reduce((total, detalle) => total + detalle.subtotal, 0))
        : redondearPesos(montoManual);
      if (monto <= 0 || monto > 99_999_999.99) {
        throw new BadRequestException('El total de la compra debe ser mayor a cero y no superar $99.999.999,99');
      }

      const compra = await tx.compraGasto.create({
        data: {
          empresaId,
          sucursalId,
          usuarioId,
          categoria: datos.categoria,
          descripcion,
          monto,
          fecha,
          condicionPago,
          proveedorId: proveedor?.id,
          detalles: { create: detalles },
        },
        include: { detalles: true },
      });
      if (credito) {
        await tx.cuentaAdministrativa.create({ data: {
          empresaId, sucursalId, usuarioId, tipo: 'PAGAR', categoria: datos.categoria,
          tercero: `${proveedor!.nombre} (${proveedor!.documento})`, documento: documento!,
          descripcion, monto, saldo: monto, vencimiento: vencimiento!, compraGastoId: compra.id,
        } });
      } else await tx.movimientoFinanciero.create({
        data: {
          empresaId,
          sucursalId,
          usuarioId,
          tipo: 'EGRESO',
          categoria: datos.categoria,
          descripcion,
          monto,
          fecha,
          compraGastoId: compra.id,
        },
      });
      await tx.auditoria.create({
        data: {
          empresaId,
          usuarioId,
          accion: 'CREAR',
          entidad: 'COMPRA_GASTO',
          entidadId: compra.id,
          detalle: {
            categoria: datos.categoria,
            descripcion,
            monto,
            fecha: fecha.toISOString(),
            condicionPago,
            proveedorId: proveedor?.id ?? null,
            documento: documento ?? null,
            productos: detalles.map((detalle) => ({
              productoId: detalle.productoId,
              producto: detalle.productoNombre,
              cantidad: detalle.cantidad,
              unidad: detalle.unidadCompra,
              cantidadInventario: detalle.cantidadInventario,
              subtotal: detalle.subtotal,
            })),
          },
        },
      });
      return compra;
    };
    return transaccion ? operar(transaccion) : this.prisma.$transaction(operar, { timeout: 15000 });
  }

  async listar(empresaId: number, fechaDesde?: string, fechaHasta?: string) {
    const fecha: Prisma.DateTimeFilter = {};
    if (fechaDesde) {
      const desde = new Date(fechaDesde);
      if (Number.isNaN(desde.getTime())) throw new BadRequestException('La fecha inicial no es válida');
      fecha.gte = desde;
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      if (Number.isNaN(hasta.getTime())) throw new BadRequestException('La fecha final no es válida');
      fecha.lte = hasta;
    }
    return this.prisma.compraGasto.findMany({
      where: {
        empresaId,
        ...(fechaDesde || fechaHasta ? { fecha } : {}),
      },
      include: {
        usuario: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        detalles: true,
        proveedor: { select: { nombre: true, documento: true } },
        cuentaAdministrativa: { select: { saldo: true, vencimiento: true } },
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 250,
    });
  }

}
