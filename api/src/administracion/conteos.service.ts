import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { texto } from './administracion.service';
import type { ActorAdministrativo } from './administracion.service';

export type ConteoInput = {
  descripcion: string;
  items: { productoId: number; stockEsperado: number; stockContado: number }[];
};
@Injectable()
export class ConteosService {
  constructor(private readonly prisma: PrismaService) {}
  listar(empresaId: number) {
    return this.prisma.conteoInventario.findMany({
      where: { empresaId },
      include: { detalles: true },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
  }

  async crear(datos: ConteoInput, actor: ActorAdministrativo) {
    const descripcion = texto(datos.descripcion, 'Descripción del conteo', 500);
    if (
      !Array.isArray(datos.items) ||
      !datos.items.length ||
      datos.items.length > 200
    )
      throw new BadRequestException(
        'El conteo admite entre uno y 200 productos',
      );
    if (
      datos.items.some(
        (i) =>
          !i ||
          !Number.isInteger(i.productoId) ||
          i.productoId <= 0 ||
          !Number.isInteger(i.stockEsperado) ||
          !Number.isInteger(i.stockContado) ||
          i.stockEsperado < 0 ||
          i.stockContado < 0 ||
          i.stockEsperado > 9999999 ||
          i.stockContado > 9999999,
      )
    )
      throw new BadRequestException(
        'Las existencias deben ser enteros entre cero y 9.999.999 en la unidad base',
      );
    const ids = datos.items.map((i) => i.productoId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('No repitas productos en el conteo');
    return this.prisma.$transaction(async (tx) => {
      const productos = await tx.producto.findMany({
        where: {
          id: { in: ids },
          empresaId: actor.empresaId,
          activo: true,
          controlaStock: true,
          esCombo: false,
        },
        select: { id: true, nombre: true, stockActual: true },
      });
      if (productos.length !== ids.length)
        throw new BadRequestException(
          'Hay productos no disponibles para esta empresa',
        );
      const detalles = datos.items.map((i) => {
        const p = productos.find((p) => p.id === i.productoId)!;
        if (p.stockActual !== i.stockEsperado)
          throw new BadRequestException(
            `Cambió el stock de ${p.nombre}. Actualiza y vuelve a contar`,
          );
        return { ...i, productoNombre: p.nombre };
      });
      const conteo = await tx.conteoInventario.create({
        data: {
          empresaId: actor.empresaId,
          usuarioId: actor.id,
          descripcion,
          detalles: { create: detalles },
        },
        include: { detalles: true },
      });
      await tx.auditoria.create({
        data: {
          empresaId: actor.empresaId,
          usuarioId: actor.id,
          entidad: 'CONTEO_INVENTARIO',
          entidadId: conteo.id,
          accion: 'CREAR',
          detalle: { descripcion, productos: detalles },
        },
      });
      return conteo;
    });
  }

  async resolver(
    id: number,
    aprobar: boolean,
    motivoInput: string,
    actor: ActorAdministrativo,
  ) {
    if (typeof aprobar !== 'boolean')
      throw new BadRequestException('Resolución no válida');
    const motivo = texto(motivoInput, 'Motivo de la resolución', 500);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM conteos_inventario WHERE id = ${id} AND "empresaId" = ${actor.empresaId} FOR UPDATE`;
        const conteo = await tx.conteoInventario.findFirst({
          where: { id, empresaId: actor.empresaId },
          include: { detalles: true },
        });
        if (!conteo) throw new NotFoundException('Conteo no encontrado');
        const estado = aprobar ? 'APROBADO' : 'RECHAZADO';
        if (conteo.estado === estado) return conteo;
        if (conteo.estado !== 'PENDIENTE')
          throw new BadRequestException('Este conteo ya fue resuelto');
        if (aprobar) {
          const ids = conteo.detalles
            .map((d) => d.productoId)
            .sort((a, b) => a - b);
          await tx.$queryRaw`SELECT id FROM productos WHERE id IN (${Prisma.join(ids)}) AND "empresaId" = ${actor.empresaId} ORDER BY id FOR UPDATE`;
          for (const d of conteo.detalles) {
            const actual = await tx.producto.findFirst({
              where: {
                id: d.productoId,
                empresaId: actor.empresaId,
                activo: true,
                controlaStock: true,
                esCombo: false,
              },
              select: { stockActual: true },
            });
            if (!actual || actual.stockActual !== d.stockEsperado)
              throw new BadRequestException(
                `El stock de ${d.productoNombre} cambió. Rechaza este conteo y registra uno actualizado`,
              );
            if (d.stockContado === d.stockEsperado) continue;
            await tx.producto.update({
              where: { id: d.productoId },
              data: { stockActual: d.stockContado },
            });
            await tx.movimientoInventario.create({
              data: {
                productoId: d.productoId,
                usuarioId: actor.id,
                tipo: 'AJUSTE',
                cantidadMovida: Math.abs(d.stockContado - d.stockEsperado),
                stockAnterior: d.stockEsperado,
                stockNuevo: d.stockContado,
                descripcion: `Conteo aprobado #${id}: ${motivo}`,
              },
            });
          }
        }
        const resultado = await tx.conteoInventario.update({
          where: { id },
          data: {
            estado,
            aprobadorId: actor.id,
            motivoResolucion: motivo,
            resueltoEn: new Date(),
          },
          include: { detalles: true },
        });
        await tx.auditoria.create({
          data: {
            empresaId: actor.empresaId,
            usuarioId: actor.id,
            entidad: 'CONTEO_INVENTARIO',
            entidadId: id,
            accion: estado,
            detalle: {
              motivo,
              solicitadoPor: conteo.usuarioId,
              resueltoPor: actor.id,
            },
          },
        });
        return resultado;
      },
      { timeout: 15000 },
    );
  }
}
