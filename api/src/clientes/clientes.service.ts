import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async listar(empresaId: number, busqueda?: string) {
    return this.prisma.cliente.findMany({
      where: {
        empresaId,
        activo: true,
        ...(busqueda && {
          OR: [
            { nombre: { contains: busqueda, mode: 'insensitive' } },
            { telefono: { contains: busqueda } },
            { documento: { contains: busqueda } },
          ],
        }),
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async crear(datos: any, empresaId: number) {
    return this.prisma.cliente.create({
      data: {
        empresaId,
        nombre: datos.nombre,
        documento: datos.documento || null,
        telefono: datos.telefono || null,
        email: datos.email || null,
        direccion: datos.direccion || null,
        fechaNacimiento: datos.fechaNacimiento ? new Date(datos.fechaNacimiento) : null,
      },
    });
  }

  async actualizar(id: number, datos: any, empresaId: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.cliente.update({
      where: { id, empresaId },
      data: {
        nombre: datos.nombre ?? cliente.nombre,
        documento: datos.documento !== undefined ? datos.documento : cliente.documento,
        telefono: datos.telefono !== undefined ? datos.telefono : cliente.telefono,
        email: datos.email !== undefined ? datos.email : cliente.email,
        direccion: datos.direccion !== undefined ? datos.direccion : cliente.direccion,
        fechaNacimiento: datos.fechaNacimiento !== undefined
          ? (datos.fechaNacimiento ? new Date(datos.fechaNacimiento) : null)
          : cliente.fechaNacimiento,
      },
    });
  }

  async toggleActivo(id: number, empresaId: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.cliente.update({
      where: { id, empresaId },
      data: { activo: !cliente.activo },
    });
  }

  async obtenerDetalle(id: number, empresaId: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id, empresaId },
      include: {
        pedidos: {
          orderBy: { creadoEn: 'desc' },
          take: 50,
          include: { detalles: { include: { producto: true } } },
        },
      },
    });

    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const totalGastado = cliente.pedidos
      .filter(p => p.estado !== 'ANULADO')
      .reduce((acc, p) => acc + Number(p.total), 0);

    const totalPedidos = cliente.pedidos.filter(p => p.estado !== 'ANULADO').length;

    return { ...cliente, totalGastado, totalPedidos };
  }

  async agregarPuntos(clienteId: number, puntos: number, empresaId: number) {
    if (!Number.isInteger(puntos) || puntos <= 0) throw new BadRequestException('Ingrese una cantidad entera positiva de puntos');
    return this.prisma.cliente.update({
      where: { id: clienteId, empresaId },
      data: { puntos: { increment: puntos } },
    });
  }

  async redimirPuntos(clienteId: number, puntos: number, empresaId: number) {
    throw new BadRequestException('Canjee los puntos desde una venta en POS para aplicar y registrar el descuento.');
  }
}
