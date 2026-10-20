import * as nodemailer from 'nodemailer';
import {
  correoAlerta,
  correoCumpleanos,
  correoPrueba,
  LOGO_CORREO_CID,
  logoCorreo,
} from './correo-powerpos';

describe('Correos de PowerPOS', () => {
  it('escapa nombres, títulos y detalles sin convertir contenido del negocio en HTML', () => {
    const correo = correoAlerta({
      tipo: '<img src=x>',
      empresa: 'A & B',
      sucursal: '<script>robo()</script>',
      mensaje: '<a href="evil">producto</a>\nSegunda línea',
      fecha: new Date('2026-10-20T02:00:00Z'),
    });
    expect(correo.html).not.toContain('<script>');
    expect(correo.html).not.toContain('<img src=x>');
    expect(correo.html).toContain('&lt;a href=');
    expect(correo.html).toContain('A &amp; B');
    expect(correo.text).toContain('Segunda línea');
    expect(correo.text).toContain('19/10/2026');
  });
  it('distingue un aviso crítico de un movimiento habitual de caja', () => {
    const base = {
      empresa: 'Empresa',
      sucursal: 'Principal',
      mensaje: 'Detalle',
    };
    expect(
      correoAlerta({ ...base, tipo: 'APERTURA IRREGULAR DE CAJA' }).html,
    ).toContain('REQUIERE ATENCIÓN');
    expect(
      correoAlerta({ ...base, tipo: 'DIFERENCIA EN CAJA' }).html,
    ).toContain('REQUIERE ATENCIÓN');
    expect(correoAlerta({ ...base, tipo: 'APERTURA DE CAJA' }).html).toContain(
      'ACTUALIZACIÓN CONFIRMADA',
    );
  });
  it('conserva texto alternativo y no incluye un botón de administración en cumpleaños', () => {
    const correo = correoCumpleanos('<Cliente>', 'Tienda & Café');
    expect(correo.html).toContain('¡Feliz cumpleaños, &lt;Cliente&gt;!');
    expect(correo.html).toContain('Tienda &amp; Café');
    expect(correo.html).not.toContain('Revisar en PowerPOS');
    expect(correo.text).toContain('Tienda & Café');
  });
  it('incluye el logo real como imagen CID y una alternativa de texto en el mensaje MIME', async () => {
    const correo = correoPrueba('Administrador');
    const transporte = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const resultado = await transporte.sendMail({
      from: 'PowerPOS <test@example.com>',
      to: 'admin@example.com',
      subject: 'Vista previa',
      html: correo.html,
      text: correo.text,
      attachments: [logoCorreo()],
    });
    const mime = resultado.message.toString();
    expect(mime).toContain(`Content-ID: <${LOGO_CORREO_CID}>`);
    expect(mime).toContain('Content-Type: image/png');
    expect(mime).toContain('Content-Type: text/plain');
    expect(mime).toContain('Content-Type: text/html');
  });
});
