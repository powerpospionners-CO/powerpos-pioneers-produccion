import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdicionalesService {
  constructor(private prisma: PrismaService) {}

  async listar(empresaId: number, productoId?: number) {
    return this.prisma.adicional.findMany({
      where: {
        empresaId,
        activo: true,
        ...(productoId && empresaId !== 1 && { productos: { some: { productoId } } }),
      },
      include: { ingrediente: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async sincronizarIngredientes(empresaId: number) {
    if (empresaId !== 1) throw new BadRequestException('Esta opción pertenece al Trailer del Sabor');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74224, ${empresaId})`;
      const ingredientes = await tx.ingrediente.findMany({ where: { empresaId, activo: true } });
      // Incluso los desactivados cuentan: no revivir adicionales eliminados por el administrador.
      const existentes = await tx.adicional.findMany({ where: { empresaId }, select: { ingredienteId: true } });
      const ids = new Set(existentes.map(a => a.ingredienteId));
      const faltantes = ingredientes.filter(i => !ids.has(i.id));
      if (faltantes.length) await tx.adicional.createMany({ data: faltantes.map(i => ({
        empresaId, ingredienteId: i.id, nombre: i.nombre, precio: 0, cantidad: null, disponible: false,
      })) });
      return { creados: faltantes.length };
    });
  }

  async crear(datos: any, empresaId: number) {
    const ingredienteId = await this.validarIngrediente(datos.ingredienteId, empresaId);
    this.validarEmpaque(datos.empaqueParaLlevar ?? false, ingredienteId, datos.cantidad);
    if (empresaId === 1) this.validarConfiguracion(datos.precio, ingredienteId, datos.cantidad);

    return this.prisma.adicional.create({
      data: {
        empresaId,
        nombre: datos.nombre,
        precio: datos.precio,
        ingredienteId,
        cantidad: ingredienteId ? (datos.cantidad ?? null) : null,
        disponible: datos.disponible ?? true,
        empaqueParaLlevar: datos.empaqueParaLlevar ?? false,
      },
      include: { ingrediente: true },
    });
  }

  async actualizar(id: number, datos: any, empresaId: number) {
    const actual = await this.obtener(id, empresaId);
    const tieneIngrediente = datos.ingredienteId !== undefined;
    const ingredienteId = tieneIngrediente
      ? await this.validarIngrediente(datos.ingredienteId, empresaId)
      : undefined;
    this.validarEmpaque(datos.empaqueParaLlevar ?? actual.empaqueParaLlevar,
      tieneIngrediente ? ingredienteId : actual.ingredienteId,
      datos.cantidad === undefined ? actual.cantidad : datos.cantidad);
    if (empresaId === 1) this.validarConfiguracion(datos.precio ?? actual.precio,
      tieneIngrediente ? ingredienteId : actual.ingredienteId,
      datos.cantidad === undefined ? actual.cantidad : datos.cantidad);

    return this.prisma.adicional.update({
      where: { id },
      data: {
        nombre: datos.nombre,
        precio: datos.precio,
        disponible: empresaId === 1 ? (datos.disponible ?? true) : datos.disponible,
        empaqueParaLlevar: datos.empaqueParaLlevar,
        ...(tieneIngrediente && {
          ingredienteId,
          cantidad: ingredienteId ? (datos.cantidad ?? null) : null,
        }),
        ...(!tieneIngrediente &&
          datos.cantidad !== undefined && { cantidad: datos.cantidad }),
      },
      include: { ingrediente: true },
    });
  }

  async eliminar(id: number, empresaId: number) {
    await this.obtener(id, empresaId);
    return this.prisma.adicional.update({
      where: { id },
      data: { activo: false },
    });
  }

  private async obtener(id: number, empresaId: number) {
    const adicional = await this.prisma.adicional.findFirst({
      where: { id, empresaId },
    });
    if (!adicional) throw new NotFoundException('Adicional no encontrado');
    return adicional;
  }

  private validarEmpaque(empaque: unknown, ingredienteId: number | null | undefined, cantidad: unknown) {
    if (typeof empaque !== 'boolean') throw new BadRequestException('La opción de empaque debe ser válida');
    if (empaque && (!ingredienteId || !Number.isFinite(Number(cantidad)) || Number(cantidad) <= 0))
      throw new BadRequestException('El empaque requiere un ingrediente y una cantidad mayor que cero');
  }

  private validarConfiguracion(precio: unknown, ingredienteId: number | null | undefined, cantidad: unknown) {
    if (precio === null || precio === '' || !Number.isFinite(Number(precio)) || Number(precio) < 0)
      throw new BadRequestException('Indica un precio válido; puede ser cero si está incluido');
    if (ingredienteId && (!Number.isFinite(Number(cantidad)) || Number(cantidad) <= 0))
      throw new BadRequestException('Indica el gramaje o cantidad a descontar por cada adicional');
  }

  private async validarIngrediente(
    ingredienteId?: number | null,
    empresaId?: number,
  ): Promise<number | null> {
    if (!ingredienteId) return null;
    const ingrediente = await this.prisma.ingrediente.findFirst({
      where: { id: ingredienteId, empresaId },
    });
    if (!ingrediente)
      throw new BadRequestException('Ingrediente no encontrado');
    return ingredienteId;
  }
}
