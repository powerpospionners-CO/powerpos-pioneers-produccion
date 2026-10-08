import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ImpresionService } from '../impresion/impresion.service';
import { bloquearCajaSucursal } from './caja-lock';

@Injectable()
export class CajaService {
  private readonly logger = new Logger(CajaService.name);
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
    private impresion: ImpresionService,
  ) {}

  // Reparte el total de cada venta entre sus medios de pago reales (tabla
  // `pagos`); las ventas anteriores a los pagos mixtos no tienen filas ahí,
  // así que usan `metodoPago` de respaldo para no perder ese histórico.
  private desglosePorMetodo(pedidos: { total: any; metodoPago: string; pagos?: { metodoPago: string; monto: any }[] }[]) {
    const mapa = new Map<string, number>();
    for (const p of pedidos) {
      if (p.pagos && p.pagos.length > 0) {
        for (const pago of p.pagos) mapa.set(pago.metodoPago, (mapa.get(pago.metodoPago) || 0) + Number(pago.monto));
      } else {
        mapa.set(p.metodoPago, (mapa.get(p.metodoPago) || 0) + Number(p.total));
      }
    }
    return Array.from(mapa.entries()).map(([metodo, total]) => ({ metodo, total }));
  }

  // El dinero que debe contarse físicamente en la caja es solo lo pagado en
  // efectivo (tarjeta/transferencia/Nequi/Daviplata no entra a la gaveta).
  private sumarEfectivo(pedidos: { total: any; metodoPago: string; pagos?: { metodoPago: string; monto: any }[] }[]) {
    return this.desglosePorMetodo(pedidos).find((d) => d.metodo === 'EFECTIVO')?.total || 0;
  }

  // Agrupa por nombre de producto para el resumen/tirilla de cierre. No usa
  // el id del producto porque, para el reporte, dos ventas del mismo nombre
  // deben sumarse aunque el producto se haya editado entre una y otra.
  private productosVendidos(pedidos: { detalles?: { cantidad: number; subtotal: any; producto?: { nombre: string } | null }[] }[]) {
    const mapa = new Map<string, { cantidad: number; total: number }>();
    for (const p of pedidos) {
      for (const d of p.detalles || []) {
        const nombre = d.producto?.nombre || 'Producto';
        const actual = mapa.get(nombre) || { cantidad: 0, total: 0 };
        actual.cantidad += d.cantidad;
        actual.total += Number(d.subtotal);
        mapa.set(nombre, actual);
      }
    }
    return Array.from(mapa.entries())
      .map(([nombre, v]) => ({ nombre, cantidad: v.cantidad, total: v.total }))
      .sort((a, b) => b.total - a.total);
  }

  async abrirCaja(
    datos: any,
    usuarioId: number,
    sucursalId: number,
    empresaId?: number,
  ) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        empresaId: empresaId ?? undefined,
        activo: true,
      },
    });
    if (!sucursal || !empresaId)
      throw new BadRequestException('Sucursal no válida para esta empresa');
    const montoInicial = Number(datos?.montoInicial ?? 0);
    const cajeroId = Number(datos?.cajeroId ?? usuarioId);

    if (!Number.isFinite(montoInicial) || montoInicial < 0) {
      throw new BadRequestException('El monto base de la caja es inválido');
    }

    const cajero = await this.prisma.usuario.findFirst({
      where: { id: cajeroId, empresaId: empresaId ?? undefined, activo: true },
    });

    if (!cajero) {
      throw new BadRequestException(
        'El cajero seleccionado no existe o no está activo',
      );
    }

    const caja = await this.prisma.$transaction(async (tx) => {
      await bloquearCajaSucursal(tx, sucursalId);
      const cajaAbierta = await tx.caja.findFirst({
        where: { sucursalId, estado: 'ABIERTA' },
      });

      if (cajaAbierta) {
        throw new BadRequestException(
          'Ya existe una caja abierta en esta sucursal',
        );
      }

      const caja = await tx.caja.create({
        data: {
          sucursalId,
          usuarioId: cajeroId,
          montoInicial,
          estado: 'ABIERTA',
        },
        include: {
          usuario: { select: { nombre: true } },
          sucursal: { select: { nombre: true, empresaId: true } },
        },
      });

      await tx.eventoCaja.create({
        data: {
          cajaId: caja.id,
          tipo: 'APERTURA',
          descripcion: `Caja abierta por ${caja.usuario.nombre} con monto inicial $${Number(montoInicial).toLocaleString()}`,
          usuarioId: cajeroId,
          esAlerta: false,
        },
      });
      return caja;
    });

    void this.notificaciones
      .enviarAlerta({
        tipo: 'APERTURA DE CAJA',
        mensaje: `✅ Caja abierta por ${caja.usuario.nombre} con base diaria de $${montoInicial.toLocaleString()} en ${caja.sucursal.nombre}. Esa base no se contabiliza como venta.`,
        empresa: caja.sucursal?.nombre ? caja.sucursal.nombre : 'PowerPOS',
        sucursal: caja.sucursal.nombre,
        empresaId: caja.sucursal?.empresaId ?? empresaId,
      })
      .catch(() =>
        this.logger.warn('No se pudo notificar la apertura de caja'),
      );

    return caja;
  }

  @Cron('*/5 * * * *')
  async cerrarCajaAutomaticaPorHorario() {
    // Sin una configuración explícita por empresa no se cierran cajas.
    // JSON: { "empresaId": { "hora": "22:00", "zonaHoraria": "America/Bogota" } }
    let horarios: Record<string, { hora: string; zonaHoraria: string }>;
    try {
      horarios = JSON.parse(process.env.CIERRES_CAJA_POR_EMPRESA || '{}');
    } catch {
      this.logger.error('CIERRES_CAJA_POR_EMPRESA no es JSON válido');
      return;
    }
    if (!horarios || typeof horarios !== 'object') return;
    if (!Object.keys(horarios).length) return;
    const cajasAbiertas = await this.prisma.caja.findMany({
      where: { estado: 'ABIERTA' },
      include: {
        sucursal: {
          select: {
            nombre: true,
            empresaId: true,
            empresa: { select: { tipoNegocio: true } },
          },
        },
        usuario: { select: { nombre: true } },
        pedidos: { where: { estado: { not: 'ANULADO' } }, include: { pagos: true } },
      },
    });

    const ahora = new Date();

    for (const caja of cajasAbiertas) {
      if (caja.sucursal.empresa.tipoNegocio !== 'RESTAURANTE') continue;
      const config = horarios[String(caja.sucursal.empresaId)];
      if (!config || !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.hora)) continue;
      try {
        const reloj = new Intl.DateTimeFormat('en-CA', {
          timeZone: config.zonaHoraria || 'America/Bogota',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        });
        const local = (fecha: Date) => {
          const partes = Object.fromEntries(
            reloj.formatToParts(fecha).map((p) => [p.type, p.value]),
          );
          return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}`;
        };
        const cierre = `${local(ahora).slice(0, 10)} ${config.hora}`;
        if (local(ahora) >= cierre && local(caja.abiertaEn) < cierre) {
          await this.cerrarCaja(
            caja.id,
            {},
            caja.usuarioId,
            true,
            caja.sucursal.empresaId,
          );
        }
      } catch {
        this.logger.warn(
          `No se pudo cerrar automáticamente la caja ${caja.id}`,
        );
      }
    }
  }

  async cerrarCaja(
    cajaId: number,
    datos: any,
    usuarioId: number,
    automatico = false,
    empresaId?: number,
  ) {
    const referencia = await this.prisma.caja.findUnique({
      where: { id: cajaId },
      select: { sucursalId: true, sucursal: { select: { empresaId: true } } },
    });
    if (
      !referencia ||
      !empresaId ||
      referencia.sucursal.empresaId !== empresaId
    )
      throw new NotFoundException('Caja no encontrada');
    const resultado = await this.prisma.$transaction(async (tx) => {
      await bloquearCajaSucursal(tx, referencia.sucursalId);
      const caja = await tx.caja.findUnique({
        where: { id: cajaId },
        include: {
          pedidos: { include: { pagos: true, detalles: { include: { producto: { select: { nombre: true } } } } } },
          sucursal: { select: { nombre: true, empresaId: true } },
          usuario: { select: { nombre: true } },
        },
      });

      if (!caja || (empresaId && caja.sucursal.empresaId !== empresaId))
        throw new NotFoundException('Caja no encontrada');
      if (caja.estado === 'CERRADA')
        throw new BadRequestException('La caja ya está cerrada');

      const pedidosValidos = caja.pedidos.filter((p) => p.estado !== 'ANULADO');
      const totalVentas = pedidosValidos.reduce((acc, p) => acc + Number(p.total), 0);
      const ventasPorMetodoPago = this.desglosePorMetodo(pedidosValidos);
      const totalEfectivo = ventasPorMetodoPago.find((d) => d.metodo === 'EFECTIVO')?.total || 0;
      const productosVendidos = this.productosVendidos(pedidosValidos);

      const montoEsperado = Number(caja.montoInicial) + totalEfectivo;
      const montoFinal =
        datos?.montoFinal !== undefined &&
        datos.montoFinal !== null &&
        datos.montoFinal !== ''
          ? Number(datos.montoFinal)
          : montoEsperado;
      const diferencia = montoFinal - montoEsperado;
      if (!Number.isFinite(montoFinal) || montoFinal < 0)
        throw new BadRequestException('El monto contado es inválido');

      const cajaActualizada = await tx.caja.update({
        where: { id: cajaId },
        data: {
          estado: 'CERRADA',
          montoFinal,
          diferencia,
          cerradaEn: new Date(),
        },
      });

      await tx.eventoCaja.create({
        data: {
          cajaId,
          tipo: automatico ? 'CIERRE' : 'CIERRE',
          descripcion: `${automatico ? 'Cierre automático' : 'Caja cerrada'}. Total ventas: $${totalVentas.toLocaleString()} (efectivo: $${totalEfectivo.toLocaleString()}). Diferencia: $${diferencia.toLocaleString()}`,
          usuarioId,
          esAlerta: automatico ? false : false,
        },
      });

      if (Math.abs(diferencia) > 1000) {
        await tx.eventoCaja.create({
          data: {
            cajaId,
            tipo: 'DIFERENCIA',
            descripcion: `⚠️ Diferencia en cierre de caja: $${diferencia.toLocaleString()}. Esperado: $${montoEsperado.toLocaleString()}, Contado: $${datos.montoFinal}`,
            usuarioId,
            esAlerta: true,
          },
        });
      }
      return {
        caja,
        cajaActualizada,
        totalVentas,
        totalEfectivo,
        montoEsperado,
        montoFinal,
        diferencia,
        ventasPorMetodoPago,
        productosVendidos,
        cantidadVentas: pedidosValidos.length,
      };
    });
    const {
      caja,
      cajaActualizada,
      totalVentas,
      totalEfectivo,
      montoEsperado,
      montoFinal,
      diferencia,
      ventasPorMetodoPago,
      productosVendidos,
      cantidadVentas,
    } = resultado;
    if (Math.abs(diferencia) > 1000) {
      void this.notificaciones
        .enviarAlerta({
          tipo: 'DIFERENCIA EN CAJA',
          mensaje: `⚠️ Diferencia de $${diferencia.toLocaleString()} detectada al cerrar caja. Esperado: $${montoEsperado.toLocaleString()}, Contado: $${Number(datos.montoFinal).toLocaleString()}`,
          empresa: caja.sucursal?.nombre || 'PowerPOS',
          sucursal: caja.sucursal.nombre,
          empresaId: caja.sucursal?.empresaId,
        })
        .catch(() =>
          this.logger.warn('No se pudo notificar la diferencia de caja'),
        );
    }

    void this.notificaciones
      .enviarAlerta({
        tipo: automatico ? 'CIERRE AUTOMÁTICO DE CAJA' : 'CIERRE DE CAJA',
        mensaje: `${automatico ? 'Cierre automático' : 'Caja cerrada por ' + caja.usuario.nombre}. Total ventas: $${totalVentas.toLocaleString()}. Monto final: $${montoFinal.toLocaleString()}`,
        empresa: caja.sucursal?.nombre || 'PowerPOS',
        sucursal: caja.sucursal.nombre,
        empresaId: caja.sucursal?.empresaId,
      })
      .catch(() => this.logger.warn('No se pudo notificar el cierre de caja'));

    // Tirilla de cierre: efecto secundario, no debe bloquear ni hacer
    // fallar el cierre si no hay agente/impresora disponible en este momento.
    void this.impresion
      .imprimirCierreCaja(
        {
          cajeroNombre: caja.usuario.nombre,
          sucursalNombre: caja.sucursal.nombre,
          abiertaEn: caja.abiertaEn,
          cerradaEn: cajaActualizada.cerradaEn,
          montoInicial: caja.montoInicial,
          montoFinal,
          montoEsperado,
          diferencia,
          totalVentas,
          cantidadVentas,
          ventasPorMetodoPago,
          productosVendidos,
        },
        empresaId!,
      )
      .catch(() => this.logger.warn('No se pudo imprimir el cierre de caja'));

    return {
      ...cajaActualizada,
      totalVentas,
      totalEfectivo,
      montoEsperado,
      diferencia,
      ventasPorMetodoPago,
      productosVendidos,
      cantidadVentas,
      automatico,
    };
  }

  async obtenerCajaAbierta(sucursalId: number, empresaId: number) {
    if (!sucursalId || !empresaId)
      throw new BadRequestException('Sucursal no válida');
    const caja = await this.prisma.caja.findFirst({
      where: { sucursalId, sucursal: { empresaId }, estado: 'ABIERTA' },
      include: {
        usuario: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        pedidos: {
          where: { estado: { not: 'ANULADO' } },
          select: { total: true, metodoPago: true, estado: true, pagos: { select: { metodoPago: true, monto: true } } },
        },
      },
    });

    if (!caja) return null;

    // El `where` de arriba ya excluye anuladas; se vuelve a filtrar aquí
    // por seguridad (defensivo, igual que en cerrarCaja).
    const pedidosValidos = caja.pedidos.filter((p) => p.estado !== 'ANULADO');
    const totalVentas = pedidosValidos.reduce(
      (acc, p) => acc + Number(p.total),
      0,
    );
    const totalEfectivo = this.sumarEfectivo(pedidosValidos);
    const totalEsperado = Number(caja.montoInicial) + totalEfectivo;

    return { ...caja, totalVentas, totalEfectivo, totalEsperado };
  }

  // Lista de cajas ya cerradas, para que el admin elija cuál revisar en
  // detalle (ver obtenerResumenCaja). Más reciente primero.
  async listarCajasCerradas(empresaId: number, sucursalId?: number) {
    return this.prisma.caja.findMany({
      where: {
        sucursal: { empresaId, ...(sucursalId ? { id: sucursalId } : {}) },
        estado: 'CERRADA',
      },
      include: {
        usuario: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
      },
      orderBy: { cerradaEn: 'desc' },
      take: 90,
    });
  }

  // Detalle completo de una caja (abierta o cerrada): lo que vendió, en qué
  // medios de pago, y los productos — la misma información que trae la
  // tirilla de cierre, pero para verla en pantalla en cualquier momento.
  async obtenerResumenCaja(cajaId: number, empresaId: number) {
    const caja = await this.prisma.caja.findFirst({
      where: { id: cajaId, sucursal: { empresaId } },
      include: {
        usuario: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        pedidos: {
          where: { estado: { not: 'ANULADO' } },
          include: { pagos: true, detalles: { include: { producto: { select: { nombre: true } } } } },
        },
      },
    });
    if (!caja) throw new NotFoundException('Caja no encontrada');

    const totalVentas = caja.pedidos.reduce((acc, p) => acc + Number(p.total), 0);
    const ventasPorMetodoPago = this.desglosePorMetodo(caja.pedidos);
    const totalEfectivo = ventasPorMetodoPago.find((d) => d.metodo === 'EFECTIVO')?.total || 0;
    const montoEsperado = Number(caja.montoInicial) + totalEfectivo;

    return {
      id: caja.id,
      estado: caja.estado,
      cajeroNombre: caja.usuario.nombre,
      sucursalNombre: caja.sucursal.nombre,
      abiertaEn: caja.abiertaEn,
      cerradaEn: caja.cerradaEn,
      montoInicial: Number(caja.montoInicial),
      montoFinal: caja.montoFinal !== null ? Number(caja.montoFinal) : null,
      diferencia: caja.diferencia !== null ? Number(caja.diferencia) : null,
      montoEsperado,
      totalVentas,
      cantidadVentas: caja.pedidos.length,
      ventasPorMetodoPago,
      productosVendidos: this.productosVendidos(caja.pedidos),
    };
  }

  // Reintenta mandar la tirilla de cierre a la impresora (ej. porque falló
  // en el momento del cierre). Usa el mismo resumen que ya se calcula para
  // la pantalla de detalle, así que siempre coincide con lo que se ve ahí.
  async reimprimirCierre(cajaId: number, empresaId: number) {
    const resumen = await this.obtenerResumenCaja(cajaId, empresaId);
    if (resumen.estado !== 'CERRADA') {
      throw new BadRequestException('Esta caja todavía no se ha cerrado');
    }
    return this.impresion.imprimirCierreCaja(resumen, empresaId);
  }

  // Autoservicio para el cajero: reimprime su propio último cierre, sin
  // necesitar al admin ni acceso al historial completo (que sí muestra los
  // cierres de todos los cajeros). Solo busca entre sus propias cajas.
  async reimprimirMiUltimoCierre(usuarioId: number, empresaId: number) {
    const caja = await this.prisma.caja.findFirst({
      where: { usuarioId, estado: 'CERRADA', sucursal: { empresaId } },
      orderBy: { cerradaEn: 'desc' },
      select: { id: true },
    });
    if (!caja) throw new NotFoundException('No se encontró ningún cierre tuyo para reimprimir');
    return this.reimprimirCierre(caja.id, empresaId);
  }

  // Corrige el conteo de una caja YA cerrada (ej. el cajero contó mal o
  // marcó $0 sin contar). Solo admin/gerente, y siempre queda un evento en
  // el historial con el motivo y el valor anterior para no perder el rastro.
  async corregirCierre(
    cajaId: number,
    montoFinalNuevo: any,
    motivo: string,
    usuarioId: number,
    empresaId: number,
  ) {
    const monto = Number(montoFinalNuevo);
    if (!Number.isFinite(monto) || monto < 0)
      throw new BadRequestException('El monto contado es inválido');
    if (!motivo || !motivo.trim())
      throw new BadRequestException('Escribe el motivo de la corrección');

    const caja = await this.prisma.caja.findFirst({
      where: { id: cajaId, sucursal: { empresaId } },
      include: {
        pedidos: { where: { estado: { not: 'ANULADO' } }, include: { pagos: true } },
        sucursal: { select: { nombre: true, empresaId: true } },
      },
    });
    if (!caja) throw new NotFoundException('Caja no encontrada');
    if (caja.estado !== 'CERRADA')
      throw new BadRequestException('Solo se puede corregir una caja ya cerrada');

    // El `where` de arriba ya excluye anuladas; se vuelve a filtrar aquí por
    // seguridad (defensivo, igual que en cerrarCaja/obtenerCajaAbierta).
    const pedidosValidos = caja.pedidos.filter((p) => p.estado !== 'ANULADO');
    const totalEfectivo = this.sumarEfectivo(pedidosValidos);
    const montoEsperado = Number(caja.montoInicial) + totalEfectivo;
    const montoAnterior = caja.montoFinal !== null ? Number(caja.montoFinal) : null;
    const diferencia = monto - montoEsperado;

    const actualizada = await this.prisma.caja.update({
      where: { id: cajaId },
      data: { montoFinal: monto, diferencia },
    });

    await this.registrarEvento({
      cajaId,
      tipo: 'CORRECCION',
      descripcion: `Corrección de cierre: contado pasó de ${montoAnterior !== null ? `$${montoAnterior.toLocaleString()}` : 'sin dato'} a $${monto.toLocaleString()}. Motivo: ${motivo.trim()}`,
      usuarioId,
      esAlerta: Math.abs(diferencia) > 1000,
    });

    return { ...actualizada, montoEsperado, diferencia };
  }

  async registrarAperturaIrregular(
    cajaId: number,
    usuarioId: number,
    descripcion: string,
    empresaId: number,
  ) {
    const cajaPropia = await this.prisma.caja.findFirst({
      where: { id: cajaId, sucursal: { empresaId } },
    });
    if (!cajaPropia) throw new NotFoundException('Caja no encontrada');
    await this.registrarEvento({
      cajaId,
      tipo: 'APERTURA_IRREGULAR',
      descripcion: `🚨 ALERTA: ${descripcion}`,
      usuarioId,
      esAlerta: true,
    });

    const caja = await this.prisma.caja.findUnique({
      where: { id: cajaId },
      include: { sucursal: { select: { nombre: true } } },
    });

    await this.notificaciones.enviarAlerta({
      tipo: 'APERTURA IRREGULAR DE CAJA',
      mensaje: `🚨 ${descripcion}`,
      empresa: 'PowerPOS',
      sucursal: caja?.sucursal.nombre || 'Desconocida',
    });
  }

  async obtenerEventos(sucursalId: number, empresaId: number) {
    return this.prisma.eventoCaja.findMany({
      where: { caja: { sucursalId, sucursal: { empresaId } } },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: 50,
    });
  }

  async obtenerAlertas(sucursalId: number, empresaId: number) {
    return this.prisma.eventoCaja.findMany({
      where: { caja: { sucursalId, sucursal: { empresaId } }, esAlerta: true },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: 20,
    });
  }

  private async registrarEvento(datos: any) {
    return this.prisma.eventoCaja.create({
      data: {
        cajaId: datos.cajaId,
        tipo: datos.tipo,
        descripcion: datos.descripcion,
        usuarioId: datos.usuarioId,
        esAlerta: datos.esAlerta || false,
      },
    });
  }
}
