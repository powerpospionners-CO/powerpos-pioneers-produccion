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
        ...(productoId && { productos: { some: { productoId } } }),
      },
      include: { ingrediente: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async crear(datos: any, empresaId: number) {
    const ingredienteId = await this.validarIngrediente(datos.ingredienteId, empresaId);

    return this.prisma.adicional.create({
      data: {
        empresaId,
        nombre: datos.nombre,
        precio: datos.precio,
        ingredienteId,
        cantidad: ingredienteId ? (datos.cantidad ?? null) : null,
        disponible: datos.disponible ?? true,
      },
      include: { ingrediente: true },
    });
  }

  async actualizar(id: number, datos: any, empresaId: number) {
    await this.obtener(id, empresaId);
    const tieneIngrediente = datos.ingredienteId !== undefined;
    const ingredienteId = tieneIngrediente
      ? await this.validarIngrediente(datos.ingredienteId, empresaId)
      : undefined;

    return this.prisma.adicional.update({
      where: { id },
      data: {
        nombre: datos.nombre,
        precio: datos.precio,
        disponible: datos.disponible,
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
