import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
export type OrigenProducto = {
  id: string;
  nombre: string;
  productos: number[];
};
export function leerOrigenes(config: unknown): OrigenProducto[] {
  const value = (config as { origenes?: OrigenProducto[] } | null)?.origenes;
  return Array.isArray(value) ? value : [];
}
export function agregarOrigen<T extends { id: number }>(
  producto: T,
  origenes: OrigenProducto[],
) {
  const origen = origenes.find((o) => o.productos.includes(producto.id));
  return {
    ...producto,
    origen: origen?.nombre || '',
    origenId: origen?.id || null,
  };
}
@Injectable()
export class OrigenesService {
  constructor(private prisma: PrismaService) {}
  async listar(empresaId: number) {
    const e = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { tiendaConfig: true },
    });
    if (!e) throw new NotFoundException('Empresa no encontrada');
    return leerOrigenes(e.tiendaConfig);
  }
  private async cambiar(
    empresaId: number,
    cambio: (
      origenes: OrigenProducto[],
      tx: Prisma.TransactionClient,
    ) => Promise<void> | void,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      const e = await tx.empresa.findUnique({
        where: { id: empresaId },
        select: { tiendaConfig: true },
      });
      if (!e) throw new NotFoundException('Empresa no encontrada');
      const config = (e.tiendaConfig || {}) as Record<
        string,
        Prisma.InputJsonValue
      >;
      const origenes = leerOrigenes(config).map((o) => ({
        ...o,
        productos: [...o.productos],
      }));
      await cambio(origenes, tx);
      await tx.empresa.update({
        where: { id: empresaId },
        data: { tiendaConfig: { ...config, origenes } },
      });
      return origenes;
    });
  }
  guardar(empresaId: number, value: unknown, id?: string) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 60)
      throw new BadRequestException(
        'El origen debe tener entre 1 y 60 caracteres',
      );
    const nombre = value.trim().replace(/\s+/g, ' ');
    if (
      ['todos', 'todos los origenes'].includes(
        nombre
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase(),
      )
    )
      throw new BadRequestException(
        'Usa un nombre de origen distinto de Todos',
      );
    return this.cambiar(empresaId, (origenes) => {
      const clave = (v: string) =>
        v
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
      if (
        origenes.some((o) => o.id !== id && clave(o.nombre) === clave(nombre))
      )
        throw new ConflictException('Ya existe ese origen en tu empresa');
      if (id) {
        const origen = origenes.find((o) => o.id === id);
        if (!origen) throw new NotFoundException('Origen no encontrado');
        origen.nombre = nombre;
      } else {
        if (origenes.length >= 100)
          throw new BadRequestException(
            'Puedes crear hasta 100 orígenes por empresa',
          );
        origenes.push({ id: randomUUID(), nombre, productos: [] });
      }
    });
  }
  asignar(empresaId: number, productoId: number, origenId: unknown) {
    if (
      !Number.isSafeInteger(productoId) ||
      productoId < 1 ||
      (origenId !== null && typeof origenId !== 'string')
    )
      throw new BadRequestException('Producto u origen inválido');
    return this.cambiar(empresaId, async (origenes, tx) => {
      if (
        !(await tx.producto.findFirst({
          where: { id: productoId, empresaId, activo: true },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Producto no encontrado');
      const origen = origenes.find((o) => o.id === origenId);
      if (origenId !== null && !origen)
        throw new BadRequestException('El origen no pertenece a tu empresa');
      for (const o of origenes)
        o.productos = o.productos.filter((id) => id !== productoId);
      origen?.productos.push(productoId);
    });
  }
}
