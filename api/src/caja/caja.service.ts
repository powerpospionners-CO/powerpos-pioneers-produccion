import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class CajaService {
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

  async abrirCaja(datos: any, usuarioId: number, sucursalId: number, empresaId?: number) {
    const sucursal = await this.prisma.sucursal.findFirst({ where: { id: sucursalId, empresaId: empresaId ?? undefined, activo: true } });
    if (!sucursal || !empresaId) throw new BadRequestException('Sucursal no válida para esta empresa');
    const montoInicial = Number(datos?.montoInicial ?? 0);
    const cajeroId = Number(datos?.cajeroId ?? usuarioId);

    if (Number.isNaN(montoInicial) || montoInicial < 0) {
      throw new BadRequestException('El monto base de la caja es inválido');
    }

    const cajero = await this.prisma.usuario.findFirst({
      where: { id: cajeroId, empresaId: empresaId ?? undefined, activo: true },
    });

    if (!cajero) {
      throw new BadRequestException('El cajero seleccionado no existe o no está activo');
    }

    const cajaAbierta = await this.prisma.caja.findFirst({
      where: { sucursalId, estado: 'ABIERTA' },
    });

    if (cajaAbierta) {
      throw new BadRequestException('Ya existe una caja abierta en esta sucursal');
    }

    const caja = await this.prisma.caja.create({
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

    await this.registrarEvento({
      cajaId: caja.id,
      tipo: 'APERTURA',
      descripcion: `Caja abierta por ${caja.usuario.nombre} con monto inicial $${Number(montoInicial).toLocaleString()}`,
      usuarioId: cajeroId,
      esAlerta: false,
    });

    await this.notificaciones.enviarAlerta({
      tipo: 'APERTURA DE CAJA',
      mensaje: `✅ Caja abierta por ${caja.usuario.nombre} con base diaria de $${montoInicial.toLocaleString()} en ${caja.sucursal.nombre}. Esa base no se contabiliza como venta.`,
      empresa: caja.sucursal?.nombre ? caja.sucursal.nombre : 'PowerPOS',
      sucursal: caja.sucursal.nombre,
      empresaId: caja.sucursal?.empresaId ?? empresaId,
    });

    return caja;
  }

  @Cron('*/5 * * * *')
  async cerrarCajaAutomaticaPorHorario() {
    const cajasAbiertas = await this.prisma.caja.findMany({
      where: { estado: 'ABIERTA' },
      include: {
        sucursal: { select: { nombre: true, empresaId: true, empresa: { select: { tipoNegocio: true } } } },
        usuario: { select: { nombre: true } },
        pedidos: { where: { estado: { not: 'ANULADO' } } },
      },
    });

    const ahora = new Date();

    for (const caja of cajasAbiertas) {
      if (caja.sucursal.empresa.tipoNegocio !== 'RESTAURANTE') continue;
      const horario = this.obtenerHorarioTurno(ahora);
      if (!horario.activo) {
        await this.cerrarCaja(caja.id, { montoFinal: this.calcularMontoEsperado(caja) }, caja.usuarioId, true);
      }
    }
  }

  async cerrarCaja(cajaId: number, datos: any, usuarioId: number, automatico = false, empresaId?: number) {
    const caja = await this.prisma.caja.findUnique({
      where: { id: cajaId },
      include: {
        pedidos: true,
        sucursal: { select: { nombre: true, empresaId: true } },
        usuario: { select: { nombre: true } },
      },
    });

    if (!caja || (empresaId && caja.sucursal.empresaId !== empresaId)) throw new NotFoundException('Caja no encontrada');
    if (caja.estado === 'CERRADA') throw new BadRequestException('La caja ya está cerrada');

    const totalVentas = caja.pedidos
      .filter(p => p.estado !== 'ANULADO')
      .reduce((acc, p) => acc + Number(p.total), 0);

    const montoEsperado = Number(caja.montoInicial) + totalVentas;
    const montoFinal = datos?.montoFinal !== undefined && datos.montoFinal !== null && datos.montoFinal !== ''
      ? Number(datos.montoFinal)
      : montoEsperado;
    const diferencia = montoFinal - montoEsperado;

    const cajaActualizada = await this.prisma.caja.update({
      where: { id: cajaId },
      data: {
        estado: 'CERRADA',
        montoFinal,
        diferencia,
        cerradaEn: new Date(),
      },
    });

    const tipoEvento = automatico ? 'CIERRE AUTOMÁTICO' : 'CIERRE';

    await this.registrarEvento({
      cajaId,
      tipo: automatico ? 'CIERRE' : 'CIERRE',
      descripcion: `${automatico ? 'Cierre automático' : 'Caja cerrada'}. Total ventas: $${totalVentas.toLocaleString()}. Diferencia: $${diferencia.toLocaleString()}`,
      usuarioId,
      esAlerta: automatico ? false : false,
    });

    if (Math.abs(diferencia) > 1000) {
      await this.registrarEvento({
        cajaId,
        tipo: 'DIFERENCIA',
        descripcion: `⚠️ Diferencia en cierre de caja: $${diferencia.toLocaleString()}. Esperado: $${montoEsperado.toLocaleString()}, Contado: $${datos.montoFinal}`,
        usuarioId,
        esAlerta: true,
      });

      await this.notificaciones.enviarAlerta({
        tipo: 'DIFERENCIA EN CAJA',
        mensaje: `⚠️ Diferencia de $${diferencia.toLocaleString()} detectada al cerrar caja. Esperado: $${montoEsperado.toLocaleString()}, Contado: $${Number(datos.montoFinal).toLocaleString()}`,
        empresa: caja.sucursal?.nombre || 'PowerPOS',
        sucursal: caja.sucursal.nombre,
        empresaId: caja.sucursal?.empresaId,
      });
    }

    await this.notificaciones.enviarAlerta({
      tipo: automatico ? 'CIERRE AUTOMÁTICO DE CAJA' : 'CIERRE DE CAJA',
      mensaje: `${automatico ? 'Cierre automático' : 'Caja cerrada por ' + caja.usuario.nombre}. Total ventas: $${totalVentas.toLocaleString()}. Monto final: $${montoFinal.toLocaleString()}`,
      empresa: caja.sucursal?.nombre || 'PowerPOS',
      sucursal: caja.sucursal.nombre,
      empresaId: caja.sucursal?.empresaId,
    });

    return { ...cajaActualizada, totalVentas, montoEsperado, diferencia, automatico };
  }

  private calcularMontoEsperado(caja: any) {
    const totalVentas = caja.pedidos
      .filter((p: any) => p.estado !== 'ANULADO')
      .reduce((acc: number, p: any) => acc + Number(p.total), 0);
    return Number(caja.montoInicial) + totalVentas;
  }

  private obtenerHorarioTurno(fecha: Date) {
    const dia = fecha.getDay();
    const hora = fecha.getHours();
    const minutos = fecha.getMinutes();
    const tiempo = hora * 60 + minutos;

    const esLaboral = dia >= 1 && dia <= 5;
    const inicio = esLaboral ? 15 * 60 : 12 * 60;
    const fin = 22 * 60;

    return {
      activo: tiempo >= inicio && tiempo < fin,
      inicio,
      fin,
    };
  }

  async obtenerCajaAbierta(sucursalId: number, empresaId: number) {
    if (!sucursalId || !empresaId) throw new BadRequestException('Sucursal no válida');
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

    const totalVentas = caja.pedidos.reduce((acc, p) => acc + Number(p.total), 0);
    const totalEsperado = Number(caja.montoInicial) + totalVentas;

    return { ...caja, totalVentas, totalEsperado };
  }

  async registrarAperturaIrregular(cajaId: number, usuarioId: number, descripcion: string, empresaId: number) {
    const cajaPropia = await this.prisma.caja.findFirst({ where: { id: cajaId, sucursal: { empresaId } } });
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
