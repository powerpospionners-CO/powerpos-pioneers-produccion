import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriasService {
  constructor(private prisma: PrismaService) {}

  async crear(datos: any, empresaId: number) {
    return this.prisma.categoria.create({
      data: {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        icono: datos.icono,
        color: datos.color,
        parentId: datos.parentId ? Number(datos.parentId) : null,
        empresaId,
      },
      include: {
        subcategorias: true,
        categoriaPadre: true,
      },
    });
  }

  async listar(empresaId: number) {
    return this.prisma.categoria.findMany({
      where: { empresaId, activo: true },
      include: {
        categoriaPadre: true,
        subcategorias: { where: { activo: true }, orderBy: { nombre: 'asc' } },
        _count: { select: { productos: true } },
      },
      orderBy: [{ parentId: 'asc' }, { nombre: 'asc' }],
    });
  }

  async actualizar(id: number, datos: any, empresaId: number) {
    await this.verificarExistencia(id, empresaId);
    return this.prisma.categoria.update({
      where: { id },
      data: {
        ...datos,
        parentId: datos.parentId !== undefined ? (datos.parentId ? Number(datos.parentId) : null) : undefined,
      },
    });
  }

  async eliminar(id: number, empresaId: number) {
    await this.verificarExistencia(id, empresaId);
    return this.prisma.categoria.update({
      where: { id },
      data: { activo: false },
    });
  }

  private async verificarExistencia(id: number, empresaId: number) {
    const categoria = await this.prisma.categoria.findFirst({
      where: { id, empresaId },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return categoria;
  }
}