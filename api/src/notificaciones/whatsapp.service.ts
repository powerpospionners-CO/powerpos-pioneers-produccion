import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { grupoAlerta, validarPreferencias } from './preferencias-alertas';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private ocupado = false;
  constructor(private readonly prisma: PrismaService) {}

  estado() {
    const limite = Number(process.env.WHATSAPP_LIMITE_DIARIO || 0);
    const configurado =
      process.env.WHATSAPP_ENABLED === 'true' &&
      !!process.env.WHATSAPP_ACCESS_TOKEN &&
      /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID || '') &&
      /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_VERSION || '') &&
      /^[a-z0-9_]+$/.test(process.env.WHATSAPP_TEMPLATE_ALERTA || '') &&
      !!process.env.WHATSAPP_APP_SECRET &&
      !!process.env.WHATSAPP_VERIFY_TOKEN &&
      Number.isSafeInteger(limite) &&
      limite > 0;
    return {
      configurado,
      limiteDiario: Number.isSafeInteger(limite) && limite > 0 ? limite : 0,
    };
  }

  async encolar(datos: {
    empresaId: number;
    tipo: string;
    mensaje: string;
    sucursal: string;
  }) {
    const grupo = grupoAlerta(datos.tipo);
    if (!this.estado().configurado || !grupo) return false;
    const usuarios = await this.prisma.usuario.findMany({
      where: {
        empresaId: datos.empresaId,
        activo: true,
        rol: { in: ['ADMIN_EMPRESA', 'GERENTE'] },
      },
      select: { id: true },
    });
    const eventos = await this.prisma.auditoria.findMany({
      where: {
        empresaId: datos.empresaId,
        entidad: 'UsuarioAlertas',
        accion: 'CONFIGURAR',
      },
      orderBy: { id: 'asc' },
    });
    const preferencias = new Map<
      number,
      ReturnType<typeof validarPreferencias>
    >();
    for (const evento of eventos) {
      try {
        if (evento.entidadId)
          preferencias.set(
            evento.entidadId,
            validarPreferencias(evento.detalle),
          );
      } catch {
        /* Configuración antigua. */
      }
    }
    const telefonos = [
      ...new Set(
        usuarios
          .map((u) => preferencias.get(u.id))
          .filter((p) => p?.whatsapp && p.telefono && p[grupo])
          .map((p) => p!.telefono),
      ),
    ];
    if (!telefonos.length) return false;
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: datos.empresaId },
      select: { nombre: true },
    });
    if (!empresa) return false;
    const huella = createHash('sha256')
      .update(JSON.stringify(datos))
      .digest('hex');
    // La reserva y el límite se serializan en la base de ESTA sede, incluso con varias instancias.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${datos.empresaId}, 81726)`;
      const ahora = new Date();
      const dia = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
      }).format(ahora);
      const anteriores = await tx.auditoria.findMany({
        where: {
          empresaId: datos.empresaId,
          entidad: 'WhatsAppSalida',
          creadoEn: { gte: new Date(ahora.getTime() - 86400000) },
        },
      });
      let usados = anteriores.filter(
        (a) => (a.detalle as any)?.dia === dia,
      ).length;
      let creados = 0;
      for (const telefono of telefonos) {
        if (usados >= this.estado().limiteDiario) break;
        if (
          anteriores.some((a) => {
            const d = a.detalle as any;
            return (
              d?.telefono === telefono &&
              d?.huella === huella &&
              (grupo === 'stock' ||
                a.creadoEn.getTime() > ahora.getTime() - 60000)
            );
          })
        )
          continue;
        await tx.auditoria.create({
          data: {
            empresaId: datos.empresaId,
            entidad: 'WhatsAppSalida',
            accion: 'PENDIENTE',
            detalle: {
              telefono,
              huella,
              dia,
              grupo,
              correlacion: randomUUID(),
              empresa: empresa.nombre,
              sucursal: datos.sucursal,
              tipo: datos.tipo,
              mensaje: datos.mensaje,
              fecha: ahora.toISOString(),
            },
          },
        });
        usados++;
        creados++;
      }
      return creados > 0;
    });
  }

  @Cron('*/15 * * * * *')
  async procesar() {
    if (this.ocupado || !this.estado().configurado) return;
    this.ocupado = true;
    try {
      await this.prisma.enCadaSede(() => this.procesarSede());
    } catch {
      this.logger.warn('No se completó el procesamiento de WhatsApp');
    } finally {
      this.ocupado = false;
    }
  }

  async procesarSede() {
    const trabajos = await this.prisma.auditoria.findMany({
      where: { entidad: 'WhatsAppSalida', accion: 'PENDIENTE' },
      orderBy: { id: 'asc' },
      take: 10,
    });
    for (const trabajo of trabajos) {
      const d = trabajo.detalle as any;
      const grupo = grupoAlerta(d?.tipo || '');
      // Revisar consentimiento y pertenencia otra vez antes de enviar un trabajo guardado.
      const admins = await this.prisma.usuario.findMany({
        where: {
          empresaId: trabajo.empresaId,
          activo: true,
          rol: { in: ['ADMIN_EMPRESA', 'GERENTE'] },
        },
        select: { id: true },
      });
      const eventos = await this.prisma.auditoria.findMany({
        where: {
          empresaId: trabajo.empresaId,
          entidad: 'UsuarioAlertas',
          accion: 'CONFIGURAR',
        },
        orderBy: { id: 'desc' },
      });
      const vistos = new Set<number>();
      const autorizado = eventos.some((e) => {
        if (!e.entidadId || vistos.has(e.entidadId)) return false;
        vistos.add(e.entidadId);
        try {
          const p = validarPreferencias(e.detalle);
          return (
            !!grupo &&
            admins.some((a) => a.id === e.entidadId) &&
            p.whatsapp &&
            p[grupo] &&
            p.telefono === d.telefono
          );
        } catch {
          return false;
        }
      });
      const vencido = trabajo.creadoEn.getTime() < Date.now() - 3600000;
      const claim = await this.prisma.auditoria.updateMany({
        where: {
          id: trabajo.id,
          empresaId: trabajo.empresaId,
          accion: 'PENDIENTE',
        },
        data: { accion: autorizado && !vencido ? 'ENVIANDO' : 'CANCELADO' },
      });
      if (!claim.count || !autorizado || vencido) continue;
      try {
        const compactar = (v: string) =>
          v.replace(/\s+/g, ' ').trim().slice(0, 500) || '-';
        const respuesta = await fetch(
          `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: 'POST',
            redirect: 'error',
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(8000),
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: d.telefono,
              type: 'template',
              biz_opaque_callback_data: d.correlacion,
              template: {
                name: process.env.WHATSAPP_TEMPLATE_ALERTA,
                language: {
                  code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_CO',
                },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      d.empresa,
                      d.sucursal,
                      d.tipo,
                      d.mensaje,
                      new Date(d.fecha).toLocaleString('es-CO', {
                        timeZone: 'America/Bogota',
                      }),
                    ].map((v) => ({ type: 'text', text: compactar(v) })),
                  },
                ],
              },
            }),
          },
        );
        const resultado = (await respuesta.json()) as any;
        if (!respuesta.ok || typeof resultado.messages?.[0]?.id !== 'string')
          throw new Error('Meta rechazó el envío');
        await this.prisma.auditoria.updateMany({
          where: { id: trabajo.id, accion: 'ENVIANDO' },
          data: {
            accion: 'ACEPTADO',
            detalle: { ...d, messageId: resultado.messages[0].id },
          },
        });
      } catch {
        // Sin reintentos ciegos: un timeout podría significar que Meta sí recibió el mensaje.
        await this.prisma.auditoria.updateMany({
          where: { id: trabajo.id, accion: 'ENVIANDO' },
          data: { accion: 'REVISAR' },
        });
        this.logger.warn(
          'Un envío de WhatsApp requiere revisión; no se reintentará automáticamente',
        );
      }
    }
  }

  async registrarEstados(body: any) {
    const estados = (Array.isArray(body?.entry) ? body.entry : [])
      .flatMap((e) =>
        (Array.isArray(e?.changes) ? e.changes : []).flatMap((c) =>
          c?.value?.metadata?.phone_number_id ===
            process.env.WHATSAPP_PHONE_NUMBER_ID &&
          Array.isArray(c.value.statuses)
            ? c.value.statuses
            : [],
        ),
      )
      .slice(0, 100);
    if (!estados.length) return;
    await this.prisma.enCadaSede(async () => {
      for (const estado of estados) {
        const rangos = {
          ACEPTADO: 0,
          sent: 1,
          delivered: 2,
          read: 3,
          failed: 4,
        };
        if (
          typeof estado.id !== 'string' ||
          !['sent', 'delivered', 'read', 'failed'].includes(estado.status)
        )
          continue;
        const correlacion =
          typeof estado.biz_opaque_callback_data === 'string' &&
          /^[0-9a-f-]{36}$/.test(estado.biz_opaque_callback_data)
            ? estado.biz_opaque_callback_data
            : null;
        const trabajo = await this.prisma.auditoria.findFirst({
          where: {
            entidad: 'WhatsAppSalida',
            OR: [
              { detalle: { path: ['messageId'], equals: estado.id } },
              ...(correlacion
                ? [{ detalle: { path: ['correlacion'], equals: correlacion } }]
                : []),
            ],
          },
        });
        if (!trabajo || (rangos[trabajo.accion] ?? 0) >= rangos[estado.status])
          continue;
        await this.prisma.auditoria.updateMany({
          where: { id: trabajo.id, accion: trabajo.accion },
          data: {
            accion: estado.status,
            detalle: { ...(trabajo.detalle as any), messageId: estado.id },
          },
        });
      }
    });
  }
}
