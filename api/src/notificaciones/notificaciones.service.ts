import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);
  private transporter: nodemailer.Transporter | null;

  constructor(private prisma: PrismaService) {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    this.transporter = smtpUser && smtpPass
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: Number(process.env.SMTP_PORT) || 587,
          secure: false,
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
    const { tipo, mensaje, empresa, sucursal, empresaId, usuarioId } = datos;
    const asunto = `🚨 Alerta PowerPOS — ${tipo} — ${empresa}`;
    const emails = await this.obtenerEmailsEmpresa(empresaId, usuarioId);
    const cuerpo = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; padding: 20px; border-radius: 8px;">
          <h1 style="color: #FF6B35; margin: 0;">Power<span style="color: white">POS</span></h1>
          <p style="color: #999; margin: 5px 0 0;">Sistema de alertas</p>
        </div>
        <div style="background: #fff3f3; border-left: 4px solid #e53e3e; padding: 20px; margin: 20px 0; border-radius: 4px;">
          <h2 style="color: #e53e3e; margin: 0 0 10px;">🚨 ${tipo}</h2>
          <p style="color: #333; margin: 0;">${mensaje}</p>
        </div>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 4px;">
          <p style="margin: 0; color: #666;"><strong>Empresa:</strong> ${empresa}</p>
          <p style="margin: 5px 0 0; color: #666;"><strong>Sucursal:</strong> ${sucursal}</p>
          <p style="margin: 5px 0 0; color: #666;"><strong>Fecha:</strong> ${new Date().toLocaleString('es-CO')}</p>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          PowerPOS Pioneers — Sistema de gestión gastronómica
        </p>
      </div>
    `;

    try {
      await this.enviarEmail(asunto, cuerpo, emails);
      this.logger.log('✅ Alerta enviada por Email');
      return { enviado: true, canales: [{ canal: 'email', exitoso: true }] };
    } catch (e) {
      const detalle = String(e ?? '');
      if (!detalle.includes('no configuradas') && !detalle.includes('no configurado')) {
        this.logger.warn(`No se pudo enviar por Email: ${detalle}`);
      }
      return { enviado: false, canales: [{ canal: 'email', exitoso: false }] };
    }
  }

  async enviarFelicitacionCumpleanos(cliente: { nombre: string; telefono?: string | null; email?: string | null }, nombreEmpresa: string) {
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

  private async obtenerEmailsEmpresa(empresaId?: number, usuarioId?: number): Promise<string[]> {
    const emails: string[] = [];

    if (empresaId) {
      const empresa = await this.prisma.empresa.findUnique({
        where: { id: empresaId },
        include: {
          usuarios: {
            where: { activo: true, rol: { in: ['ADMIN_EMPRESA', 'GERENTE', 'SUPERADMIN'] } },
            select: { email: true },
          },
        },
      });

      if (empresa) {
        if (empresa.email) emails.push(empresa.email);
        for (const usuario of empresa.usuarios ?? []) {
          if (usuario.email) emails.push(usuario.email);
        }
      }
    }

    if (usuarioId && emails.length === 0) {
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        include: { empresa: true },
      });
      if (usuario?.empresa?.email) emails.push(usuario.empresa.email);
    }

    if (emails.length === 0 && process.env.EMAIL_ADMIN) emails.push(process.env.EMAIL_ADMIN);

    return [...new Set(emails.filter(Boolean))];
  }

  private async enviarEmail(asunto: string, cuerpo: string, destinatarios: string[] = []) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !this.transporter) {
      throw new Error('Credenciales SMTP no configuradas');
    }

    const emails = destinatarios.length > 0 ? destinatarios : process.env.EMAIL_ADMIN ? [process.env.EMAIL_ADMIN] : [];
    if (emails.length === 0) throw new Error('No hay destinatarios configurados');

    await this.transporter.sendMail({
      from: `"PowerPOS Alerts" <${process.env.SMTP_USER}>`,
      to: emails,
      subject: asunto,
      html: cuerpo,
    });
  }

  private async enviarEmailA(destinatario: string, asunto: string, cuerpo: string) {
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
