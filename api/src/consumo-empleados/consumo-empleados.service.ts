import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class ConsumoEmpleadosService {
  constructor(
    private prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private obtenerCantidadInventario(ingrediente: any, cantidadReceta: number) {
    const factorConversion = Number(ingrediente?.factorConversion ?? 0);
    const tieneUnidadCompra =
      !!ingrediente?.unidadCompra &&
      String(ingrediente.unidadCompra).trim() !== '' &&
      factorConversion > 0;

    if (!tieneUnidadCompra) {
      return Number(cantidadReceta);
    }

    return Number(cantidadReceta) * factorConversion;
  }

  async crear(datos: any, usuarioId: number, empresaId: number) {
    const { sucursalId, empleadoNombre, items, observacion } = datos;

    const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    if (!empresa.consumoEmpleadosHabilitado) {
      throw new ForbiddenException('Tu empresa no tiene habilitado el registro de consumo de empleados. Solicítalo al superadmin.');
    }

    if (!empleadoNombre || !String(empleadoNombre).trim()) {
      throw new BadRequestException('Debes indicar el nombre del empleado');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Debes agregar al menos un producto consumido');
    }

    const sucursal = await this.prisma.sucursal.findFirst({
      where: { id: sucursalId, empresaId, activo: true },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada para esta empresa');

    const itemsValidados = [];
    for (const item of items) {
      const producto = await this.prisma.producto.findFirst({
        where: { id: item.productoId, empresaId, activo: true },
        include: { ingredientes: { include: { ingrediente: true } } },
      });
      if (!producto) {
        throw new NotFoundException(`Producto ${item.productoId} no encontrado`);
      }
      const cantidad = Math.max(1, Math.floor(Number(item.cantidad) || 1));
      itemsValidados.push({ producto, cantidad });
    }

    const consumo = await this.prisma.consumoEmpleado.create({
      data: {
        empresaId,
        sucursalId,
        usuarioId,
        empleadoNombre: String(empleadoNombre).trim(),
        observacion: observacion || null,
        items: {
          create: itemsValidados.map((item) => ({
            productoId: item.producto.id,
            cantidad: item.cantidad,
            precioReferencia: item.producto.precio,
          })),
        },
      },
      include: {
        items: { include: { producto: true } },
        usuario: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
      },
    });

    for (const item of itemsValidados) {
      for (const productoIngrediente of item.producto.ingredientes) {
        const cantidadADescontar =
          this.obtenerCantidadInventario(
            productoIngrediente.ingrediente,
            Number(productoIngrediente.cantidad),
          ) * item.cantidad;

        await this.prisma.ingrediente.update({
          where: { id: productoIngrediente.ingredienteId },
          data: { stock: { decrement: cantidadADescontar } },
        });
      }
    }

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'CONSUMO_EMPLEADO',
      entidadId: consumo.id,
      empresaId,
      usuarioId,
      detalle: {
        empleadoNombre: consumo.empleadoNombre,
        productos: itemsValidados.map((item) => ({ nombre: item.producto.nombre, cantidad: item.cantidad })),
      },
    });

    return consumo;
  }

  async listar(empresaId: number, sucursalId?: number) {
    return this.prisma.consumoEmpleado.findMany({
      where: {
        empresaId,
        ...(sucursalId && { sucursalId }),
      },
      include: {
        items: { include: { producto: { select: { nombre: true } } } },
        usuario: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
      },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
  }

  async resumenDelMes(empresaId: number) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const consumos = await this.prisma.consumoEmpleado.findMany({
      where: { empresaId, creadoEn: { gte: inicioMes } },
      include: { items: true },
    });

    const costoEstimado = consumos.reduce(
      (acc, consumo) =>
        acc +
        consumo.items.reduce(
          (subacc, item) => subacc + Number(item.precioReferencia) * item.cantidad,
          0,
        ),
      0,
    );

    return {
      totalRegistros: consumos.length,
      costoEstimadoMes: costoEstimado,
    };
  }
}
