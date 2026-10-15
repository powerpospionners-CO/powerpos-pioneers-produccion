import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { EstadoPagoPlan, PeriodicidadPlan, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sumarMeses } from './fechas';

const CONFIG_ID = 1;
type EventoWompi = {
  data?: { transaction?: { id?: string; reference?: string } };
  signature?: { checksum?: string; properties?: string[] };
  timestamp?: number;
};

function valorRuta(objeto: unknown, ruta: string): string {
  const valor = ruta.split('.').reduce<unknown>((actual, segmento) => {
    if (!actual || typeof actual !== 'object') return undefined;
    return (actual as Record<string, unknown>)[segmento];
  }, objeto);
  return valor === undefined || valor === null ? '' : String(valor);
}

@Injectable()
export class PlanesService {
  constructor(private readonly prisma: PrismaService) {}

  private async configuracion() {
    return this.prisma.configuracionPlanes.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID },
      update: {},
    });
  }

  private precios(configuracion: Awaited<ReturnType<PlanesService['configuracion']>>) {
    const mensual = {
      BASICO: configuracion.inicialMensual,
      MEDIUM: configuracion.mediumMensual,
      PREMIUM: configuracion.premiumMensual,
    };
    const descuento = Math.min(2, Math.max(0, configuracion.descuentoAnualMeses));
    return {
      soporteMensual: configuracion.soporteMensual,
      descuentoAnualMeses: descuento,
      planes: Object.entries(mensual).map(([plan, precioMensual]) => ({
        plan,
        nombre: plan === 'BASICO' ? 'Inicial' : plan === 'MEDIUM' ? 'Medium' : 'Premium',
        mensual: precioMensual,
        anual: precioMensual * (12 - descuento),
      })),
    };
  }

  async obtenerPrecios() {
    return this.precios(await this.configuracion());
  }

  async actualizarPrecios(datos: {
    inicialMensual?: number;
    mediumMensual?: number;
    premiumMensual?: number;
    soporteMensual?: number;
    descuentoAnualMeses?: number;
  }, usuarioId: number) {
    for (const [nombre, valor] of Object.entries(datos)) {
      if (valor === undefined) continue;
      if (!Number.isInteger(valor) || valor < 0 || (nombre === 'descuentoAnualMeses' && valor > 2)) {
        throw new BadRequestException(`${nombre} debe ser un entero válido`);
      }
    }
    const actualizada = await this.prisma.configuracionPlanes.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, ...datos },
      update: datos,
    });
    await this.prisma.auditoria.create({
      data: {
        accion: 'CONFIGURAR',
        entidad: 'PLANES',
        entidadId: CONFIG_ID,
        usuarioId,
        detalle: datos as Prisma.InputJsonValue,
      },
    });
    return this.precios(actualizada);
  }

  async estado(empresaId: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        id: true, nombre: true, email: true, plan: true, suscripcionVenceEn: true,
        pagoExonerado: true, motivoExoneracion: true, soporteIncluidoHasta: true,
        soportePagadoHasta: true,
      },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const pagos = await this.prisma.pagoPlan.findMany({
      where: { empresaId },
      orderBy: { creadoEn: 'desc' },
      take: 20,
      select: { plan: true, periodicidad: true, monto: true, estado: true, referencia: true, incluyeSoporte: true, creadoEn: true, pagadoEn: true },
    });
    return {
      ...empresa,
      accesoExento: empresa.pagoExonerado || !empresa.suscripcionVenceEn ||
        Date.now() <= empresa.suscripcionVenceEn.getTime() + 5 * 86400000,
      precios: await this.obtenerPrecios(),
      pagos,
    };
  }

  async actualizarEmpresa(empresaId: number, datos: {
    pagoExonerado?: boolean;
    motivoExoneracion?: string | null;
    suscripcionVenceEn?: string | null;
    soporteIncluidoHasta?: string | null;
    soportePagadoHasta?: string | null;
  }, usuarioId: number) {
    if (datos.pagoExonerado !== undefined && typeof datos.pagoExonerado !== 'boolean') {
      throw new BadRequestException('La exoneración debe ser verdadera o falsa');
    }
    const parsearFecha = (fecha: string | null | undefined, nombre: string) => {
      if (fecha === undefined || fecha === null || fecha === '') return fecha === undefined ? undefined : null;
      const resultado = new Date(fecha);
      if (Number.isNaN(resultado.getTime())) throw new BadRequestException(`${nombre} no es una fecha válida`);
      return resultado;
    };
    const data: Prisma.EmpresaUpdateInput = {
      ...(datos.pagoExonerado !== undefined ? { pagoExonerado: datos.pagoExonerado } : {}),
      ...(datos.motivoExoneracion !== undefined ? { motivoExoneracion: datos.motivoExoneracion?.trim() || null } : {}),
      ...(datos.suscripcionVenceEn !== undefined ? { suscripcionVenceEn: parsearFecha(datos.suscripcionVenceEn, 'El vencimiento') } : {}),
      ...(datos.soporteIncluidoHasta !== undefined ? { soporteIncluidoHasta: parsearFecha(datos.soporteIncluidoHasta, 'El soporte incluido') } : {}),
      ...(datos.soportePagadoHasta !== undefined ? { soportePagadoHasta: parsearFecha(datos.soportePagadoHasta, 'El soporte pagado') } : {}),
    };
    const empresa = await this.prisma.empresa.update({
      where: { id: empresaId },
      data,
      select: { id: true, nombre: true, plan: true, pagoExonerado: true, motivoExoneracion: true, suscripcionVenceEn: true, soporteIncluidoHasta: true, soportePagadoHasta: true },
    });
    await this.prisma.auditoria.create({
      data: {
        accion: 'CONFIGURAR',
        entidad: 'SUSCRIPCION',
        entidadId: empresaId,
        usuarioId,
        detalle: datos as Prisma.InputJsonValue,
      },
    });
    return empresa;
  }

  async crearCheckout(empresaId: number, email: string, periodicidad: PeriodicidadPlan, incluyeSoporte: boolean) {
    const publicKey = process.env.WOMPI_PUBLIC_KEY;
    const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
    if (!publicKey || !integritySecret) {
      throw new ServiceUnavailableException('Wompi todavía no está configurado en el servidor');
    }
    if (!Object.values(PeriodicidadPlan).includes(periodicidad)) {
      throw new BadRequestException('La periodicidad seleccionada no es válida');
    }
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, nombre: true, plan: true, pagoExonerado: true, suscripcionVenceEn: true, soporteIncluidoHasta: true, soportePagadoHasta: true },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const configuracion = await this.configuracion();
    const precios = this.precios(configuracion);
    const planPrecio = precios.planes.find((item) => item.plan === empresa.plan);
    if (!planPrecio) throw new BadRequestException('El plan de la empresa no es válido');
    const incluirPlan = !empresa.pagoExonerado;
    if (!incluirPlan && !incluyeSoporte) {
      throw new BadRequestException('La empresa está exonerada del plan; no hay un cobro pendiente');
    }
    const ahora = new Date();
    const montoPlan = incluirPlan ? periodicidad === 'ANUAL' ? planPrecio.anual : planPrecio.mensual : 0;
    const montoSoporte = incluyeSoporte ? configuracion.soporteMensual : 0;
    const monto = montoPlan + montoSoporte;
    if (monto <= 0) throw new BadRequestException('El valor del cobro debe ser mayor que cero');
    const vence = empresa.suscripcionVenceEn;
    const periodoDesde = incluirPlan && vence && vence > ahora ? vence : ahora;
    const periodoHasta = incluirPlan ? sumarMeses(periodoDesde, periodicidad === 'ANUAL' ? 12 : 1) : periodoDesde;
    const soporteActual = [empresa.soporteIncluidoHasta, empresa.soportePagadoHasta]
      .filter((fecha): fecha is Date => !!fecha && fecha > ahora)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const soporteDesde = soporteActual || ahora;
    const soporteHasta = incluyeSoporte ? sumarMeses(soporteDesde, 1) : null;
    const referencia = `PP-${empresa.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const pago = await this.prisma.pagoPlan.create({
      data: {
        empresaId,
        plan: empresa.plan,
        periodicidad,
        monto,
        referencia,
        incluyePlan: incluirPlan,
        incluyeSoporte,
        periodoDesde,
        periodoHasta,
        soporteDesde: incluyeSoporte ? soporteDesde : null,
        soporteHasta,
      },
    });
    const montoEnCentavos = pago.monto * 100;
    const moneda = 'COP';
    const firma = createHash('sha256')
      .update(`${referencia}${montoEnCentavos}${moneda}${integritySecret}`)
      .digest('hex');
    return {
      publicKey,
      currency: moneda,
      amountInCents: montoEnCentavos,
      reference: referencia,
      signature: { integrity: firma },
      redirectUrl: `${process.env.WEB_URL || ''}/suscripcion?resultado=retorno`,
      email,
      companyName: empresa.nombre,
      plan: empresa.plan,
      periodicidad,
      incluyeSoporte,
      monto,
    };
  }

  private firmaEventoValida(evento: EventoWompi) {
    const secreto = process.env.WOMPI_EVENTS_SECRET;
    const checksum = evento.signature?.checksum;
    const propiedades = evento.signature?.properties;
    const timestamp = evento.timestamp;
    if (!secreto || !checksum || !Array.isArray(propiedades) || !Number.isFinite(timestamp)) return false;
    const material = `${propiedades.map((ruta) => valorRuta(evento, ruta)).join('')}${timestamp}${secreto}`;
    const esperado = createHash('sha256').update(material).digest('hex');
    const recibido = Buffer.from(checksum, 'hex');
    const calculado = Buffer.from(esperado, 'hex');
    return recibido.length === calculado.length && timingSafeEqual(recibido, calculado);
  }

  async procesarEventoWompi(evento: EventoWompi) {
    if (!this.firmaEventoValida(evento)) throw new UnauthorizedException('Firma de evento Wompi inválida');
    const transactionId = evento.data?.transaction?.id;
    if (!transactionId) throw new BadRequestException('El evento no contiene una transacción');
    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) throw new ServiceUnavailableException('Wompi no está configurado en el servidor');
    const baseUrl = process.env.WOMPI_ENVIRONMENT === 'production'
      ? 'https://production.wompi.co/v1'
      : 'https://sandbox.wompi.co/v1';
    const respuesta = await fetch(`${baseUrl}/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${privateKey}` },
    });
    if (!respuesta.ok) throw new ServiceUnavailableException('No se pudo verificar la transacción con Wompi');
    const cuerpo = await respuesta.json() as { data?: { id?: string; reference?: string; status?: string; amount_in_cents?: number; currency?: string } };
    const transaccion = cuerpo.data;
    if (!transaccion?.id || !transaccion.reference) throw new BadRequestException('Wompi devolvió una transacción incompleta');
    const pago = await this.prisma.pagoPlan.findUnique({ where: { referencia: transaccion.reference } });
    if (!pago) throw new NotFoundException('No se encontró el cobro de PowerPOS para esta referencia');
    if (transaccion.amount_in_cents !== pago.monto * 100 || transaccion.currency !== 'COP') {
      throw new BadRequestException('El valor de la transacción no coincide con el cobro pendiente');
    }
    if (pago.estado === EstadoPagoPlan.APROBADO) return { recibido: true, yaProcesado: true };
    if (transaccion.status !== 'APPROVED') {
      if (transaccion.status === 'DECLINED' || transaccion.status === 'VOIDED' || transaccion.status === 'ERROR') {
        await this.prisma.pagoPlan.update({
          where: { id: pago.id },
          data: { estado: EstadoPagoPlan.RECHAZADO, transaccionId: transaccion.id },
        });
      }
      return { recibido: true, estado: transaccion.status };
    }
    const pagadoEn = new Date();
    await this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.pagoPlan.updateMany({
        where: { id: pago.id, estado: EstadoPagoPlan.PENDIENTE },
        data: { estado: EstadoPagoPlan.APROBADO, transaccionId: transaccion.id, pagadoEn },
      });
      if (!actualizado.count) return;
      const empresa = await tx.empresa.findUnique({
        where: { id: pago.empresaId },
        select: { suscripcionVenceEn: true, soporteIncluidoHasta: true, soportePagadoHasta: true },
      });
      if (!empresa) throw new NotFoundException('Empresa asociada al cobro no encontrada');
      const periodoDesde = pago.incluyePlan && empresa.suscripcionVenceEn && empresa.suscripcionVenceEn > pagadoEn
        ? empresa.suscripcionVenceEn
        : pagadoEn;
      const periodoHasta = pago.incluyePlan
        ? sumarMeses(periodoDesde, pago.periodicidad === 'ANUAL' ? 12 : 1)
        : periodoDesde;
      const soporteActual = [empresa.soporteIncluidoHasta, empresa.soportePagadoHasta]
        .filter((fecha): fecha is Date => !!fecha && fecha > pagadoEn)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const soporteDesde = soporteActual || pagadoEn;
      const soporteHasta = pago.incluyeSoporte ? sumarMeses(soporteDesde, 1) : null;
      await tx.pagoPlan.update({
        where: { id: pago.id },
        data: {
          periodoDesde,
          periodoHasta,
          soporteDesde: pago.incluyeSoporte ? soporteDesde : null,
          soporteHasta,
        },
      });
      await tx.empresa.update({
        where: { id: pago.empresaId },
        data: {
          ...(pago.incluyePlan ? { plan: pago.plan, suscripcionVenceEn: periodoHasta } : {}),
          ...(pago.incluyeSoporte && soporteHasta ? { soportePagadoHasta: soporteHasta } : {}),
        },
      });
    });
    return { recibido: true, estado: 'APPROVED' };
  }
}
