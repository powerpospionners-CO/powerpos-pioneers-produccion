import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as XLSX from 'xlsx';
import PDFDocument = require('pdfkit');
const sharp: typeof import('sharp').default = require('sharp');
import { PrismaService } from '../prisma/prisma.service';

const QUITAR_ACENTOS = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
const NORMALIZAR_ENCABEZADO = (texto: string) => QUITAR_ACENTOS(String(texto || '').toLowerCase().trim());

// Palabras demasiado comunes como para servir de pista al emparejar un
// nombre de archivo con un producto (ej. "de", "x") — se ignoran para que
// el puntaje de coincidencia se base en las palabras que sí identifican el producto.
const PALABRAS_IGNORADAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'x', 'con', 'y', 'para']);

function normalizarTexto(texto: string): string {
  return QUITAR_ACENTOS(String(texto || '').toLowerCase())
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensDeNombre(texto: string): string[] {
  return normalizarTexto(texto)
    .split(' ')
    .filter((t) => t.length > 1 && !PALABRAS_IGNORADAS.has(t));
}

// Proporción de palabras del archivo que aparecen en el nombre del producto,
// sobre el más corto de los dos (para no penalizar nombres de producto largos).
function puntajeCoincidencia(tokensArchivo: string[], tokensProducto: string[]): number {
  if (!tokensArchivo.length || !tokensProducto.length) return 0;
  const set = new Set(tokensProducto);
  const coincidentes = tokensArchivo.filter((t) => set.has(t)).length;
  return coincidentes / Math.min(tokensArchivo.length, tokensProducto.length);
}

const SINONIMOS_COLUMNAS: Record<string, string[]> = {
  nombre: ['nombre', 'producto', 'nombre del producto', 'articulo'],
  categoria: ['categoria', 'linea', 'familia', '#producto'],
  presentacion: ['presentacion', 'tamano', 'gramaje', 'peso', 'contenido'],
  precio: ['precio', 'precio de venta', 'precio venta', 'precio sugerido', 'p. publico', 'p publico'],
  descripcion: ['descripcion', 'detalle'],
};

function textoOpcional(valor: unknown, campo: string, max: number, requerido = false): string | null {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (requerido) throw new BadRequestException(`${campo} es obligatorio`);
    return null;
  }
  const limpio = String(valor).trim();
  if (limpio.length > max) throw new BadRequestException(`${campo} es demasiado largo`);
  return limpio;
}

@Injectable()
export class CatalogoService {
  constructor(private prisma: PrismaService) {}

  private async verificarHabilitado(empresaId: number) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { catalogoHabilitado: true } });
    if (!empresa?.catalogoHabilitado) throw new ForbiddenException('El catálogo no está habilitado para esta empresa');
  }

  async listar(empresaId: number) {
    await this.verificarHabilitado(empresaId);
    return this.prisma.catalogoProducto.findMany({
      where: { empresaId },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async crear(datos: any, empresaId: number) {
    await this.verificarHabilitado(empresaId);
    const nombre = textoOpcional(datos.nombre, 'El nombre', 150, true) as string;
    const categoria = textoOpcional(datos.categoria, 'La categoría', 80);
    const presentacion = textoOpcional(datos.presentacion, 'La presentación', 60);
    const descripcion = textoOpcional(datos.descripcion, 'La descripción', 500);
    const precio = this.validarPrecio(datos.precio);
    return this.prisma.catalogoProducto.create({
      data: { empresaId, nombre, categoria, presentacion, descripcion, precio },
    });
  }

  private validarPrecio(valor: unknown): number | null {
    if (valor === undefined || valor === null || valor === '') return null;
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) throw new BadRequestException('El precio debe ser un número no negativo');
    return numero;
  }

  private async obtener(id: number, empresaId: number) {
    const item = await this.prisma.catalogoProducto.findFirst({ where: { id, empresaId } });
    if (!item) throw new NotFoundException('Producto de catálogo no encontrado');
    return item;
  }

  async actualizar(id: number, datos: any, empresaId: number) {
    await this.verificarHabilitado(empresaId);
    await this.obtener(id, empresaId);
    const data: any = {};
    if (datos.nombre !== undefined) data.nombre = textoOpcional(datos.nombre, 'El nombre', 150, true);
    if (datos.categoria !== undefined) data.categoria = textoOpcional(datos.categoria, 'La categoría', 80);
    if (datos.presentacion !== undefined) data.presentacion = textoOpcional(datos.presentacion, 'La presentación', 60);
    if (datos.descripcion !== undefined) data.descripcion = textoOpcional(datos.descripcion, 'La descripción', 500);
    if (datos.precio !== undefined) data.precio = this.validarPrecio(datos.precio);
    if (datos.activo !== undefined) data.activo = !!datos.activo;
    if (datos.orden !== undefined) data.orden = Number.isInteger(datos.orden) ? datos.orden : 0;
    return this.prisma.catalogoProducto.update({ where: { id }, data });
  }

  async eliminar(id: number, empresaId: number) {
    await this.verificarHabilitado(empresaId);
    await this.obtener(id, empresaId);
    await this.prisma.catalogoProducto.delete({ where: { id } });
    return { ok: true };
  }

  async actualizarImagen(id: number, empresaId: number, imagen: string) {
    await this.verificarHabilitado(empresaId);
    await this.obtener(id, empresaId);
    return this.prisma.catalogoProducto.update({ where: { id }, data: { imagen } });
  }

  async importarExcel(buffer: Buffer, empresaId: number) {
    await this.verificarHabilitado(empresaId);
    let libro: XLSX.WorkBook;
    try {
      libro = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido.');
    }
    const hoja = libro.Sheets[libro.SheetNames[0]];
    if (!hoja) throw new BadRequestException('El archivo no tiene hojas con datos');
    const filas: Record<string, any>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
    if (filas.length === 0) throw new BadRequestException('El archivo no tiene filas con datos');
    if (filas.length > 1000) throw new BadRequestException('El archivo tiene demasiadas filas (máximo 1000 por importación)');

    const encabezadosReales = Object.keys(filas[0]);
    const mapaCampos: Record<string, string> = {};
    for (const encabezado of encabezadosReales) {
      const normalizado = NORMALIZAR_ENCABEZADO(encabezado);
      const campo = Object.entries(SINONIMOS_COLUMNAS).find(([, sinonimos]) =>
        sinonimos.some((s) => NORMALIZAR_ENCABEZADO(s) === normalizado),
      )?.[0];
      if (campo) mapaCampos[campo] = encabezado;
    }
    if (!mapaCampos.nombre) {
      throw new BadRequestException('El archivo debe tener al menos la columna "nombre"');
    }

    let creados = 0;
    const errores: { fila: number; motivo: string }[] = [];
    const existentes = await this.prisma.catalogoProducto.count({ where: { empresaId } });

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const numeroFila = i + 2;
      try {
        const nombre = String(fila[mapaCampos.nombre] ?? '').trim();
        if (!nombre) { errores.push({ fila: numeroFila, motivo: 'Falta el nombre del producto' }); continue; }

        let precio: number | null = null;
        if (mapaCampos.precio && fila[mapaCampos.precio] !== '') {
          const valor = Number(String(fila[mapaCampos.precio]).replace(/[^0-9.,-]/g, '').replace(',', '.'));
          if (!Number.isFinite(valor) || valor < 0) { errores.push({ fila: numeroFila, motivo: 'El precio debe ser un número no negativo' }); continue; }
          precio = valor;
        }

        const categoria = mapaCampos.categoria ? String(fila[mapaCampos.categoria] ?? '').trim() || null : null;
        const presentacion = mapaCampos.presentacion ? String(fila[mapaCampos.presentacion] ?? '').trim() || null : null;
        const descripcion = mapaCampos.descripcion ? String(fila[mapaCampos.descripcion] ?? '').trim() || null : null;

        await this.prisma.catalogoProducto.create({
          data: { empresaId, nombre, precio, categoria, presentacion, descripcion, orden: existentes + creados },
        });
        creados++;
      } catch (e) {
        errores.push({ fila: numeroFila, motivo: e instanceof Error ? e.message : 'Error al crear el producto' });
      }
    }

    return { creados, totalFilas: filas.length, errores };
  }

  // Recibe varias imágenes sueltas (ej. exportadas con el nombre del
  // producto) y las empareja con el catálogo por similitud de nombre, sin
  // que el admin tenga que asignarlas una por una. Si el nombre del archivo
  // no se parece lo suficiente a ningún producto, o se parece por igual a
  // más de uno, se deja fuera para que se asigne a mano desde "Editar".
  async importarImagenes(archivos: Express.Multer.File[], empresaId: number) {
    await this.verificarHabilitado(empresaId);
    const items = await this.prisma.catalogoProducto.findMany({
      where: { empresaId },
      select: { id: true, nombre: true, presentacion: true },
    });
    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const asignados: { archivo: string; producto: string }[] = [];
    const sinCoincidencia: { archivo: string; motivo: string }[] = [];

    for (const archivo of archivos) {
      try {
        const reducido = await sharp(archivo.path)
          .rotate()
          .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
          .toBuffer();
        await fs.writeFile(archivo.path, reducido);
      } catch {
        // Si sharp no puede procesarla (formato raro, etc.) se deja la original.
      }

      const tokensArchivo = tokensDeNombre(archivo.originalname);
      let mejor: { item: (typeof items)[number]; score: number } | null = null;
      let empatados = 0;
      for (const item of items) {
        const score = puntajeCoincidencia(tokensArchivo, tokensDeNombre(`${item.nombre} ${item.presentacion || ''}`));
        if (score <= 0) continue;
        if (!mejor || score > mejor.score) {
          mejor = { item, score };
          empatados = 1;
        } else if (score === mejor.score) {
          empatados++;
        }
      }

      if (!mejor || mejor.score < 0.5) {
        sinCoincidencia.push({ archivo: archivo.originalname, motivo: 'No se encontró un producto con nombre parecido' });
        await fs.unlink(archivo.path).catch(() => undefined);
        continue;
      }
      if (empatados > 1) {
        sinCoincidencia.push({ archivo: archivo.originalname, motivo: 'El nombre coincide con más de un producto; asígnala manualmente' });
        await fs.unlink(archivo.path).catch(() => undefined);
        continue;
      }

      const imagen = `${baseUrl}/uploads/catalogo/${archivo.filename}`;
      await this.prisma.catalogoProducto.update({ where: { id: mejor.item.id }, data: { imagen } });
      asignados.push({ archivo: archivo.originalname, producto: mejor.item.nombre });
    }

    return { asignados, sinCoincidencia, total: archivos.length };
  }

  private async empresaPorSlug(slug: string) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { tiendaSlug: slug },
      select: { id: true, nombre: true, logo: true, telefono: true, activo: true, tiendaConfig: true, catalogoHabilitado: true },
    });
    if (!empresa || !empresa.activo || !empresa.catalogoHabilitado) throw new NotFoundException('Catálogo no disponible');
    return empresa;
  }

  async catalogoPublico(slug: string) {
    const empresa = await this.empresaPorSlug(slug);
    const items = await this.prisma.catalogoProducto.findMany({
      where: { empresaId: empresa.id, activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    const color = (empresa.tiendaConfig as any)?.color || '#0f766e';
    return {
      nombre: empresa.nombre,
      logo: empresa.logo,
      telefono: empresa.telefono,
      color,
      productos: items,
    };
  }

  async generarPDF(empresaId: number) {
    await this.verificarHabilitado(empresaId);
    const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true, logo: true, telefono: true, tiendaConfig: true } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const items = await this.prisma.catalogoProducto.findMany({
      where: { empresaId, activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    const color = (empresa.tiendaConfig as any)?.color || '#0f766e';
    return this.construirPDF(empresa.nombre, color, items);
  }

  async generarPDFPublico(slug: string) {
    const empresa = await this.empresaPorSlug(slug);
    const items = await this.prisma.catalogoProducto.findMany({
      where: { empresaId: empresa.id, activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    const color = (empresa.tiendaConfig as any)?.color || '#0f766e';
    return this.construirPDF(empresa.nombre, color, items);
  }

  private async descargarImagen(url: string): Promise<Buffer | null> {
    try {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!respuesta.ok) return null;
      const arrayBuffer = await respuesta.arrayBuffer();
      return await sharp(Buffer.from(arrayBuffer))
        .rotate().resize(480, 480, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toBuffer();
    } catch {
      return null;
    }
  }

  private async construirPDF(nombreEmpresa: string, color: string, items: any[]): Promise<Buffer> {
    const imagenesPorItem = new Map<number, Buffer | null>();
    const urlVistas = new Map<string, Buffer | null>();
    const urls = [...new Set(items.map(item => item.imagen).filter(Boolean))] as string[];
    let siguiente = 0;
    // Un catálogo puede tener cientos de presentaciones. Descargar cada foto
    // una sola vez y con concurrencia limitada evita esperar una por una.
    await Promise.all(Array.from({ length: Math.min(6, urls.length) }, async () => {
      while (siguiente < urls.length) {
        const url = urls[siguiente++];
        urlVistas.set(url, await this.descargarImagen(url));
      }
    }));
    for (const item of items) {
      if (!item.imagen) continue;
      imagenesPorItem.set(item.id, urlVistas.get(item.imagen) ?? null);
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const trozos: Buffer[] = [];
      doc.on('data', (c) => trozos.push(c));
      doc.on('end', () => resolve(Buffer.concat(trozos)));
      doc.on('error', reject);

      const anchoPagina = doc.page.width;
      const altoPagina = doc.page.height;

      const encabezado = () => {
        doc.rect(0, 0, anchoPagina, 96).fill(color);
        doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text(nombreEmpresa, 40, 30, { width: anchoPagina - 80 });
        doc.font('Helvetica').fontSize(12).text('Catálogo de productos', 40, 60);
        doc.fillColor('#111');
      };
      encabezado();

      const margenX = 40;
      const gap = 14;
      const columnas = 3;
      const anchoTarjeta = (anchoPagina - margenX * 2 - gap * (columnas - 1)) / columnas;
      const altoTarjeta = 220;
      const altoImagen = 95;
      let x = margenX;
      let y = 118;
      let col = 0;

      if (items.length === 0) {
        doc.font('Helvetica').fontSize(13).fillColor('#666').text('Este catálogo aún no tiene productos.', margenX, y);
      }

      for (const item of items) {
        if (y + altoTarjeta > altoPagina - 50) {
          doc.addPage();
          encabezado();
          y = 118;
          x = margenX;
          col = 0;
        }

        doc.roundedRect(x, y, anchoTarjeta, altoTarjeta, 6).lineWidth(0.7).stroke('#dddddd');

        const imagenBuffer = imagenesPorItem.get(item.id);
        if (imagenBuffer) {
          try {
            doc.image(imagenBuffer, x + 8, y + 8, { fit: [anchoTarjeta - 16, altoImagen], align: 'center', valign: 'center' });
          } catch {
            doc.rect(x + 8, y + 8, anchoTarjeta - 16, altoImagen).fill('#f2f2f2');
          }
        } else {
          doc.rect(x + 8, y + 8, anchoTarjeta - 16, altoImagen).fill('#f2f2f2');
        }

        let cursorY = y + altoImagen + 16;
        const tituloCompleto = item.presentacion ? `${item.nombre} — ${item.presentacion}` : item.nombre;
        doc.fillColor('#101f26').font('Helvetica-Bold').fontSize(10).text(tituloCompleto, x + 8, cursorY, { width: anchoTarjeta - 16, height: 28 });
        cursorY += 26;
        if (item.categoria) {
          doc.fillColor('#8a8a8a').font('Helvetica').fontSize(7.5).text(String(item.categoria).toUpperCase(), x + 8, cursorY, { width: anchoTarjeta - 16 });
          cursorY += 11;
        }
        if (item.precio !== null && item.precio !== undefined) {
          doc.fillColor(color).font('Helvetica-Bold').fontSize(11).text(
            `$${Number(item.precio).toLocaleString('es-CO')}`,
            x + 8,
            cursorY,
          );
          cursorY += 15;
        }
        if (item.descripcion) {
          doc.fillColor('#666').font('Helvetica').fontSize(7.5).text(item.descripcion, x + 8, cursorY, { width: anchoTarjeta - 16, height: 28 });
        }

        col++;
        if (col >= columnas) {
          col = 0;
          x = margenX;
          y += altoTarjeta + gap;
        } else {
          x += anchoTarjeta + gap;
        }
      }

      const rango = doc.bufferedPageRange();
      for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#999').font('Helvetica').fontSize(8).text(
          `Página ${i + 1} de ${rango.count} · Catálogo generado con PowerPOS`,
          margenX,
          altoPagina - 50,
          { width: anchoPagina - margenX * 2, align: 'center', lineBreak: false },
        );
      }

      doc.end();
    });
  }
}
