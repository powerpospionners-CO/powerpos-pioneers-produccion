import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { avisoSuscripcion } from './aviso-suscripcion';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import {
  CorreoPowerpos,
  correoAlerta,
  correoPrueba,
  correoCumpleanos,
  correoSuscripcion,
  logoCorreo,
} from './correo-powerpos';
import {
  grupoAlerta,
  PreferenciasAlertas,
  ROLES_ALERTAS,
  SIN_ALERTAS,
  validarPreferencias,
} from './preferencias-alertas';

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);
  private transporter: nodemailer.Transporter | null;
  private revisandoStock = false;
  private revisandoSuscripciones = false;

  constructor(
    private prisma: PrismaService,
    private readonly whatsapp?: WhatsappService,
  ) {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    this.transporter =
      smtpUser && smtpPass
        ? nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            requireTLS: true,
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 15000,
            auth: { user: smtpUser, pass: smtpPass },
          })
        : null;
  }

  async enviarAlerta(datos: {
    tipo: string;
    mensaje: string;
    empresa: string;
    sucursal: string;
    empresaId?: number;
    usuarioId?: number;
  }) {
    const { empresaId } = datos;
    if (!empresaId || !grupoAlerta(datos.tipo))
      return { enviado: false, canales: [] };
    // La cola no depende del SMTP ni espera la conexión con Meta durante una venta.
    try {
      await this.whatsapp?.encolar({ ...datos, empresaId });
    } catch {
      this.logger.warn('No se pudo poner la alerta en la cola de WhatsApp');
    }
    try {
      const destinatarios = await this.destinatarios(empresaId, datos.tipo);
      if (!destinatarios.length || !this.transporter)
        return { enviado: false, canales: [] };
      const empresaReal = await this.prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { nombre: true },
      });
      if (!empresaReal) return { enviado: false, canales: [] };
      const asunto = `PowerPOS · ${datos.tipo} · ${empresaReal.nombre}`;
      const cuerpo = correoAlerta({ ...datos, empresa: empresaReal.nombre });

      // Un mensaje por destinatario: no se revelan correos de otros administradores.
      const resultados = await Promise.allSettled(
        destinatarios.map((email) => this.enviarEmail(asunto, cuerpo, [email])),
      );
      const enviados = resultados.filter(
        (r) => r.status === 'fulfilled',
      ).length;
      if (!enviados) throw new Error('Entrega fallida');
      this.logger.log('✅ Alerta enviada por Email');
      return {
        enviado: enviados === destinatarios.length,
        canales: [
          { canal: 'email', exitoso: enviados === destinatarios.length },
        ],
      };
    } catch (e) {
      const detalle = String(e ?? '');
      if (
        !detalle.includes('no configuradas') &&
        !detalle.includes('no configurado')
      ) {
        this.logger.warn('No se pudo entregar la alerta por correo');
      }
      return { enviado: false, canales: [{ canal: 'email', exitoso: false }] };
    }
  }

  async enviarFelicitacionCumpleanos(
    cliente: {
      nombre: string;
      telefono?: string | null;
      email?: string | null;
    },
    nombreEmpresa: string,
    administrador = false,
  ) {
    const primerNombre = cliente.nombre.split(' ')[0];
    if (!cliente.email || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return { enviado: false };
    }
    const asunto = `¡${nombreEmpresa} te desea un feliz cumpleaños!`;
    const cuerpo = correoCumpleanos(primerNombre, nombreEmpresa, administrador);

    try {
      await this.enviarEmail(asunto, cuerpo, [cliente.email]);
      return { enviado: true };
    } catch (e) {
      this.logger.warn(`No se pudo felicitar a ${cliente.nombre}: ${e}`);
      return { enviado: false };
    }
  }

  // Preferencias versionadas en la auditoría existente de cada sede. No cambian
  // el email de acceso ni necesitan migrar las bases que están en producción.
  private async preferencias(empresaId: number) {
    const eventos = await this.prisma.auditoria.findMany({
      where: { empresaId, entidad: 'UsuarioAlertas', accion: 'CONFIGURAR' },
      orderBy: { id: 'asc' },
      select: { entidadId: true, detalle: true },
    });
    const mapa = new Map<number, PreferenciasAlertas>();
    for (const evento of eventos) {
      try {
        if (evento.entidadId)
          mapa.set(evento.entidadId, validarPreferencias(evento.detalle));
      } catch {
        /* Ignorar configuraciones antiguas inválidas. */
      }
    }
    return mapa;
  }

  async configuracion(empresaId: number) {
    const [usuarios, mapa] = await Promise.all([
      this.prisma.usuario.findMany({
        where: { empresaId, activo: true, rol: { in: [...ROLES_ALERTAS] } },
        select: { id: true, nombre: true, rol: true },
        orderBy: { nombre: 'asc' },
      }),
      this.preferencias(empresaId),
    ]);
    return {
      correoConfigurado: !!this.transporter,
      whatsapp: this.whatsapp?.estado() || {
        configurado: false,
        limiteDiario: 0,
      },
      administradores: usuarios.map((u) => ({
        ...u,
        ...(mapa.get(u.id) || SIN_ALERTAS),
      })),
    };
  }

  private async administrador(id: number, empresaId: number) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException('Administrador no válido');
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, empresaId, activo: true, rol: { in: [...ROLES_ALERTAS] } },
      select: { id: true },
    });
    if (!usuario)
      throw new NotFoundException(
        'Administrador no encontrado en esta empresa',
      );
    return usuario;
  }

  async guardarPreferencias(
    id: number,
    datos: unknown,
    empresaId: number,
    usuarioId: number,
  ) {
    await this.administrador(id, empresaId);
    const preferencias = validarPreferencias(datos);
    await this.prisma.auditoria.create({
      data: {
        empresaId,
        usuarioId,
        accion: 'CONFIGURAR',
        entidad: 'UsuarioAlertas',
        entidadId: id,
        detalle: preferencias,
      },
    });
    return { ...preferencias, guardado: true };
  }

  private async destinatarios(empresaId: number, tipo: string) {
    const grupo = grupoAlerta(tipo);
    if (!grupo) return [];
    const config = await this.configuracion(empresaId);
    return [
      ...new Set(
        config.administradores
          .filter((u) => u.email && u[grupo])
          .map((u) => u.email),
      ),
    ];
  }

  async probarCorreo(id: number, empresaId: number) {
    await this.administrador(id, empresaId);
    const preferencia = (await this.preferencias(empresaId)).get(id);
    if (!preferencia?.email)
      throw new BadRequestException('Guarda primero el correo personal');
    if (!this.transporter)
      throw new ServiceUnavailableException(
        'El envío de correo de PowerPOS todavía no está configurado',
      );
    const reciente = await this.prisma.auditoria.findFirst({
      where: {
        empresaId,
        entidad: 'UsuarioAlertas',
        entidadId: id,
        accion: 'PRUEBA',
        creadoEn: { gte: new Date(Date.now() - 60000) },
      },
    });
    if (reciente)
      throw new BadRequestException(
        'Espera un minuto antes de enviar otra prueba',
      );
    await this.prisma.auditoria.create({
      data: {
        empresaId,
        entidad: 'UsuarioAlertas',
        entidadId: id,
        accion: 'PRUEBA',
      },
    });
    try {
      await this.enviarEmail(
        'PowerPOS · Prueba de alertas',
        correoPrueba('Administrador'),
        [preferencia.email],
      );
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo entregar la prueba. Revisa la configuración del remitente de PowerPOS',
      );
    }
    return { enviado: true };
  }

  @Cron('0 */5 * * * *')
  async revisarStock() {
    if (
      (!this.transporter && !this.whatsapp?.estado().configurado) ||
      this.revisandoStock
    )
      return;
    this.revisandoStock = true;
    try {
      await this.prisma.enCadaSede(() => this.revisarStockSede());
    } catch {
      this.logger.warn('No se completó la revisión de alertas de inventario');
    } finally {
      this.revisandoStock = false;
    }
  }

  async revisarStockSede() {
    const empresas = await this.prisma.empresa.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
    });
    for (const empresa of empresas) {
      const config = await this.configuracion(empresa.id);
      if (
        !config.administradores.some(
          (u) =>
            u.stock &&
            (u.email ||
              (config.whatsapp.configurado && u.whatsapp && u.telefono)),
        )
      )
        continue;
      const [ingredientes, productos] = await Promise.all([
        this.prisma.ingrediente.findMany({
          where: { empresaId: empresa.id, activo: true },
          select: {
            id: true,
            nombre: true,
            stock: true,
            stockMinimo: true,
            unidad: true,
          },
        }),
        this.prisma.producto.findMany({
          where: { empresaId: empresa.id, activo: true, controlaStock: true },
          select: {
            id: true,
            nombre: true,
            stockActual: true,
            stockMinimo: true,
          },
        }),
      ]);
      const bajos = [
        ...ingredientes.map((i) => ({
          clave: `i${i.id}`,
          nombre: i.nombre,
          stock: Number(i.stock),
          minimo: Number(i.stockMinimo),
          unidad: i.unidad,
        })),
        ...productos.map((p) => ({
          clave: `p${p.id}`,
          nombre: p.nombre,
          stock: Number(p.stockActual),
          minimo: Number(p.stockMinimo),
          unidad: 'unidades',
        })),
      ].filter((i) => i.stock <= i.minimo);
      const enviadas = await this.prisma.auditoria.findMany({
        where: {
          empresaId: empresa.id,
          entidad: 'AlertaStock',
          creadoEn: { gte: new Date(Date.now() - 86400000) },
        },
        select: { accion: true },
      });
      const claves = new Set(enviadas.map((a) => a.accion));
      const pendientes: typeof bajos = [];
      for (const item of bajos) {
        const critico = item.stock <= item.minimo * 0.5;
        const clave = `${item.clave}:${critico ? 'critico' : 'bajo'}`;
        if (!claves.has(clave)) pendientes.push(item);
      }
      if (!pendientes.length) continue;
      const sede = await this.prisma.sucursal.findFirst({
        where: { empresaId: empresa.id },
        select: { nombre: true },
      });
      const resultado = await this.enviarAlerta({
        empresaId: empresa.id,
        empresa: empresa.nombre,
        sucursal: sede?.nombre || 'Sede',
        tipo: 'STOCK BAJO / CRÍTICO',
        mensaje: pendientes
          .map(
            (i) =>
              `${i.stock <= i.minimo * 0.5 ? 'CRÍTICO' : 'BAJO'}: ${i.nombre}: ${i.stock} ${i.unidad}; mínimo ${i.minimo}`,
          )
          .join('\n'),
      });
      if (resultado.enviado)
        await this.prisma.auditoria.createMany({
          data: pendientes.map((i) => ({
            empresaId: empresa.id,
            entidad: 'AlertaStock',
            accion: `${i.clave}:${i.stock <= i.minimo * 0.5 ? 'critico' : 'bajo'}`,
            detalle: { stock: i.stock, minimo: i.minimo },
          })),
        });
    }
  }

  @Cron('0 0 8-18 * * *', { timeZone: 'America/Bogota' })
  async revisarSuscripciones() {
    if (!this.transporter || this.revisandoSuscripciones) return;
    this.revisandoSuscripciones = true;
    try {
      await this.prisma.enCadaSede(() => this.revisarSuscripcionesSede());
    } catch {
      this.logger.warn('No se completó la revisión de suscripciones');
    } finally {
      this.revisandoSuscripciones = false;
    }
  }

  async revisarSuscripcionesSede(ahora = new Date()) {
    const empresas = await this.prisma.empresa.findMany({
      where: { activo: true }, select: { id: true },
    });
    // La suscripción central es la fuente vigente aunque una sede lleve tiempo sin entrar.
    const control = this.prisma.control || this.prisma;
    for (const { id } of empresas) {
      const empresa = await control.empresa.findUnique({
        where: { id }, select: { id: true, nombre: true, activo: true, pagoExonerado: true, suscripcionVenceEn: true },
      });
      if (!empresa?.activo || empresa.pagoExonerado) continue;
      const aviso = avisoSuscripcion(empresa.suscripcionVenceEn, ahora);
      if (!aviso) continue;
      const config = await this.configuracion(id);
      const correos = [...new Set(config.administradores.map(u => u.email).filter(Boolean))];
      for (const email of correos) {
        // Registro central por empresa, destinatario, vencimiento y etapa: tampoco
        // repite el aviso si el mismo administrador aparece en varias sedes.
        const clave = createHash('sha256').update(`${email}:${aviso.vence.toISOString()}:${aviso.etapa}`).digest('hex');
        const enviado = await control.auditoria.findFirst({
          where: { empresaId: id, entidad: 'AvisoSuscripcion', accion: clave },
          select: { id: true },
        });
        if (enviado) continue;
        try {
          await this.enviarEmail(
            `PowerPOS · ${aviso.etapa === 'FIN_PLAZO' ? 'Fin del plazo de pago' : 'Renovación de suscripción'} · ${empresa.nombre}`,
            correoSuscripcion({ ...aviso, empresa: empresa.nombre }), [email],
          );
          await control.auditoria.create({ data: {
            empresaId: id, entidad: 'AvisoSuscripcion', accion: clave,
            detalle: { etapa: aviso.etapa, vencimiento: aviso.vence.toISOString() },
          } });
        } catch {
          this.logger.warn('No se pudo entregar un recordatorio de suscripción; se reintentará en la siguiente revisión');
        }
      }
    }
  }

  private async enviarEmail(
    asunto: string,
    cuerpo: CorreoPowerpos,
    destinatarios: string[] = [],
  ) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !this.transporter) {
      throw new Error('Credenciales SMTP no configuradas');
    }

    const emails = destinatarios;
    if (emails.length === 0)
      throw new Error('No hay destinatarios configurados');

    await this.transporter.sendMail({
      from: `"PowerPOS" <${process.env.SMTP_USER}>`,
      to: emails,
      subject: asunto,
      html: cuerpo.html,
      text: cuerpo.text,
      attachments: [logoCorreo()],
    });
  }
}
