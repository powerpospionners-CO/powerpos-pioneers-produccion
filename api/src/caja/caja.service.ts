import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { bloquearCajaSucursal } from './caja-lock';

@Injectable()
export class CajaService {
  private readonly logger = new Logger(CajaService.name);
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

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
        pedidos: { where: { estado: { not: 'ANULADO' } } },
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
          pedidos: true,
          sucursal: { select: { nombre: true, empresaId: true } },
          usuario: { select: { nombre: true } },
        },
      });

      if (!caja || (empresaId && caja.sucursal.empresaId !== empresaId))
        throw new NotFoundException('Caja no encontrada');
      if (caja.estado === 'CERRADA')
        throw new BadRequestException('La caja ya está cerrada');

      const totalVentas = caja.pedidos
        .filter((p) => p.estado !== 'ANULADO')
        .reduce((acc, p) => acc + Number(p.total), 0);

      const montoEsperado = this.calcularMontoEsperado(caja);
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
          descripcion: `${automatico ? 'Cierre automático' : 'Caja cerrada'}. Total ventas: $${totalVentas.toLocaleString()}. Diferencia: $${diferencia.toLocaleString()}`,
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
        montoEsperado,
        montoFinal,
        diferencia,
      };
    });
    const {
      caja,
      cajaActualizada,
      totalVentas,
      montoEsperado,
      montoFinal,
      diferencia,
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

    return {
      ...cajaActualizada,
      totalVentas,
      montoEsperado,
      diferencia,
      automatico,
    };
  }

  private calcularMontoEsperado(caja: any) {
    const totalVentas = caja.pedidos
      .filter((p: any) => p.estado !== 'ANULADO' && p.metodoPago === 'EFECTIVO')
      .reduce((acc: number, p: any) => acc + Number(p.total), 0);
    return Number(caja.montoInicial) + totalVentas;
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
          select: { total: true, metodoPago: true },
        },
      },
    });

    if (!caja) return null;

    const totalVentas = caja.pedidos.reduce(
      (acc, p) => acc + Number(p.total),
      0,
    );
    const totalEsperado = this.calcularMontoEsperado(caja);

    return { ...caja, totalVentas, totalEsperado };
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
