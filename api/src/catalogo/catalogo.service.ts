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
    .replace(/(\d)([a-z])/g, '$1 $2') // "500g" -> "500 g", para que el gramaje quede como palabra aparte
    .replace(/([a-z])(\d)/g, '$1 $2') // "x40" -> "x 40"
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

// Unidades de gramaje/presentación que suelen venir en el nombre del
// archivo o del producto (ej. "500g", "500 G", "500 gramos" son la misma
// medida) — se normalizan a una forma única para poder compararlas.
const UNIDADES_CANONICAS: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  uni: 'uni', und: 'uni', unidad: 'uni', unidades: 'uni',
  oz: 'oz', lb: 'lb', libra: 'lb', libras: 'lb',
};
const PATRON_MEDIDA = new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${Object.keys(UNIDADES_CANONICAS).join('|')})\\b`);

// Extrae el gramaje/presentación de un texto (nombre de archivo o nombre +
// presentación de producto), ej. "Salsa de ají 500 g" -> { numero: '500', unidad: 'g' }.
function extraerMedida(texto: string): { numero: string; unidad: string } | null {
  const match = normalizarTexto(texto).match(PATRON_MEDIDA);
  if (!match) return null;
  return { numero: match[1].replace(',', '.'), unidad: UNIDADES_CANONICAS[match[2]] };
}

// Cuando una foto no coincide con ningún producto existente del catálogo,
// se usa su nombre de archivo para crear el producto nuevo (ej. "Sal
// Himalaya 500g.jpg" -> nombre "Sal Himalaya", presentación "500 g").
function extraerNombreYPresentacionDeArchivo(nombreArchivo: string): { nombre: string; presentacion: string | null } {
  const limpio = String(nombreArchivo || '')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const patronMedida = new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${Object.keys(UNIDADES_CANONICAS).join('|')})\\b`, 'i');
  const match = limpio.match(patronMedida);
  if (!match || match.index === undefined) return { nombre: limpio, presentacion: null };
  const unidad = UNIDADES_CANONICAS[match[2].toLowerCase()];
  const presentacion = `${match[1].replace(',', '.')} ${unidad}`;
  const nombre = (limpio.slice(0, match.index) + limpio.slice(match.index + match[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  return { nombre: nombre || limpio, presentacion };
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

  async eliminarTodos(empresaId: number) {
    await this.verificarHabilitado(empresaId);
    const resultado = await this.prisma.catalogoProducto.deleteMany({ where: { empresaId } });
    return { eliminados: resultado.count };
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
    let actualizados = 0;
    const errores: { fila: number; motivo: string }[] = [];

    // Para que volver a subir el mismo Excel no duplique productos: se
    // empareja por nombre + presentación (sin importar mayúsculas, acentos
    // o espacios) contra lo que ya hay en el catálogo. Si ya existe, se
    // actualiza en vez de crear uno nuevo; si no, se crea.
    const existentes = await this.prisma.catalogoProducto.findMany({
      where: { empresaId },
      select: { id: true, nombre: true, presentacion: true },
    });
    const claveDe = (nombre: string, presentacion: string | null) =>
      `${normalizarTexto(nombre)}|${normalizarTexto(presentacion || '')}`;
    const indice = new Map<string, number>();
    for (const item of existentes) indice.set(claveDe(item.nombre, item.presentacion), item.id);
    const totalExistentes = existentes.length;

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

        const clave = claveDe(nombre, presentacion);
        const idExistente = indice.get(clave);

        if (idExistente) {
          const data: Record<string, unknown> = {};
          if (mapaCampos.precio) data.precio = precio;
          if (mapaCampos.categoria) data.categoria = categoria;
          if (mapaCampos.descripcion) data.descripcion = descripcion;
          await this.prisma.catalogoProducto.update({ where: { id: idExistente }, data });
          actualizados++;
          continue;
        }

        const nuevo = await this.prisma.catalogoProducto.create({
          data: { empresaId, nombre, precio, categoria, presentacion, descripcion, orden: totalExistentes + creados },
        });
        creados++;
        indice.set(clave, nuevo.id);
      } catch (e) {
        errores.push({ fila: numeroFila, motivo: e instanceof Error ? e.message : 'Error al crear el producto' });
      }
    }

    return { creados, actualizados, totalFilas: filas.length, errores };
  }

  // Recibe varias imágenes sueltas (ej. exportadas con el nombre del
  // producto) y las empareja con el catálogo por similitud de nombre, sin
  // que el admin tenga que asignarlas una por una. Si el nombre del archivo
  // se parece por igual a más de un producto existente, se deja fuera para
  // que se asigne a mano desde "Editar" (ambigüedad real). Si no se parece a
  // ninguno, se asume que es un producto nuevo (ej. una etiqueta que no
  // estaba en el Excel original) y se crea en el catálogo con el nombre y la
  // medida que trae el nombre del archivo.
  async importarImagenes(archivos: Express.Multer.File[], empresaId: number) {
    await this.verificarHabilitado(empresaId);
    const itemsExistentes = await this.prisma.catalogoProducto.findMany({
      where: { empresaId },
      select: { id: true, nombre: true, presentacion: true },
    });
    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const asignados: { archivo: string; producto: string }[] = [];
    const creados: { archivo: string; producto: string }[] = [];
    const sinCoincidencia: { archivo: string; motivo: string }[] = [];

    // Lista viva de productos del catálogo contra la que se compara cada
    // foto — incluye los recién creados en esta misma tanda, para que dos
    // fotos del mismo producto nuevo no terminen creando dos productos.
    const disponibles: { id: number; nombre: string; presentacion: string | null }[] = [...itemsExistentes];
    let creadosEnLote = 0;

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
      const medidaArchivo = extraerMedida(archivo.originalname);
      let mejor: { item: (typeof disponibles)[number]; score: number } | null = null;
      let empatados = 0;
      for (const item of disponibles) {
        const textoProducto = `${item.nombre} ${item.presentacion || ''}`;
        let score = puntajeCoincidencia(tokensArchivo, tokensDeNombre(textoProducto));
        if (score <= 0) continue;

        // Si el archivo trae un gramaje (ej. "500g") y el producto también,
        // deben coincidir exactamente — si no, no es el mismo producto por
        // más que el nombre se parezca (ej. 250 G vs 500 G). Si coinciden,
        // se le da prioridad clara sobre variantes con otro gramaje o sin él.
        const medidaProducto = extraerMedida(textoProducto);
        if (medidaArchivo && medidaProducto) {
          const coincideMedida = medidaArchivo.numero === medidaProducto.numero && medidaArchivo.unidad === medidaProducto.unidad;
          if (!coincideMedida) continue;
          score += 1;
        }

        if (!mejor || score > mejor.score) {
          mejor = { item, score };
          empatados = 1;
        } else if (score === mejor.score) {
          empatados++;
        }
      }

      const imagen = `${baseUrl}/uploads/catalogo/${archivo.filename}`;

      if (mejor && mejor.score >= 0.5 && empatados === 1) {
        await this.prisma.catalogoProducto.update({ where: { id: mejor.item.id }, data: { imagen } });
        asignados.push({ archivo: archivo.originalname, producto: mejor.item.nombre });
        continue;
      }

      if (mejor && mejor.score >= 0.5 && empatados > 1) {
        sinCoincidencia.push({ archivo: archivo.originalname, motivo: 'El nombre coincide con más de un producto; asígnala manualmente' });
        await fs.unlink(archivo.path).catch(() => undefined);
        continue;
      }

      const { nombre, presentacion } = extraerNombreYPresentacionDeArchivo(archivo.originalname);
      const nuevo = await this.prisma.catalogoProducto.create({
        data: {
          empresaId,
          nombre: nombre.slice(0, 150),
          presentacion: presentacion ? presentacion.slice(0, 60) : null,
          imagen,
          orden: itemsExistentes.length + creadosEnLote,
        },
      });
      creadosEnLote++;
      disponibles.push({ id: nuevo.id, nombre: nuevo.nombre, presentacion: nuevo.presentacion });
      creados.push({ archivo: archivo.originalname, producto: nuevo.presentacion ? `${nuevo.nombre} ${nuevo.presentacion}` : nuevo.nombre });
    }

    return { asignados, creados, sinCoincidencia, total: archivos.length };
  }

  // Copia las imágenes que ya existen en el catálogo (el folleto) hacia los
  // productos reales que coincidan por nombre — la tienda pública usa la
  // imagen del producto, no la del catálogo, que son dos tablas separadas.
  // Solo completa productos que todavía no tienen imagen propia, para no
  // reemplazar una foto que el admin ya haya puesto a mano.
  async sincronizarImagenesAProductos(empresaId: number) {
    await this.verificarHabilitado(empresaId);
    const itemsCatalogo = await this.prisma.catalogoProducto.findMany({
      where: { empresaId, imagen: { not: null } },
      select: { nombre: true, presentacion: true, imagen: true },
    });
    if (!itemsCatalogo.length) return { actualizados: [], sinCoincidencia: [], total: 0 };

    const productos = await this.prisma.producto.findMany({
      where: { empresaId, activo: true, imagen: null },
      select: { id: true, nombre: true },
    });

    const actualizados: { catalogo: string; producto: string }[] = [];
    const sinCoincidencia: { catalogo: string; motivo: string }[] = [];

    for (const item of itemsCatalogo) {
      const textoCatalogo = `${item.nombre} ${item.presentacion || ''}`;
      const tokensCatalogo = tokensDeNombre(textoCatalogo);
      const medidaCatalogo = extraerMedida(textoCatalogo);
      let mejor: { producto: (typeof productos)[number]; score: number } | null = null;
      let empatados = 0;
      for (const producto of productos) {
        let score = puntajeCoincidencia(tokensCatalogo, tokensDeNombre(producto.nombre));
        if (score <= 0) continue;
        const medidaProducto = extraerMedida(producto.nombre);
        if (medidaCatalogo && medidaProducto) {
          const coincideMedida = medidaCatalogo.numero === medidaProducto.numero && medidaCatalogo.unidad === medidaProducto.unidad;
          if (!coincideMedida) continue;
          score += 1;
        }
        if (!mejor || score > mejor.score) {
          mejor = { producto, score };
          empatados = 1;
        } else if (score === mejor.score) {
          empatados++;
        }
      }

      if (!mejor || mejor.score < 0.5) {
        sinCoincidencia.push({ catalogo: item.nombre, motivo: 'No se encontró un producto sin imagen con nombre parecido' });
        continue;
      }
      if (empatados > 1) {
        sinCoincidencia.push({ catalogo: item.nombre, motivo: 'El nombre coincide con más de un producto; asígnala manualmente' });
        continue;
      }

      await this.prisma.producto.update({ where: { id: mejor.producto.id }, data: { imagen: item.imagen } });
      actualizados.push({ catalogo: item.nombre, producto: mejor.producto.nombre });
      // Saca ese producto de la lista disponible para que otro item del
      // catálogo no le asigne una imagen distinta encima en la misma pasada.
      const indice = productos.findIndex((p) => p.id === mejor!.producto.id);
      if (indice >= 0) productos.splice(indice, 1);
    }

    return { actualizados, sinCoincidencia, total: itemsCatalogo.length };
  }

  // Actualiza el precio de cada producto del catálogo para que sea igual al
  // precio real que tiene en el inventario (Producto) — el catálogo se pudo
  // llenar con precios de una lista vieja (Excel) y esto los deja al día.
  // A diferencia de las imágenes, el precio SIEMPRE se sobrescribe cuando
  // hay una coincidencia única, aunque el catálogo ya tuviera uno puesto.
  async sincronizarPreciosDesdeProductos(empresaId: number) {
    await this.verificarHabilitado(empresaId);
    const itemsCatalogo = await this.prisma.catalogoProducto.findMany({
      where: { empresaId },
      select: { id: true, nombre: true, presentacion: true },
    });
    if (!itemsCatalogo.length) return { actualizados: [], sinCoincidencia: [], total: 0 };

    const productos = await this.prisma.producto.findMany({
      where: { empresaId, activo: true },
      select: { id: true, nombre: true, precio: true },
    });

    const actualizados: { catalogo: string; producto: string; precio: number }[] = [];
    const sinCoincidencia: { catalogo: string; motivo: string }[] = [];

    for (const item of itemsCatalogo) {
      const textoCatalogo = `${item.nombre} ${item.presentacion || ''}`;
      const tokensCatalogo = tokensDeNombre(textoCatalogo);
      const medidaCatalogo = extraerMedida(textoCatalogo);
      let mejor: { producto: (typeof productos)[number]; score: number } | null = null;
      let empatados = 0;
      for (const producto of productos) {
        let score = puntajeCoincidencia(tokensCatalogo, tokensDeNombre(producto.nombre));
        if (score <= 0) continue;
        const medidaProducto = extraerMedida(producto.nombre);
        if (medidaCatalogo && medidaProducto) {
          const coincideMedida = medidaCatalogo.numero === medidaProducto.numero && medidaCatalogo.unidad === medidaProducto.unidad;
          if (!coincideMedida) continue;
          score += 1;
        }
        if (!mejor || score > mejor.score) {
          mejor = { producto, score };
          empatados = 1;
        } else if (score === mejor.score) {
          empatados++;
        }
      }

      if (!mejor || mejor.score < 0.5) {
        sinCoincidencia.push({ catalogo: item.nombre, motivo: 'No se encontró un producto con nombre parecido' });
        continue;
      }
      if (empatados > 1) {
        sinCoincidencia.push({ catalogo: item.nombre, motivo: 'El nombre coincide con más de un producto; asígnalo manualmente' });
        continue;
      }

      const precioNuevo = Number(mejor.producto.precio);
      await this.prisma.catalogoProducto.update({ where: { id: item.id }, data: { precio: precioNuevo } });
      actualizados.push({ catalogo: item.nombre, producto: mejor.producto.nombre, precio: precioNuevo });
    }

    return { actualizados, sinCoincidencia, total: itemsCatalogo.length };
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
      productos: this.ocultarFotosSiAplica(empresa.id, items),
    };
  }

  // Enchila Market pidió que las fotos del catálogo no se vean en la página
  // pública (folleto web ni PDF descargable) aunque sigan guardadas y
  // visibles en el panel interno de /catalogo.
  private ocultarFotosSiAplica<T extends { imagen: string | null }>(empresaId: number, items: T[]): T[] {
    if (empresaId !== 2) return items;
    return items.map((item) => ({ ...item, imagen: null }));
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
    return this.construirPDF(empresa.nombre, color, this.ocultarFotosSiAplica(empresa.id, items));
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
