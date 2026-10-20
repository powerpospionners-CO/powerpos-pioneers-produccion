import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import {
  escaparHtml,
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

  constructor(private prisma: PrismaService) {
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
    try {
      const destinatarios = await this.destinatarios(empresaId, datos.tipo);
      if (!destinatarios.length || !this.transporter)
        return { enviado: false, canales: [] };
      const empresaReal = await this.prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { nombre: true },
      });
      if (!empresaReal) return { enviado: false, canales: [] };
      const { tipo, mensaje, sucursal } = Object.fromEntries(
        Object.entries({
          tipo: datos.tipo,
          mensaje: datos.mensaje,
          sucursal: datos.sucursal,
        }).map(([k, v]) => [k, escaparHtml(v)]),
      );
      const empresa = escaparHtml(empresaReal.nombre);
      const asunto = `🚨 Alerta PowerPOS — ${tipo} — ${empresa}`;
      const cuerpo = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; padding: 20px; border-radius: 8px;">
          <h1 style="color: #FF6B35; margin: 0;">Power<span style="color: white">POS</span></h1>
          <p style="color: #999; margin: 5px 0 0;">Sistema de alertas</p>
        </div>
        <div style="background: #fff3f3; border-left: 4px solid #e53e3e; padding: 20px; margin: 20px 0; border-radius: 4px;">
          <h2 style="color: #e53e3e; margin: 0 0 10px;">🚨 ${tipo}</h2>
          <p style="color: #333; margin: 0; white-space: pre-line;">${mensaje}</p>
        </div>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 4px;">
          <p style="margin: 0; color: #666;"><strong>Empresa:</strong> ${empresa}</p>
          <p style="margin: 5px 0 0; color: #666;"><strong>Sucursal:</strong> ${sucursal}</p>
          <p style="margin: 5px 0 0; color: #666;"><strong>Fecha:</strong> ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          PowerPOS Pioneers — Sistema de gestión gastronómica
        </p>
      </div>
    `;

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
  ) {
    const primerNombre = cliente.nombre.split(' ')[0];
    const mensajeTexto = `🎉 ¡Feliz cumpleaños, ${primerNombre}! Todo el equipo de ${nombreEmpresa} te desea un día increíble. ¡Esperamos verte pronto para celebrar juntos! 🎂`;

    if (!cliente.email || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return { enviado: false };
    }

    const asunto = `🎉 ¡${nombreEmpresa} te desea un feliz cumpleaños!`;
    const cuerpo = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #FF6B35, #f7931e); padding: 30px; border-radius: 8px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🎂 ¡Feliz Cumpleaños!</h1>
        </div>
        <div style="padding: 24px; text-align: center;">
          <p style="font-size: 16px; color: #333;">Hola <strong>${primerNombre}</strong>,</p>
          <p style="font-size: 16px; color: #333;">${mensajeTexto}</p>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          Con cariño, el equipo de ${nombreEmpresa}
        </p>
      </div>
    `;

    try {
      await this.enviarEmailA(cliente.email, asunto, cuerpo);
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
        '<p>Tu correo personal quedó configurado para recibir las alertas de tu empresa en PowerPOS.</p>',
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
    if (!this.transporter || this.revisandoStock) return;
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
      if (!(await this.destinatarios(empresa.id, 'STOCK CRÍTICO')).length)
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

  private async enviarEmail(
    asunto: string,
    cuerpo: string,
    destinatarios: string[] = [],
  ) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !this.transporter) {
      throw new Error('Credenciales SMTP no configuradas');
    }

    const emails = destinatarios;
    if (emails.length === 0)
      throw new Error('No hay destinatarios configurados');

    await this.transporter.sendMail({
      from: `"PowerPOS Alerts" <${process.env.SMTP_USER}>`,
      to: emails,
      subject: asunto,
      html: cuerpo,
    });
  }

  private async enviarEmailA(
    destinatario: string,
    asunto: string,
    cuerpo: string,
  ) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !this.transporter) {
      throw new Error('Credenciales SMTP no configuradas');
    }

    await this.transporter.sendMail({
      from: `"PowerPOS" <${process.env.SMTP_USER}>`,
      to: destinatario,
      subject: asunto,
      html: cuerpo,
    });
  }
}
