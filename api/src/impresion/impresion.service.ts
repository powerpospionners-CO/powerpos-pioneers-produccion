import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Socket } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';
import { ImpresionEventosService } from './impresion-eventos.service';
import { reciboTrailer } from './recibo-trailer';
import { codificarLogoEscPos } from './logo-escpos';

const sharp: typeof import('sharp').default = require('sharp');

const INICIO = Buffer.from([0x1b, 0x40]);
const CORTE = Buffer.from([0x1d, 0x56, 0x41, 0x03]);
const CAJON = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
// ESC E 1/0: negrita on/off. Es el comando ESC/POS más universal que
// existe — lo soporta cualquier impresora térmica, a diferencia de ancho
// doble (que rompería el cálculo de centrado basado en caracteres).
const NEGRITA_ON = Buffer.from([0x1b, 0x45, 0x01]);
const NEGRITA_OFF = Buffer.from([0x1b, 0x45, 0x00]);
const TIMEOUT_MS = 3000;
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

// Mensaje de fe al pie de la tirilla para Enchila Market (2) y Trailer (1).
// No se activa para las demás empresas. Son
// bendiciones cortas y cálidas, no citas bíblicas formales — la idea es
// alegrarle el día a quien las lee, no que suene a lectura de iglesia.
const MENSAJES_FE: string[] = [
  'Que Dios bendiga tu día',
  'Que tengas un día lleno de luz',
  'Dios te acompañe hoy y siempre',
  'Eres una bendición hoy',
  'Que tu día esté lleno de alegría',
  'Dios te ama, que tengas buen día',
  'Dios tiene un buen plan para ti',
  'La bondad de Dios te acompaña',
  'Hoy es un buen día para brillar',
  'Que la paz de Dios te acompañe',
];

@Injectable()
export class ImpresionService {
  private readonly logger = new Logger(ImpresionService.name);
  // El logo se descarga y se convierte a formato ESC/POS en cada recibo;
  // como no cambia entre una venta y otra, se guarda en memoria por URL para
  // no repetir ese trabajo (y ese riesgo de red) en cada impresión.
  private readonly cacheLogos = new Map<string, Buffer>();

  constructor(
    private readonly prisma?: PrismaService,
    private readonly eventos?: ImpresionEventosService,
  ) {}

  private modoAgente() {
    return (process.env.IMPRESION_MODO || 'tcp').toLowerCase() === 'agente';
  }

  // Cuando el backend corre en la nube (Railway) no puede alcanzar una
  // impresora en la red local del negocio. En ese caso, en vez de intentar
  // una conexión TCP que siempre va a fallar, el trabajo se le pasa al
  // agente local (ver api/agente-impresion/) que sí tiene acceso a la
  // impresora, y se espera su confirmación.
  private async enviarAgenteOTcp(
    empresaId: number,
    tipo: 'TICKET' | 'COMANDA' | 'CAJON' | 'CIERRE',
    datos: Buffer,
    host?: string,
    port?: number,
    timeoutAgenteMs?: number,
  ): Promise<string | null> {
    if (this.modoAgente()) {
      if (!this.eventos) return 'Agente de impresión no disponible en este servidor';
      const resultado = await this.eventos.enviarYEsperar(empresaId, tipo, datos, timeoutAgenteMs);
      return resultado.ok ? null : resultado.motivo || 'El agente de impresión no confirmó la impresión';
    }
    if (!host) return 'Falta ESC_POS_HOST';
    return this.enviarTcp(host, port || 9100, datos);
  }

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
    const modo = this.modoAgente() ? 'agente' : 'tcp';
    const host = process.env.ESC_POS_HOST;
    const port = Number(process.env.ESC_POS_PORT || 9100);

    const error = await this.enviarAgenteOTcp(
      empresaId,
      'COMANDA',
      Buffer.concat([INICIO, contenido, CORTE]),
      host,
      port,
    );

    if (error) {
      this.logger.warn(`No se pudo imprimir la comanda (${modo}): ${error}`);
      return { impreso: false, modo, fallbackBrowser: true, motivo: error };
    }

    return { impreso: true, modo };
  }

  /** Un solo envío al agente/puerto para que las estaciones no se interrumpan. */
  async imprimirComandas(comandas: any[], empresaId: number, abrirCajon = false) {
    if (empresaId !== 1 || !Array.isArray(comandas) || comandas.length < 1 || comandas.length > 2 ||
      comandas.some(c => !['PLANCHA', 'VAPORERA', 'PERROS Y FRITURAS'].includes(c?.ladoNombre) || !Array.isArray(c.detalles) || !c.detalles.length) ||
      new Set(comandas.map(c => c.ladoNombre)).size !== comandas.length)
      throw new BadRequestException('Selecciona una o las dos estaciones del Trailer para imprimir.');
    if (String(process.env.ESC_POS_ENABLED).toLowerCase() !== 'true')
      return { impreso: false, modo: 'browser', fallbackBrowser: true, motivo: 'ESC_POS_ENABLED no está activo' };
    const partes: Buffer[] = abrirCajon ? [INICIO, CAJON] : [];
    const empresa = await this.obtenerEmpresa(empresaId);
    for (const comanda of comandas) partes.push(INICIO, await this.formatearComanda(comanda, empresaId, empresa), CORTE);
    const modo = this.modoAgente() ? 'agente' : 'tcp';
    const error = await this.enviarAgenteOTcp(empresaId, 'COMANDA', Buffer.concat(partes), process.env.ESC_POS_HOST, Number(process.env.ESC_POS_PORT || 9100), 15000);
    if (error) {
      this.logger.warn(`No se pudo imprimir el lote de comandas (${modo}): ${error}`);
      return { impreso: false, modo, fallbackBrowser: true, motivo: error };
    }
    return { impreso: true, modo, estaciones: comandas.map(c => c.ladoNombre), ...(abrirCajon ? { cajonEnviado: true } : {}) };
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
    const modo = this.modoAgente() ? 'agente' : 'tcp';
    const host = process.env.ESC_POS_HOST;
    const port = Number(process.env.ESC_POS_PORT || 9100);

    const error = await this.enviarAgenteOTcp(
      empresaId,
      'TICKET',
      Buffer.concat([INICIO, contenido, CORTE]),
      host,
      port,
      15000,
    );

    if (error) {
      this.logger.warn(`No se pudo imprimir el recibo (${modo}): ${error}`);
      return { impreso: false, modo, fallbackBrowser: true, motivo: error };
    }

    return { impreso: true, modo };
  }

  // Tirilla de cierre de caja (tipo "reporte Z"): se manda al agente/impresora
  // como efecto del cierre, igual que un ticket de venta. Si no hay agente
  // conectado simplemente no imprime nada (el admin igual puede ver el mismo
  // desglose desde la pantalla de historial de caja).
  async imprimirCierreCaja(resumen: any, empresaId: number) {
    if (String(process.env.ESC_POS_ENABLED).toLowerCase() !== 'true') {
      return { impreso: false, modo: 'browser', fallbackBrowser: false, motivo: 'ESC_POS_ENABLED no está activo' };
    }

    const contenido = await this.formatearCierreCaja(resumen, empresaId);
    const modo = this.modoAgente() ? 'agente' : 'tcp';
    const host = process.env.ESC_POS_HOST;
    const port = Number(process.env.ESC_POS_PORT || 9100);

    const error = await this.enviarAgenteOTcp(empresaId, 'CIERRE', Buffer.concat([INICIO, contenido, CORTE]), host, port);

    if (error) {
      this.logger.warn(`No se pudo imprimir el cierre de caja (${modo}): ${error}`);
      return { impreso: false, modo, motivo: error };
    }

    return { impreso: true, modo };
  }

  async abrirCajon(empresaId: number) {
    if (String(process.env.ESC_POS_ENABLED).toLowerCase() !== 'true') {
      return { abierto: false, motivo: 'ESC_POS_ENABLED no está activo' };
    }

    const host = process.env.ESC_POS_HOST;
    const port = Number(process.env.ESC_POS_PORT || 9100);

    const error = await this.enviarAgenteOTcp(empresaId, 'CAJON', CAJON, host, port);

    if (error) {
      this.logger.warn(`No se pudo abrir el cajón: ${error}`);
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

  private envolverDireccion(direccion: string, ancho = 32) {
    let restante = String(direccion ?? '').replace(/\s+/g, ' ').trim();
    if (!restante) return [];

    const lineas: string[] = [];
    let prefijo = 'DIR: ';
    while (restante) {
      const capacidad = ancho - prefijo.length;
      if (restante.length <= capacidad) {
        lineas.push(`${prefijo}${restante}\n`);
        break;
      }

      let corte = restante.lastIndexOf(' ', capacidad);
      if (corte <= 0) corte = capacidad;
      lineas.push(`${prefijo}${restante.slice(0, corte)}\n`);
      restante = restante.slice(corte).trimStart();
      prefijo = '     ';
    }

    return lineas;
  }

  // 'es-CO' solo define el formato (DD/MM/AAAA), no la zona horaria — sin
  // esto, en un servidor que corre en UTC la tirilla sale con la hora 5
  // horas adelantada a la hora real de Colombia.
  private fechaBogota(fecha: Date) {
    return fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  }

  private moneda(valor: number) {
    return `$${Math.round(valor).toLocaleString('es-CO')}`;
  }

  // La tirilla se manda en ASCII puro: una tilde o "ñ" no se descarta sola,
  // se corrompe en otra letra (ej. "Postobón" sale "Postobsn"). Quitar los
  // acentos antes da un texto más feo pero siempre legible, sin depender de
  // qué tabla de caracteres tenga activa esa impresora en particular.
  private quitarAcentos(texto: string) {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Envuelve un texto en negrita — se usa para lo que de verdad debe
  // resaltar en el recibo (nombre del negocio, el total), en vez de que
  // todo el texto se vea con el mismo peso visual.
  private negrita(texto: string): Array<string | Buffer> {
    return [NEGRITA_ON, texto, NEGRITA_OFF];
  }

  private aBufferAscii(lineas: Array<string | Buffer>): Buffer {
    return Buffer.concat(
      lineas.map((segmento) =>
        Buffer.isBuffer(segmento) ? segmento : Buffer.from(this.quitarAcentos(String(segmento)), 'ascii'),
      ),
    );
  }

  // Monto alineado a la derecha, como una columna de precios — si la
  // etiqueta ya ocupa todo el ancho, el monto simplemente sigue a continuación.
  private lineaMonto(etiqueta: string, valor: number, ancho = 32) {
    const monto = this.moneda(valor);
    const espacio = Math.max(1, ancho - etiqueta.length - monto.length);
    return `${etiqueta}${' '.repeat(espacio)}${monto}`;
  }

  private async generarLogoEscPos(empresa: any): Promise<Buffer> {
    if (!empresa?.logo) {
      return Buffer.from('');
    }

    const logoUrl = String(empresa.logo).trim();
    if (!logoUrl) return Buffer.from('');

    const enCache = this.cacheLogos.get(logoUrl);
    if (enCache) return enCache;

    try {
      let urlValida: URL;
      try {
        urlValida = new URL(logoUrl);
      } catch {
        return Buffer.from('');
      }

      if (!['http:', 'https:'].includes(urlValida.protocol)) {
        return Buffer.from('');
      }

      // Sin límite de tiempo ni de tamaño, un logo pesado (subido a
      // resolución completa) puede dejar la petición colgada el tiempo
      // suficiente para que el proxy tumbe la conexión con el agente de
      // impresión — por eso ambos límites son obligatorios aquí.
      const respuesta = await fetch(logoUrl, {
        headers: { 'User-Agent': 'PowerPos-Printer/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (!respuesta.ok) return Buffer.from('');

      const contentType = respuesta.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) return Buffer.from('');

      const largoDeclarado = Number(respuesta.headers.get('content-length') || 0);
      if (largoDeclarado > LOGO_MAX_BYTES) {
        this.logger.warn(`Logo de empresa demasiado pesado (${largoDeclarado} bytes), se omite del recibo: ${logoUrl}`);
        return Buffer.from('');
      }

      const buffer = Buffer.from(await respuesta.arrayBuffer());
      if (buffer.length > LOGO_MAX_BYTES) {
        this.logger.warn(`Logo de empresa demasiado pesado (${buffer.length} bytes), se omite del recibo: ${logoUrl}`);
        return Buffer.from('');
      }
      const { data, info } = await sharp(buffer)
        .resize({ width: 300, height: 120, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .removeAlpha()
        .grayscale()
        .normalize()
        .threshold(180)
        .raw()
        .toBuffer({ resolveWithObject: true });

      if (info.channels !== 1) throw new Error('El logo debe tener un solo canal de grises');
      const resultado = codificarLogoEscPos(data, info.width, info.height);
      this.cacheLogos.set(logoUrl, resultado);
      return resultado;
    } catch (error) {
      this.logger.warn(`No se pudo preparar el logo para el recibo (${logoUrl}): ${error instanceof Error ? error.message : error}`);
      return Buffer.from('');
    }
  }

  private async formatearComanda(pedido: any, empresaId: number, datosEmpresa?: any) {
    const empresa = datosEmpresa === undefined ? await this.obtenerEmpresa(empresaId) : datosEmpresa;
    const nombre = (empresa?.nombre || 'MI EMPRESA').toUpperCase();
    const nit = empresa?.nit ? `NIT: ${empresa.nit}` : 'NIT: N/A';
    const direccion = empresa?.direccion ? `DIR: ${empresa.direccion}` : 'DIR: N/A';
    const telefono = empresa?.telefono ? `TEL: ${empresa.telefono}` : 'TEL: N/A';
    const nombreCliente = pedido?.cliente?.nombre ? `CLIENTE: ${pedido.cliente.nombre}` : 'CLIENTE: GENERAL';
    const telefonoCliente = pedido?.cliente?.telefono ? `TEL: ${pedido.cliente.telefono}` : 'TEL: NO REGISTRADO';
    // Cocina necesita texto inmediato; no descargar ni procesar imágenes al cobrar.
    const logo = empresaId === 1 ? Buffer.alloc(0) : await this.generarLogoEscPos(empresa);

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
      ...(empresaId === 1 && pedido.ladoNombre ? [NEGRITA_ON, `${this.centrarTexto(String(pedido.ladoNombre), 32)}\n`, NEGRITA_OFF] : []),
      `${this.centrarTexto(`PEDIDO ${pedido.numero}`, 32)}\n`,
      '--------------------------------\n',
      `${this.recortarTexto(nit, 32)}\n`,
      `${this.recortarTexto(direccion, 32)}\n`,
      `${this.recortarTexto(telefono, 32)}\n`,
      `${this.recortarTexto(nombreCliente, 32)}\n`,
      `${this.recortarTexto(telefonoCliente, 32)}\n`,
      `${this.fechaBogota(new Date())}\n`,
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

    return this.aBufferAscii(lineas);
  }

  private async formatearRecibo(pedido: any, empresaId: number) {
    const empresa = await this.obtenerEmpresa(empresaId);
    if (empresaId === 1) return reciboTrailer(pedido, empresa, await this.generarLogoEscPos(empresa), MENSAJES_FE[Math.floor(Math.random() * MENSAJES_FE.length)]);
    // Enchila usa 80 mm; las demás empresas conservan su formato.
    const ancho = empresaId === 2 ? 48 : 32;
    const separador = (caracter: string) => caracter.repeat(ancho) + '\n';
    const nombre = (empresa?.nombre || 'MI EMPRESA').toUpperCase();
    const esRestaurante = empresa?.tipoNegocio === 'RESTAURANTE';
    const logo = await this.generarLogoEscPos(empresa);

    const lineas: Array<string | Buffer> = ['\n'];

    if (logo.length > 0) {
      lineas.push(logo);
      lineas.push(Buffer.from('\n'));
    }

    // Encabezado: solo se imprimen los datos de contacto que la empresa
    // realmente tiene cargados — una tirilla con "NIT: N/A" en cada venta
    // se ve descuidada, mejor omitir la línea directamente.
    lineas.push(
      ...this.negrita(`${this.centrarTexto(nombre, ancho)}\n`),
      `${this.centrarTexto(esRestaurante ? 'PEDIDO' : 'VENTA', ancho)}\n`,
      `${this.centrarTexto(pedido.numero, ancho)}\n`,
    );
    if (empresa?.nit) lineas.push(`${this.centrarTexto(`NIT ${empresa.nit}`, ancho)}\n`);
    if (empresa?.direccion) lineas.push(...this.envolverDireccion(empresa.direccion, ancho));
    if (empresa?.telefono) lineas.push(`${this.centrarTexto(`Tel ${empresa.telefono}`, ancho)}\n`);
    lineas.push(separador('='));
    lineas.push(`Fecha: ${this.fechaBogota(new Date())}\n`);
    if (pedido.usuario?.nombre) lineas.push(`Cajero: ${this.recortarTexto(pedido.usuario.nombre, ancho - 8)}\n`);
    if (pedido.cliente?.nombre) lineas.push(`Cliente: ${this.recortarTexto(pedido.cliente.nombre, ancho - 9)}\n`);
    lineas.push(separador('-'));

    // Cada producto en dos líneas (nombre, luego el precio alineado a la
    // derecha) para que el precio quede siempre en la misma columna, sin
    // importar qué tan largo sea el nombre del producto.
    const subtotal = Number(pedido.subtotal ?? pedido.total ?? 0);
    const descuento = Number(pedido.descuento ?? 0);
    const total = Number(pedido.total ?? 0);
    for (const detalle of pedido.detalles || []) {
      const subtotalItem = Number(detalle.subtotal ?? (Number(detalle.precioUnitario ?? detalle.precio ?? 0) * Number(detalle.cantidad ?? 1)));
      const nombreBase = detalle.producto?.nombre || 'Producto';
      const nombreConSabor = detalle.varianteSabor ? `${nombreBase} — ${detalle.varianteSabor}` : nombreBase;
      const nombreItem = detalle.presentacionNombre ? `${nombreConSabor} (${detalle.presentacionNombre})` : nombreConSabor;
      lineas.push(`${detalle.cantidad}x ${this.recortarTexto(nombreItem, ancho - 3)}\n`);
      lineas.push(`${this.moneda(subtotalItem).padStart(ancho, ' ')}\n`);
      if (detalle.exclusiones?.length) {
        lineas.push(`   Sin: ${detalle.exclusiones.join(', ')}\n`);
      }
      if (detalle.adicionales?.length) {
        const extras = detalle.adicionales
          .map((a: any) =>
            a.cantidad > 1 ? `${a.nombre} x${a.cantidad}` : a.nombre,
          )
          .join(', ');
        lineas.push(`   Adic: ${extras}\n`);
      }
      if (detalle.observacion) {
        lineas.push(`   Nota: ${detalle.observacion}\n`);
      }
    }

    lineas.push(separador('-'));
    if (pedido.observacion) {
      lineas.push(`Nota: ${pedido.observacion}\n`, separador('-'));
    }
    if (descuento > 0) {
      lineas.push(`${this.lineaMonto('Subtotal', subtotal, ancho)}\n`);
      lineas.push(`${this.lineaMonto('Descuento', -descuento, ancho)}\n`);
    }
    lineas.push(...this.negrita(`${this.lineaMonto('TOTAL', total, ancho)}\n`));
    lineas.push(separador('-'));
    if (Array.isArray(pedido.pagos) && pedido.pagos.length > 1) {
      for (const pago of pedido.pagos) {
        lineas.push(`${this.lineaMonto(pago.metodoPago, Number(pago.monto), ancho)}\n`);
      }
    } else if (pedido.metodoPago) {
      lineas.push(pedido.metodoPago === 'CREDITO' ? 'A CREDITO - PENDIENTE DE COBRO\n' : `Pago: ${pedido.metodoPago}\n`);
    }

    // Cuánto pagó en efectivo y cuánto se le devolvió — solo aplica si hubo
    // vuelto (pago con un billete más grande que el total en efectivo).
    const cambio = Number(pedido.cambio ?? 0);
    if (cambio > 0) {
      const efectivoAtribuido = Number(
        (Array.isArray(pedido.pagos) ? pedido.pagos.find((p: any) => p.metodoPago === 'EFECTIVO')?.monto : undefined) ?? total,
      );
      lineas.push(separador('-'));
      lineas.push(`${this.lineaMonto('Recibido', efectivoAtribuido + cambio, ancho)}\n`);
      lineas.push(`${this.lineaMonto('Cambio', cambio, ancho)}\n`);
    }

    lineas.push(separador('='));
    lineas.push(...this.negrita(`${this.centrarTexto('GRACIAS POR SU COMPRA', ancho)}\n`));
    lineas.push(`${this.centrarTexto('Vuelva pronto', ancho)}\n`);

    if (empresaId === 2) {
      const mensaje = MENSAJES_FE[Math.floor(Math.random() * MENSAJES_FE.length)];
      lineas.push('\n');
      lineas.push(`${this.centrarTexto(mensaje, ancho)}\n`);
    }
    lineas.push('\n');

    return this.aBufferAscii(lineas);
  }

  private async formatearCierreCaja(resumen: any, empresaId: number) {
    const empresa = await this.obtenerEmpresa(empresaId);
    const nombre = (empresa?.nombre || 'MI EMPRESA').toUpperCase();
    const logo = await this.generarLogoEscPos(empresa);

    const lineas: Array<string | Buffer> = ['\n'];
    if (logo.length > 0) {
      lineas.push(logo, Buffer.from('\n'));
    }

    lineas.push(
      `${this.centrarTexto(nombre, 32)}\n`,
      `${this.centrarTexto('CIERRE DE CAJA', 32)}\n`,
      '--------------------------------\n',
      `${this.recortarTexto(`CAJERO: ${resumen.cajeroNombre || ''}`, 32)}\n`,
      `${this.recortarTexto(`SUCURSAL: ${resumen.sucursalNombre || ''}`, 32)}\n`,
      `${this.recortarTexto(`APERTURA: ${this.fechaBogota(new Date(resumen.abiertaEn))}`, 32)}\n`,
      `${this.recortarTexto(`CIERRE: ${this.fechaBogota(new Date(resumen.cerradaEn))}`, 32)}\n`,
      '--------------------------------\n',
      `${this.recortarTexto(`VENTAS DEL TURNO: ${resumen.cantidadVentas}`, 32)}\n`,
      `TOTAL VENDIDO: ${Number(resumen.totalVentas).toFixed(0)}\n`,
      '--------------------------------\n',
      'POR MEDIO DE PAGO\n',
    );
    for (const p of resumen.ventasPorMetodoPago || []) {
      lineas.push(`${this.recortarTexto(p.metodo, 20)}${String(Number(p.total).toFixed(0)).padStart(12, ' ')}\n`);
    }
    lineas.push(
      '--------------------------------\n',
      `BASE INICIAL: ${Number(resumen.montoInicial).toFixed(0)}\n`,
      ...(resumen.retiroEfectivo
        ? [
            `EFECTIVO RETIRADO: ${Number(resumen.retiroEfectivo.montoRetirado).toFixed(0)}\n`,
            `VENTAS PARA RECAUDO: ${Number(resumen.retiroEfectivo.montoEsperado).toFixed(0)}\n`,
          ]
        : []),
      `EFECTIVO ESPERADO: ${Number(resumen.montoEsperado).toFixed(0)}\n`,
      `EFECTIVO CONTADO: ${Number(resumen.montoFinal).toFixed(0)}\n`,
      `DIFERENCIA: ${Number(resumen.diferencia).toFixed(0)}\n`,
    );
    if (resumen.productosVendidos?.length) {
      lineas.push(
        '--------------------------------\n',
        'PRODUCTOS VENDIDOS\n',
      );
      for (const p of resumen.productosVendidos) {
        const nombre = p.presentacionNombre
          ? `${p.nombre} (${p.presentacionNombre})`
          : p.nombre;
        lineas.push(`${p.cantidad}x ${nombre}\n`);
      }
    }
    lineas.push('--------------------------------\n', '\n\n');

    return this.aBufferAscii(lineas);
  }
}
