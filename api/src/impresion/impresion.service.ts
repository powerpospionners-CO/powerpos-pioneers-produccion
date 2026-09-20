import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'node:net';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

const INICIO = Buffer.from([0x1b, 0x40]);
const CORTE = Buffer.from([0x1d, 0x56, 0x41, 0x03]);
const TIMEOUT_MS = 3000;

@Injectable()
export class ImpresionService {
  private readonly logger = new Logger(ImpresionService.name);

  constructor(private readonly prisma?: PrismaService) {}

  // Envía un buffer a la impresora ESC/POS por TCP. Nunca lanza: devuelve
  // el mensaje de error para que el llamador pueda degradar a impresión por navegador.
  private enviarTcp(host: string, port: number, datos: Buffer): Promise<string | null> {
    return new Promise((resolve) => {
      const socket = new Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(`Tiempo agotado conectando a ${host}:${port}`);
      }, TIMEOUT_MS);

      socket.once('error', (error: Error) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(error.message);
      });
      socket.connect(port, host, () => {
        socket.end(datos, () => {
          clearTimeout(timeout);
          resolve(null);
        });
      });
    });
  }

  async imprimirComanda(pedido: any, empresaId: number) {
    if (String(process.env.ESC_POS_ENABLED).toLowerCase() !== 'true') {
      return {
        impreso: false,
        modo: 'browser',
        fallbackBrowser:
          String(process.env.ESC_POS_BROWSER_FALLBACK).toLowerCase() === 'true',
        motivo: 'ESC_POS_ENABLED no está activo',
      };
    }

    const contenido = await this.formatearComanda(pedido, empresaId);
    const tipo = (process.env.ESC_POS_TYPE || 'tcp').toLowerCase();

    if (tipo !== 'tcp') {
      return {
        impreso: false,
        modo: tipo,
        motivo: 'El modo configurado no está soportado por el servidor',
      };
    }

    const host = process.env.ESC_POS_HOST;
    const port = Number(process.env.ESC_POS_PORT || 9100);
    if (!host) {
      return {
        impreso: false,
        modo: 'tcp',
        fallbackBrowser: true,
        motivo: 'Falta ESC_POS_HOST',
      };
    }

    const error = await this.enviarTcp(
      host,
      port,
      Buffer.concat([INICIO, contenido, CORTE]),
    );

    if (error) {
      this.logger.warn(`No se pudo imprimir la comanda en ${host}:${port}: ${error}`);
      return { impreso: false, modo: 'tcp', fallbackBrowser: true, motivo: error };
    }

    return { impreso: true, modo: 'tcp' };
  }

  async imprimirRecibo(pedido: any, empresaId: number) {
    if (String(process.env.ESC_POS_ENABLED).toLowerCase() !== 'true') {
      return {
        impreso: false,
        modo: 'browser',
        fallbackBrowser:
          String(process.env.ESC_POS_BROWSER_FALLBACK).toLowerCase() === 'true',
        motivo: 'ESC_POS_ENABLED no está activo',
      };
    }

    const contenido = await this.formatearRecibo(pedido, empresaId);
    const tipo = (process.env.ESC_POS_TYPE || 'tcp').toLowerCase();

    if (tipo !== 'tcp') {
      return {
        impreso: false,
        modo: tipo,
        motivo: 'El modo configurado no está soportado por el servidor',
      };
    }

    const host = process.env.ESC_POS_HOST;
    const port = Number(process.env.ESC_POS_PORT || 9100);
    if (!host) {
      return {
        impreso: false,
        modo: 'tcp',
        fallbackBrowser: true,
        motivo: 'Falta ESC_POS_HOST',
      };
    }

    const error = await this.enviarTcp(
      host,
      port,
      Buffer.concat([INICIO, contenido, CORTE]),
    );

    if (error) {
      this.logger.warn(`No se pudo imprimir el recibo en ${host}:${port}: ${error}`);
      return { impreso: false, modo: 'tcp', fallbackBrowser: true, motivo: error };
    }

    return { impreso: true, modo: 'tcp' };
  }

  async abrirCajon() {
    if (String(process.env.ESC_POS_ENABLED).toLowerCase() !== 'true') {
      return { abierto: false, motivo: 'ESC_POS_ENABLED no está activo' };
    }

    const host = process.env.ESC_POS_HOST;
    const port = Number(process.env.ESC_POS_PORT || 9100);
    if (!host) return { abierto: false, motivo: 'Falta ESC_POS_HOST' };

    const error = await this.enviarTcp(
      host,
      port,
      Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]),
    );

    if (error) {
      this.logger.warn(`No se pudo abrir el cajón en ${host}:${port}: ${error}`);
      return { abierto: false, motivo: error };
    }

    return { abierto: true };
  }

  private async obtenerEmpresa(empresaId: number) {
    if (!this.prisma) {
      return null;
    }

    return this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        nombre: true,
        tipoNegocio: true,
        nit: true,
        telefono: true,
        direccion: true,
        email: true,
        logo: true,
      },
    });
  }

  private centrarTexto(texto: string, ancho = 32) {
    const valor = String(texto ?? '').slice(0, ancho);
    const espacios = Math.max(0, Math.floor((ancho - valor.length) / 2));
    return `${' '.repeat(espacios)}${valor}`;
  }

  private recortarTexto(texto: string, ancho = 32) {
    return String(texto ?? '').slice(0, ancho).padEnd(ancho, ' ');
  }

  private async generarLogoEscPos(empresa: any): Promise<Buffer> {
    if (!empresa?.logo) {
      return Buffer.from('');
    }

    try {
      const logoUrl = String(empresa.logo).trim();
      if (!logoUrl) return Buffer.from('');

      let urlValida: URL;
      try {
        urlValida = new URL(logoUrl);
      } catch {
        return Buffer.from('');
      }

      if (!['http:', 'https:'].includes(urlValida.protocol)) {
        return Buffer.from('');
      }

      const respuesta = await fetch(logoUrl, {
        headers: {
          'User-Agent': 'PowerPos-Printer/1.0',
        },
      });

      if (!respuesta.ok) return Buffer.from('');

      const contentType = respuesta.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) return Buffer.from('');

      const buffer = Buffer.from(await respuesta.arrayBuffer());
      const { data, info } = await sharp(buffer)
        .resize({ width: 300, height: 120, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalize()
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .threshold(180)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const ancho = info.width;
      const alto = info.height;
      const bytesPorLinea = Math.max(1, Math.ceil(ancho / 8));
      const lineas: Buffer[] = [Buffer.from([0x1b, 0x61, 0x01])];

      for (let y = 0; y < alto; y += 1) {
        const fila = Buffer.alloc(bytesPorLinea, 0x00);

        for (let x = 0; x < ancho; x += 1) {
          const indice = y * ancho + x;
          const valor = data[indice] ?? 255;
          if (valor < 128) {
            const byteIndex = Math.floor(x / 8);
            const bitIndex = 7 - (x % 8);
            fila[byteIndex] |= 1 << bitIndex;
          }
        }

        lineas.push(Buffer.from([0x1b, 0x2a, 0x00, bytesPorLinea & 0xff, (bytesPorLinea >> 8) & 0xff]));
        lineas.push(fila);
      }

      lineas.push(Buffer.from([0x1b, 0x61, 0x00]));
      return Buffer.concat(lineas);
    } catch {
      return Buffer.from('');
    }
  }

  private async formatearComanda(pedido: any, empresaId: number) {
    const empresa = await this.obtenerEmpresa(empresaId);
    const nombre = (empresa?.nombre || 'MI EMPRESA').toUpperCase();
    const nit = empresa?.nit ? `NIT: ${empresa.nit}` : 'NIT: N/A';
    const direccion = empresa?.direccion ? `DIR: ${empresa.direccion}` : 'DIR: N/A';
    const telefono = empresa?.telefono ? `TEL: ${empresa.telefono}` : 'TEL: N/A';
    const nombreCliente = pedido?.cliente?.nombre ? `CLIENTE: ${pedido.cliente.nombre}` : 'CLIENTE: GENERAL';
    const telefonoCliente = pedido?.cliente?.telefono ? `TEL: ${pedido.cliente.telefono}` : 'TEL: NO REGISTRADO';
    const logo = await this.generarLogoEscPos(empresa);

    const lineas: Array<string | Buffer> = [
      '\n',
    ];

    if (logo.length > 0) {
      lineas.push(logo);
      lineas.push(Buffer.from('\n'));
    }

    lineas.push(
      `${this.centrarTexto(nombre, 32)}\n`,
      `${this.centrarTexto('COMANDA', 32)}\n`,
      `${this.centrarTexto(`PEDIDO ${pedido.numero}`, 32)}\n`,
      '--------------------------------\n',
      `${this.recortarTexto(nit, 32)}\n`,
      `${this.recortarTexto(direccion, 32)}\n`,
      `${this.recortarTexto(telefono, 32)}\n`,
      `${this.recortarTexto(nombreCliente, 32)}\n`,
      `${this.recortarTexto(telefonoCliente, 32)}\n`,
      `${new Date().toLocaleString('es-CO')}\n`,
      '--------------------------------\n',
    );

    for (const detalle of pedido.detalles || []) {
      lineas.push(
        `${detalle.cantidad}x ${detalle.producto?.nombre || 'Producto'}\n`,
      );
      if (detalle.exclusiones?.length) {
        lineas.push(`   SIN: ${detalle.exclusiones.join(', ')}\n`);
      }
      if (detalle.adicionales?.length) {
        const extras = detalle.adicionales
          .map((a: any) =>
            a.cantidad > 1 ? `${a.nombre} x${a.cantidad}` : a.nombre,
          )
          .join(', ');
        lineas.push(`   ADIC: ${extras}\n`);
      }
      if (detalle.observacion) {
        lineas.push(`   NOTA: ${detalle.observacion}\n`);
      }
    }

    if (pedido.observacion) {
      lineas.push(
        '--------------------------------\n',
        `NOTA: ${pedido.observacion}\n`,
      );
    }
    lineas.push('--------------------------------\n');
    lineas.push('\n');

    return Buffer.concat(
      lineas.map((segmento) =>
        Buffer.isBuffer(segmento) ? segmento : Buffer.from(String(segmento), 'ascii'),
      ),
    );
  }

  private async formatearRecibo(pedido: any, empresaId: number) {
    const empresa = await this.obtenerEmpresa(empresaId);
    const nombre = (empresa?.nombre || 'MI EMPRESA').toUpperCase();
    const nit = empresa?.nit ? `NIT: ${empresa.nit}` : 'NIT: N/A';
    const direccion = empresa?.direccion ? `DIR: ${empresa.direccion}` : 'DIR: N/A';
    const telefono = empresa?.telefono ? `TEL: ${empresa.telefono}` : 'TEL: N/A';
    const nombreCliente = pedido?.cliente?.nombre ? `CLIENTE: ${pedido.cliente.nombre}` : 'CLIENTE: GENERAL';
    const telefonoCliente = pedido?.cliente?.telefono ? `TEL: ${pedido.cliente.telefono}` : 'TEL: NO REGISTRADO';
    const logo = await this.generarLogoEscPos(empresa);

    const lineas: Array<string | Buffer> = ['\n'];

    if (logo.length > 0) {
      lineas.push(logo);
      lineas.push(Buffer.from('\n'));
    }

    lineas.push(
      `${this.centrarTexto(nombre, 32)}\n`,
      `${this.centrarTexto('RECIBO DE PAGO', 32)}\n`,
      `${this.centrarTexto(`${empresa?.tipoNegocio === 'RESTAURANTE' ? 'PEDIDO' : 'VENTA'} ${pedido.numero}`, 32)}\n`,
      '--------------------------------\n',
      `${this.recortarTexto(nit, 32)}\n`,
      `${this.recortarTexto(direccion, 32)}\n`,
      `${this.recortarTexto(telefono, 32)}\n`,
      `${this.recortarTexto(nombreCliente, 32)}\n`,
      `${this.recortarTexto(telefonoCliente, 32)}\n`,
      `${new Date().toLocaleString('es-CO')}\n`,
      '--------------------------------\n',
    );

    let total = Number(pedido.total ?? 0);
    for (const detalle of pedido.detalles || []) {
      const subtotal = Number(detalle.subtotal ?? (Number(detalle.precioUnitario ?? detalle.precio ?? 0) * Number(detalle.cantidad ?? 1)));
      lineas.push(
        `${detalle.cantidad}x ${detalle.producto?.nombre || 'Producto'} ${subtotal.toFixed(0)}\n`,
      );
      if (detalle.exclusiones?.length) {
        lineas.push(`   SIN: ${detalle.exclusiones.join(', ')}\n`);
      }
      if (detalle.adicionales?.length) {
        const extras = detalle.adicionales
          .map((a: any) =>
            a.cantidad > 1 ? `${a.nombre} x${a.cantidad}` : a.nombre,
          )
          .join(', ');
        lineas.push(`   ADIC: ${extras}\n`);
      }
      if (detalle.observacion) {
        lineas.push(`   NOTA: ${detalle.observacion}\n`);
      }
    }

    lineas.push('--------------------------------\n');
    if (pedido.observacion) {
      lineas.push(`NOTA: ${pedido.observacion}\n`);
    }
    lineas.push(`TOTAL: ${total.toFixed(0)}\n`);
    if (pedido.metodoPago) {
      lineas.push(`PAGO: ${pedido.metodoPago}\n`);
    }
    lineas.push('--------------------------------\n');
    lineas.push('\nGracias por su compra\n\n');

    return Buffer.concat(
      lineas.map((segmento) =>
        Buffer.isBuffer(segmento) ? segmento : Buffer.from(String(segmento), 'ascii'),
      ),
    );
  }
}
