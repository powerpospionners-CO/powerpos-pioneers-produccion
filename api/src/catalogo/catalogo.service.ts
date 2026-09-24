import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

const QUITAR_ACENTOS = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
const NORMALIZAR_ENCABEZADO = (texto: string) => QUITAR_ACENTOS(String(texto || '').toLowerCase().trim());

const SINONIMOS_COLUMNAS: Record<string, string[]> = {
  nombre: ['nombre', 'producto', 'nombre del producto', 'articulo'],
  categoria: ['categoria', 'linea', 'familia'],
  precio: ['precio', 'precio de venta', 'precio venta', 'precio sugerido'],
  descripcion: ['descripcion', 'detalle', 'presentacion'],
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

  async listar(empresaId: number) {
    return this.prisma.catalogoProducto.findMany({
      where: { empresaId },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async crear(datos: any, empresaId: number) {
    const nombre = textoOpcional(datos.nombre, 'El nombre', 150, true) as string;
    const categoria = textoOpcional(datos.categoria, 'La categoría', 80);
    const descripcion = textoOpcional(datos.descripcion, 'La descripción', 500);
    const precio = this.validarPrecio(datos.precio);
    return this.prisma.catalogoProducto.create({
      data: { empresaId, nombre, categoria, descripcion, precio },
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
    await this.obtener(id, empresaId);
    const data: any = {};
    if (datos.nombre !== undefined) data.nombre = textoOpcional(datos.nombre, 'El nombre', 150, true);
    if (datos.categoria !== undefined) data.categoria = textoOpcional(datos.categoria, 'La categoría', 80);
    if (datos.descripcion !== undefined) data.descripcion = textoOpcional(datos.descripcion, 'La descripción', 500);
    if (datos.precio !== undefined) data.precio = this.validarPrecio(datos.precio);
    if (datos.activo !== undefined) data.activo = !!datos.activo;
    if (datos.orden !== undefined) data.orden = Number.isInteger(datos.orden) ? datos.orden : 0;
    return this.prisma.catalogoProducto.update({ where: { id }, data });
  }

  async eliminar(id: number, empresaId: number) {
    await this.obtener(id, empresaId);
    await this.prisma.catalogoProducto.delete({ where: { id } });
    return { ok: true };
  }

  async actualizarImagen(id: number, empresaId: number, imagen: string) {
    await this.obtener(id, empresaId);
    return this.prisma.catalogoProducto.update({ where: { id }, data: { imagen } });
  }

  async importarExcel(buffer: Buffer, empresaId: number) {
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
          const valor = Number(fila[mapaCampos.precio]);
          if (!Number.isFinite(valor) || valor < 0) { errores.push({ fila: numeroFila, motivo: 'El precio debe ser un número no negativo' }); continue; }
          precio = valor;
        }

        const categoria = mapaCampos.categoria ? String(fila[mapaCampos.categoria] ?? '').trim() || null : null;
        const descripcion = mapaCampos.descripcion ? String(fila[mapaCampos.descripcion] ?? '').trim() || null : null;

        await this.prisma.catalogoProducto.create({
          data: { empresaId, nombre, precio, categoria, descripcion, orden: existentes + creados },
        });
        creados++;
      } catch (e) {
        errores.push({ fila: numeroFila, motivo: e instanceof Error ? e.message : 'Error al crear el producto' });
      }
    }

    return { creados, totalFilas: filas.length, errores };
  }

  private async empresaPorSlug(slug: string) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { tiendaSlug: slug },
      select: { id: true, nombre: true, logo: true, telefono: true, activo: true, tiendaConfig: true },
    });
    if (!empresa || !empresa.activo) throw new NotFoundException('Catálogo no disponible');
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
      const respuesta = await fetch(url);
      if (!respuesta.ok) return null;
      const arrayBuffer = await respuesta.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  private async construirPDF(nombreEmpresa: string, color: string, items: any[]): Promise<Buffer> {
    const imagenesPorItem = new Map<number, Buffer | null>();
    for (const item of items) {
      if (item.imagen) imagenesPorItem.set(item.id, await this.descargarImagen(item.imagen));
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
        doc.fillColor('#101f26').font('Helvetica-Bold').fontSize(10.5).text(item.nombre, x + 8, cursorY, { width: anchoTarjeta - 16, height: 28 });
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
          altoPagina - 30,
          { width: anchoPagina - margenX * 2, align: 'center' },
        );
      }

      doc.end();
    });
  }
}
