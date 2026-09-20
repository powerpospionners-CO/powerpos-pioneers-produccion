import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PreparacionesService {
  constructor(private prisma: PrismaService) {}

  private async validarIngredientes(ingredientes: any[], empresaId: number) {
    for (const ing of ingredientes) {
      const ingrediente = await this.prisma.ingrediente.findFirst({ where: { id: Number(ing.ingredienteId), empresaId, activo: true }, select: { id: true } });
      if (!ingrediente) throw new BadRequestException('El ingrediente no pertenece a esta empresa');
    }
  }

  async listar(empresaId: number) {
    const preparaciones = await this.prisma.preparacion.findMany({
      where: { empresaId, activo: true },
      include: {
        ingredientes: { include: { ingrediente: true } },
        lotes: { orderBy: { fecha: 'desc' } },
      },
      orderBy: { nombre: 'asc' },
    });

    return preparaciones.map((prep) => ({
      ...prep,
      porcionesDisponibles: this.calcularPorcionesDisponibles(prep),
    }));
  }

  async obtener(id: number, empresaId: number) {
    const preparacion = await this.prisma.preparacion.findFirst({
      where: { id, empresaId, activo: true },
      include: {
        ingredientes: { include: { ingrediente: true } },
        lotes: { orderBy: { fecha: 'desc' } },
        productoPreparaciones: { include: { producto: true } },
      },
    });

    if (!preparacion) throw new NotFoundException('Preparación no encontrada');
    return {
      ...preparacion,
      porcionesDisponibles: this.calcularPorcionesDisponibles(preparacion),
    };
  }

  async crear(datos: any, empresaId: number, usuarioId: number) {
    const { ingredientes = [], ...rest } = datos;
    await this.validarIngredientes(ingredientes, empresaId);

    const preparacion = await this.prisma.preparacion.create({
      data: {
        ...rest,
        empresaId,
        ingredientes: {
          create: ingredientes.map((ing: any) => ({
            ingredienteId: ing.ingredienteId,
            cantidad: Number(ing.cantidad ?? 0),
            unidad: ing.unidad || 'gramos',
            observacion: ing.observacion || null,
          })),
        },
      },
      include: {
        ingredientes: { include: { ingrediente: true } },
      },
    });

    await this.prisma.auditoria.create({
      data: {
        empresaId,
        usuarioId,
        accion: 'CREAR_PREPARACION',
        entidad: 'Preparacion',
        entidadId: preparacion.id,
        detalle: { nombre: preparacion.nombre },
      },
    });

    return preparacion;
  }

  async actualizar(id: number, datos: any, empresaId: number) {
    const prep = await this.prisma.preparacion.findFirst({ where: { id, empresaId } });
    if (!prep) throw new NotFoundException('Preparación no encontrada');

    const { ingredientes = [], ...rest } = datos;
    await this.validarIngredientes(ingredientes, empresaId);

    if (Array.isArray(ingredientes)) {
      await this.prisma.preparacionIngrediente.deleteMany({ where: { preparacionId: id } });
      if (ingredientes.length > 0) {
        await this.prisma.preparacionIngrediente.createMany({
          data: ingredientes.map((ing: any) => ({
            preparacionId: id,
            ingredienteId: ing.ingredienteId,
            cantidad: Number(ing.cantidad ?? 0),
            unidad: ing.unidad || 'gramos',
            observacion: ing.observacion || null,
          })),
        });
      }
    }

    return this.prisma.preparacion.update({
      where: { id },
      data: rest,
      include: {
        ingredientes: { include: { ingrediente: true } },
      },
    });
  }

  async eliminar(id: number, empresaId: number) {
    const prep = await this.prisma.preparacion.findFirst({ where: { id, empresaId } });
    if (!prep) throw new NotFoundException('Preparación no encontrada');

    return this.prisma.preparacion.update({
      where: { id },
      data: { activo: false },
    });
  }

  async listarLotes(preparacionId: number, empresaId: number) {
    const preparacion = await this.prisma.preparacion.findFirst({
      where: { id: preparacionId, empresaId },
    });
    if (!preparacion) throw new NotFoundException('Preparación no encontrada');

    return this.prisma.lotePreparacion.findMany({
      where: { preparacionId, empresaId },
      include: {
        usuario: { select: { nombre: true } },
        ingredientes: { include: { ingrediente: true } },
      },
      orderBy: { fecha: 'desc' },
    });
  }

  async crearLote(preparacionId: number, datos: any, empresaId: number, usuarioId: number) {
    const preparacion = await this.prisma.preparacion.findFirst({
      where: { id: preparacionId, empresaId },
      include: { ingredientes: { include: { ingrediente: true } } },
    });

    if (!preparacion) throw new NotFoundException('Preparación no encontrada');
    await this.validarIngredientes(datos.ingredientes || [], empresaId);

    const porcionesTotales = Number(datos.porcionesTotales ?? 0);
    const cantidadProducida = Number(datos.cantidadProducida ?? 0);

    if (porcionesTotales <= 0 || cantidadProducida <= 0) {
      throw new BadRequestException('Debe registrar cantidades válidas del lote');
    }

    const lote = await this.prisma.lotePreparacion.create({
      data: {
        empresaId,
        preparacionId,
        usuarioId,
        fecha: datos.fecha ? new Date(datos.fecha) : new Date(),
        loteNumero: datos.loteNumero || `LOT-${Date.now()}`,
        cantidadProducida,
        pesoTotal: datos.pesoTotal ? Number(datos.pesoTotal) : null,
        pesoPorBolsa: datos.pesoPorBolsa ? Number(datos.pesoPorBolsa) : null,
        porcionesPorBolsa: datos.porcionesPorBolsa ? Number(datos.porcionesPorBolsa) : null,
        porcionesTotales,
        observacion: datos.observacion || null,
        ingredientes: {
          create: (datos.ingredientes || []).map((ing: any) => ({
            ingredienteId: Number(ing.ingredienteId),
            cantidadUsada: Number(ing.cantidadUsada ?? 0),
            unidad: ing.unidad || 'gramos',
            observacion: ing.observacion || null,
          })),
        },
      },
      include: {
        ingredientes: { include: { ingrediente: true } },
      },
    });

    for (const ing of datos.ingredientes || []) {
      if (!ing.ingredienteId) continue;
      const ingrediente = await this.prisma.ingrediente.findFirst({ where: { id: Number(ing.ingredienteId), empresaId } });
      if (!ingrediente) continue;
      await this.prisma.ingrediente.update({
        where: { id: ingrediente.id },
        data: {
          stock: {
            decrement: Number(ing.cantidadUsada ?? 0),
          },
        },
      });
      await this.prisma.movimientoInventario.create({
        data: {
          ingredienteId: ingrediente.id,
          usuarioId,
          tipo: 'PREPARACION',
          cantidadMovida: Number(ing.cantidadUsada ?? 0),
          stockAnterior: Number(ingrediente.stock),
          stockNuevo: Number(ingrediente.stock) - Number(ing.cantidadUsada ?? 0),
          descripcion: `Producción de preparación: ${preparacion.nombre}`,
        },
      });
    }

    await this.prisma.auditoria.create({
      data: {
        empresaId,
        usuarioId,
        accion: 'CREAR_LOTE_PREPARACION',
        entidad: 'LotePreparacion',
        entidadId: lote.id,
        detalle: { preparacionId, porcionesTotales },
      },
    });

    return lote;
  }

  private calcularPorcionesDisponibles(preparacion: any) {
    const lotes = Array.isArray(preparacion.lotes) ? preparacion.lotes : [];
    const total = lotes.reduce((acc: number, lote: any) => acc + Number(lote.porcionesTotales || 0), 0);
    return total;
  }
}
