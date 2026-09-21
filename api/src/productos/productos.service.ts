import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

const QUITAR_ACENTOS = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
const NORMALIZAR_ENCABEZADO = (texto: string) => QUITAR_ACENTOS(String(texto || '').toLowerCase().trim());

const SINONIMOS_COLUMNAS: Record<string, string[]> = {
  nombre: ['nombre', 'producto', 'nombre del producto', 'articulo'],
  categoria: ['categoria', 'categoria del producto'],
  precio: ['precio', 'precio de venta', 'precio venta'],
  costo: ['costo', 'precio de costo', 'costo unitario'],
  stock: ['stock', 'cantidad', 'existencias', 'stock actual'],
  stockMinimo: ['stock minimo', 'minimo', 'stock de seguridad'],
  codigoBarras: ['codigo de barras', 'codigo barras', 'sku', 'codigo'],
  descripcion: ['descripcion', 'detalle'],
};

@Injectable()
export class ProductosService {
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

  private async validarDatosComercio(datos: any, empresaId: number, productoId?: number) {
    const campos = ['stockActual', 'stockMinimo'] as const;
    for (const campo of campos) {
      if (datos[campo] !== undefined && (!Number.isInteger(datos[campo]) || datos[campo] < 0)) {
        throw new BadRequestException(`${campo} debe ser un entero no negativo`);
      }
    }
    if (datos.costo !== undefined && datos.costo !== null) {
      if (typeof datos.costo !== 'number' || !Number.isFinite(datos.costo) || datos.costo < 0) {
        throw new BadRequestException('El costo debe ser un número no negativo');
      }
    }
    if (datos.codigoBarras !== undefined) {
      datos.codigoBarras = String(datos.codigoBarras).trim() || null;
      if (datos.codigoBarras && datos.codigoBarras.length > 80) throw new BadRequestException('El código de barras es demasiado largo');
      if (datos.codigoBarras) {
        const existente = await this.prisma.producto.findFirst({
          where: { empresaId, codigoBarras: datos.codigoBarras, ...(productoId ? { id: { not: productoId } } : {}) },
          select: { id: true },
        });
        if (existente) throw new ConflictException('El código de barras ya está asignado a otro producto');
      }
    }
    if (datos.categoriaId !== undefined) {
      const categoria = await this.prisma.categoria.findFirst({ where: { id: Number(datos.categoriaId), empresaId, activo: true }, select: { id: true } });
      if (!categoria) throw new BadRequestException('La categoría no pertenece a esta empresa');
    }
  }

  private async validarRelaciones(empresaId: number, ingredientes?: any[], adicionalIds?: number[], preparacionIds?: number[]) {
    for (const ingrediente of ingredientes || []) {
      if (!ingrediente.ingredienteId) continue;
      const encontrado = await this.prisma.ingrediente.findFirst({ where: { id: Number(ingrediente.ingredienteId), empresaId, activo: true }, select: { id: true } });
      if (!encontrado) throw new BadRequestException('El ingrediente no pertenece a esta empresa');
    }
    for (const adicionalId of adicionalIds || []) {
      const encontrado = await this.prisma.adicional.findFirst({ where: { id: Number(adicionalId), empresaId }, select: { id: true } });
      if (!encontrado) throw new BadRequestException('El adicional no pertenece a esta empresa');
    }
    for (const preparacionId of preparacionIds || []) {
      const encontrado = await this.prisma.preparacion.findFirst({ where: { id: Number(preparacionId), empresaId }, select: { id: true } });
      if (!encontrado) throw new BadRequestException('La preparación no pertenece a esta empresa');
    }
  }

  async crear(datos: any, empresaId: number) {
    const { ingredientes, adicionalIds, preparacionIds, ...productoData } = datos;
    await this.validarDatosComercio(productoData, empresaId);
    await this.validarRelaciones(empresaId, ingredientes, adicionalIds, preparacionIds);

    return this.prisma.producto.create({
      data: {
        ...productoData,
        empresaId,
        ingredientes: ingredientes
          ? {
              create: ingredientes.map((ing: any) => ({
                cantidad: ing.cantidad,
                ingrediente: {
                  connectOrCreate: {
                    where: { id: ing.ingredienteId || 0 },
                    create: {
                      nombre: ing.nombre,
                      empresaId,
                      unidad: ing.unidad,
                      stock: ing.stockInicial || 0,
                      stockMinimo: ing.stockMinimo || 0,
                    },
                  },
                },
              })),
            }
          : undefined,
        adicionales:
          Array.isArray(adicionalIds) && adicionalIds.length > 0
            ? {
                create: adicionalIds.map((adicionalId: number) => ({
                  adicionalId,
                })),
              }
            : undefined,
        preparaciones:
          Array.isArray(preparacionIds) && preparacionIds.length > 0
            ? {
                create: preparacionIds.map((preparacionId: number) => ({
                  preparacionId,
                  cantidad: 1,
                  unidad: 'porciones',
                })),
              }
            : undefined,
      },
      include: {
        categoria: true,
        ingredientes: { include: { ingrediente: true } },
        adicionales: {
          include: { adicional: { include: { ingrediente: true } } },
        },
        preparaciones: { include: { preparacion: true } },
      },
    });
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

    // Mapea cada encabezado real de la hoja a nuestro nombre de campo interno,
    // aceptando variaciones razonables de nombre/tildes/mayúsculas.
    const encabezadosReales = Object.keys(filas[0]);
    const mapaCampos: Record<string, string> = {};
    for (const encabezado of encabezadosReales) {
      const normalizado = NORMALIZAR_ENCABEZADO(encabezado);
      const campo = Object.entries(SINONIMOS_COLUMNAS).find(([, sinonimos]) =>
        sinonimos.some((s) => NORMALIZAR_ENCABEZADO(s) === normalizado),
      )?.[0];
      if (campo) mapaCampos[campo] = encabezado;
    }
    if (!mapaCampos.nombre || !mapaCampos.precio) {
      throw new BadRequestException('El archivo debe tener al menos las columnas "nombre" y "precio"');
    }

    const categoriasExistentes = await this.prisma.categoria.findMany({ where: { empresaId, activo: true } });
    const mapaCategorias = new Map<string, number>(
      categoriasExistentes.map((c) => [NORMALIZAR_ENCABEZADO(c.nombre), c.id]),
    );
    const codigosBarrasExistentes = new Set(
      (await this.prisma.producto.findMany({ where: { empresaId, codigoBarras: { not: null } }, select: { codigoBarras: true } }))
        .map((p) => p.codigoBarras as string),
    );

    let creados = 0;
    const errores: { fila: number; motivo: string }[] = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const numeroFila = i + 2; // +1 por índice base 0, +1 por la fila de encabezados
      try {
        const nombre = String(fila[mapaCampos.nombre] ?? '').trim();
        if (!nombre) { errores.push({ fila: numeroFila, motivo: 'Falta el nombre del producto' }); continue; }

        const precio = Number(fila[mapaCampos.precio]);
        if (!Number.isFinite(precio) || precio <= 0) {
          errores.push({ fila: numeroFila, motivo: 'El precio debe ser un número mayor a 0' });
          continue;
        }

        const nombreCategoria = mapaCampos.categoria ? String(fila[mapaCampos.categoria] ?? '').trim() : '';
        let categoriaId: number | undefined;
        if (nombreCategoria) {
          const clave = NORMALIZAR_ENCABEZADO(nombreCategoria);
          categoriaId = mapaCategorias.get(clave);
          if (!categoriaId) {
            const nuevaCategoria = await this.prisma.categoria.create({
              data: { empresaId, nombre: nombreCategoria, icono: '📦' },
            });
            categoriaId = nuevaCategoria.id;
            mapaCategorias.set(clave, categoriaId);
          }
        } else {
          errores.push({ fila: numeroFila, motivo: 'Falta la categoría del producto' });
          continue;
        }

        let costo: number | null = null;
        if (mapaCampos.costo && fila[mapaCampos.costo] !== '') {
          const valor = Number(fila[mapaCampos.costo]);
          if (!Number.isFinite(valor) || valor < 0) { errores.push({ fila: numeroFila, motivo: 'El costo debe ser un número no negativo' }); continue; }
          costo = valor;
        }

        let stockActual = 0;
        if (mapaCampos.stock && fila[mapaCampos.stock] !== '') {
          const valor = Number(fila[mapaCampos.stock]);
          if (!Number.isInteger(valor) || valor < 0) { errores.push({ fila: numeroFila, motivo: 'El stock debe ser un entero no negativo' }); continue; }
          stockActual = valor;
        }

        let stockMinimo = 0;
        if (mapaCampos.stockMinimo && fila[mapaCampos.stockMinimo] !== '') {
          const valor = Number(fila[mapaCampos.stockMinimo]);
          if (!Number.isInteger(valor) || valor < 0) { errores.push({ fila: numeroFila, motivo: 'El stock mínimo debe ser un entero no negativo' }); continue; }
          stockMinimo = valor;
        }

        let codigoBarras: string | null = null;
        if (mapaCampos.codigoBarras && String(fila[mapaCampos.codigoBarras] ?? '').trim()) {
          codigoBarras = String(fila[mapaCampos.codigoBarras]).trim();
          if (codigosBarrasExistentes.has(codigoBarras)) {
            errores.push({ fila: numeroFila, motivo: `El código de barras "${codigoBarras}" ya está en uso` });
            continue;
          }
          codigosBarrasExistentes.add(codigoBarras);
        }

        const descripcion = mapaCampos.descripcion ? String(fila[mapaCampos.descripcion] ?? '').trim() : '';

        await this.prisma.producto.create({
          data: {
            empresaId,
            categoriaId,
            nombre,
            descripcion: descripcion || null,
            precio,
            costo,
            codigoBarras,
            controlaStock: true,
            stockActual,
            stockMinimo,
            disponible: true,
            aceptaAdicionales: false,
          },
        });
        creados++;
      } catch (e) {
        errores.push({ fila: numeroFila, motivo: e instanceof Error ? e.message : 'Error al crear el producto' });
      }
    }

    return { creados, totalFilas: filas.length, errores };
  }

  async listar(empresaId: number, categoriaId?: number) {
    return this.prisma.producto.findMany({
      where: {
        empresaId,
        activo: true,
        ...(categoriaId && { categoriaId }),
      },
      include: {
        categoria: true,
        ingredientes: { include: { ingrediente: true } },
        adicionales: {
          include: { adicional: { include: { ingrediente: true } } },
        },
        preparaciones: { include: { preparacion: true } },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async obtener(id: number, empresaId: number) {
    const producto = await this.prisma.producto.findFirst({
      where: { id, empresaId },
      include: {
        categoria: true,
        ingredientes: { include: { ingrediente: true } },
        adicionales: {
          include: { adicional: { include: { ingrediente: true } } },
        },
        preparaciones: { include: { preparacion: true } },
      },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  async actualizar(id: number, datos: any, empresaId: number) {
    await this.obtener(id, empresaId);
    const { ingredientes, adicionalIds, preparacionIds, ...productoData } = datos;
    await this.validarDatosComercio(productoData, empresaId, id);
    await this.validarRelaciones(empresaId, ingredientes, adicionalIds, preparacionIds);

    if (Array.isArray(adicionalIds)) {
      await this.prisma.productoAdicional.deleteMany({
        where: { productoId: id },
      });
      if (adicionalIds.length > 0) {
        await this.prisma.productoAdicional.createMany({
          data: adicionalIds.map((adicionalId: number) => ({
            productoId: id,
            adicionalId,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (Array.isArray(preparacionIds)) {
      await this.prisma.productoPreparacion.deleteMany({ where: { productoId: id } });
      if (preparacionIds.length > 0) {
        await this.prisma.productoPreparacion.createMany({
          data: preparacionIds.map((preparacionId: number) => ({
            productoId: id,
            preparacionId,
            cantidad: 1,
            unidad: 'porciones',
          })),
          skipDuplicates: true,
        });
      }
    }

    if (ingredientes) {
      await this.prisma.productoIngrediente.deleteMany({
        where: { productoId: id },
      });

      await this.prisma.productoIngrediente.createMany({
        data: ingredientes
          .filter((ing: any) => ing.ingredienteId)
          .map((ing: any) => ({
            productoId: id,
            ingredienteId: ing.ingredienteId,
            cantidad: ing.cantidad,
          })),
      });

      // Crear los ingredientes nuevos (sin ingredienteId) que el admin haya escrito a mano
      const nuevos = ingredientes.filter(
        (ing: any) => !ing.ingredienteId && ing.nombre,
      );
      for (const ing of nuevos) {
        const ingredienteCreado = await this.prisma.ingrediente.create({
          data: {
            empresaId,
            nombre: ing.nombre,
            unidad: ing.unidad,
            stock: ing.stockInicial || 0,
            stockMinimo: ing.stockMinimo || 0,
          },
        });
        await this.prisma.productoIngrediente.create({
          data: {
            productoId: id,
            ingredienteId: ingredienteCreado.id,
            cantidad: ing.cantidad,
          },
        });
      }
    }

    return this.prisma.producto.update({
      where: { id },
      data: productoData,
      include: {
        categoria: true,
        ingredientes: { include: { ingrediente: true } },
        adicionales: {
          include: { adicional: { include: { ingrediente: true } } },
        },
        preparaciones: { include: { preparacion: true } },
      },
    });
  }

  async eliminar(id: number, empresaId: number) {
    await this.obtener(id, empresaId);
    return this.prisma.producto.update({
      where: { id },
      data: { activo: false },
    });
  }

  async obtenerAlertasStock(empresaId: number) {
    const productos = await this.prisma.producto.findMany({
      where: { empresaId, activo: true, controlaStock: true },
    });

    return productos
      .filter((p) => p.stockActual <= p.stockMinimo)
      .map((p) => ({
        ...p,
        stockBajo: true,
        stockCritico: p.stockActual <= Math.floor(p.stockMinimo / 2),
      }));
  }

  async ajustarStock(id: number, datos: any, usuarioId: number, empresaId: number) {
    const producto = await this.prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    if (!producto.controlaStock) {
      throw new BadRequestException('Este producto no tiene activado el control de existencias');
    }
    if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(datos.tipo)) {
      throw new BadRequestException('Tipo de movimiento inválido');
    }
    const cantidad = Number(datos.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      throw new BadRequestException('La cantidad debe ser un entero no negativo');
    }

    const stockAnterior = producto.stockActual;
    let stockNuevo: number;
    if (datos.tipo === 'ENTRADA') {
      stockNuevo = stockAnterior + cantidad;
    } else if (datos.tipo === 'SALIDA') {
      stockNuevo = stockAnterior - cantidad;
      if (stockNuevo < 0) throw new BadRequestException('No hay suficientes existencias para esa salida');
    } else {
      stockNuevo = cantidad;
    }

    const actualizado = await this.prisma.producto.update({
      where: { id },
      data: { stockActual: stockNuevo },
    });

    await this.prisma.movimientoInventario.create({
      data: {
        productoId: id,
        usuarioId,
        tipo: datos.tipo,
        cantidadMovida: datos.tipo === 'AJUSTE' ? Math.abs(stockNuevo - stockAnterior) : cantidad,
        stockAnterior,
        stockNuevo,
        descripcion: datos.descripcion || null,
      },
    });

    if (stockNuevo <= producto.stockMinimo) {
      await this.notificaciones.enviarAlerta({
        tipo: 'STOCK BAJO',
        mensaje: `⚠️ ${producto.nombre} tiene existencias bajas: ${stockNuevo} unidades (mínimo: ${producto.stockMinimo})`,
        empresa: 'PowerPOS',
        sucursal: 'Sucursal Principal',
        empresaId,
      });
    }

    return { ...actualizado, stockAnterior, stockNuevo };
  }

  async obtenerHistorialStock(id: number, empresaId: number) {
    const producto = await this.prisma.producto.findFirst({ where: { id, empresaId } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return this.prisma.movimientoInventario.findMany({
      where: { productoId: id },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: 50,
    });
  }
}
