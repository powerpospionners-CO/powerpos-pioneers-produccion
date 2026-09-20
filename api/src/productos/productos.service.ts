import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

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
