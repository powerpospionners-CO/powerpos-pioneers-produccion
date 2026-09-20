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
    const contactos = await this.obtenerContactosEmpresa(empresaId, usuarioId);
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

    const resultados = await Promise.allSettled([
      this.enviarEmail(asunto, cuerpo, contactos.emails),
      this.enviarWhatsApp(mensaje, tipo, contactos.telefonos),
      this.enviarSMS(mensaje, tipo, contactos.telefonos),
    ]);

    resultados.forEach((resultado, index) => {
      const canal = ['Email', 'WhatsApp', 'SMS'][index];
      if (resultado.status === 'rejected') {
        const detalle = String(resultado.reason ?? '');
        if (!detalle.includes('no configuradas') && !detalle.includes('no configurado')) {
          this.logger.warn(`No se pudo enviar por ${canal}: ${detalle}`);
        }
      } else {
        this.logger.log(`✅ Alerta enviada por ${canal}`);
      }
    });

    return {
      enviado: true,
      canales: resultados.map((r, i) => ({
        canal: ['email', 'whatsapp', 'sms'][i],
        exitoso: r.status === 'fulfilled',
      })),
    };
  }

  async enviarFelicitacionCumpleanos(cliente: { nombre: string; telefono?: string | null; email?: string | null }, nombreEmpresa: string) {
    const primerNombre = cliente.nombre.split(' ')[0];
    const mensajeTexto = `🎉 ¡Feliz cumpleaños, ${primerNombre}! Todo el equipo de ${nombreEmpresa} te desea un día increíble. ¡Esperamos verte pronto para celebrar juntos! 🎂`;

    const intentos: Promise<void>[] = [];

    if (cliente.telefono && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      intentos.push(this.enviarWhatsAppA(cliente.telefono, mensajeTexto));
    }

    if (cliente.email && process.env.SMTP_USER && process.env.SMTP_PASS) {
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
      intentos.push(this.enviarEmailA(cliente.email, asunto, cuerpo));
    }

    const resultados = await Promise.allSettled(intentos);
    resultados.forEach((r) => {
      if (r.status === 'rejected') {
        this.logger.warn(`No se pudo felicitar a ${cliente.nombre}: ${r.reason}`);
      }
    });

    return { enviado: resultados.some((r) => r.status === 'fulfilled') };
  }

  private normalizarTelefono(telefono: string): string | null {
    if (!telefono) return null;

    const limpio = telefono.replace(/[^\d+]/g, '').trim();
    if (!limpio) return null;

    if (limpio.startsWith('+')) {
      const sinSigno = limpio.replace('+', '');
      if (sinSigno.startsWith('57') && sinSigno.length >= 11) return `+${sinSigno}`;
      if (sinSigno.length === 10 && sinSigno.startsWith('3')) return `+57${sinSigno}`;
      return null;
    }

    const sinPrefijo = limpio.replace(/^0+/, '');
    if (sinPrefijo.startsWith('57') && sinPrefijo.length >= 11) return `+${sinPrefijo}`;
    if (sinPrefijo.length === 10 && sinPrefijo.startsWith('3')) return `+57${sinPrefijo}`;
    if (sinPrefijo.length === 11 && sinPrefijo.startsWith('3')) return `+${sinPrefijo}`;

    return null;
  }

  private async obtenerContactosEmpresa(empresaId?: number, usuarioId?: number) {
    const emails: string[] = [];
    const telefonos: string[] = [];

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
        if (empresa.telefono) {
          const telefonoNormalizado = this.normalizarTelefono(empresa.telefono);
          if (telefonoNormalizado) telefonos.push(telefonoNormalizado);
        }
        for (const usuario of empresa.usuarios ?? []) {
          if (usuario.email) emails.push(usuario.email);
        }
      }
    }

    if (usuarioId && emails.length === 0 && telefonos.length === 0) {
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        include: { empresa: true },
      });

      if (usuario?.empresa?.email) emails.push(usuario.empresa.email);
      if (usuario?.empresa?.telefono) {
        const telefonoNormalizado = this.normalizarTelefono(usuario.empresa.telefono);
        if (telefonoNormalizado) telefonos.push(telefonoNormalizado);
      }
    }

    if (emails.length === 0 && process.env.EMAIL_ADMIN) emails.push(process.env.EMAIL_ADMIN);
    if (telefonos.length === 0 && process.env.ADMIN_PHONE) {
      const telefonoNormalizado = this.normalizarTelefono(process.env.ADMIN_PHONE);
      if (telefonoNormalizado) telefonos.push(telefonoNormalizado);
    }

    return {
      emails: [...new Set(emails.filter(Boolean))],
      telefonos: [...new Set(telefonos.filter(Boolean))],
    };
  }

  private async enviarEmail(asunto: string, cuerpo: string, destinatarios: string[] = []) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !this.transporter) {
      return;
    }

    const emails = destinatarios.length > 0 ? destinatarios : process.env.EMAIL_ADMIN ? [process.env.EMAIL_ADMIN] : [];
    if (emails.length === 0) return;

    await this.transporter.sendMail({
      from: `"PowerPOS Alerts" <${process.env.SMTP_USER}>`,
      to: emails,
      subject: asunto,
      html: cuerpo,
    });
  }

  private async enviarEmailA(destinatario: string, asunto: string, cuerpo: string) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !this.transporter) {
      return;
    }

    await this.transporter.sendMail({
      from: `"PowerPOS" <${process.env.SMTP_USER}>`,
      to: destinatario,
      subject: asunto,
      html: cuerpo,
    });
  }

  private getTwilioWhatsAppFrom(): string | undefined {
    return process.env.TWILIO_WHATSAPP_PHONE || process.env.TWILIO_PHONE;
  }

  private getTwilioSmsFrom(): string | undefined {
    return process.env.TWILIO_SMS_PHONE || process.env.TWILIO_PHONE;
  }

  private async enviarWhatsApp(mensaje: string, tipo: string, telefonos: string[] = []) {
    const from = this.getTwilioWhatsAppFrom();
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
      return;
    }

    const destinos = telefonos.length > 0 ? telefonos : process.env.ADMIN_PHONE ? [process.env.ADMIN_PHONE] : [];
    if (destinos.length === 0) return;

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    for (const telefono of destinos) {
      const destino = this.normalizarTelefono(telefono);
      if (!destino) continue;

      await client.messages.create({
        from: `whatsapp:${from}`,
        to: `whatsapp:${destino}`,
        body: `🚨 *PowerPOS Alert*\n*${tipo}*\n\n${mensaje}\n\n_${new Date().toLocaleString('es-CO')}_`,
      });
    }
  }

  private async enviarWhatsAppA(telefono: string, mensaje: string) {
    const from = this.getTwilioWhatsAppFrom();
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
      return;
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const destino = this.normalizarTelefono(telefono);
    if (!destino) return;

    await client.messages.create({
      from: `whatsapp:${from}`,
      to: `whatsapp:${destino}`,
      body: mensaje,
    });
  }

  private async enviarSMS(mensaje: string, tipo: string, telefonos: string[] = []) {
    const from = this.getTwilioSmsFrom();
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
      return;
    }

    const destinos = telefonos.length > 0 ? telefonos : process.env.ADMIN_PHONE ? [process.env.ADMIN_PHONE] : [];
    if (destinos.length === 0) return;

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    for (const telefono of destinos) {
      const destino = this.normalizarTelefono(telefono);
      if (!destino) continue;

      await client.messages.create({
        from,
        to: destino,
        body: `PowerPOS 🚨 ${tipo}: ${mensaje.substring(0, 140)}`,
      });
    }
  }
}