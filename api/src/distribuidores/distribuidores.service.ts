import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { monto } from '../tienda/reglas';

@Injectable()
export class DistribuidoresService {
  constructor(private prisma: PrismaService) {}

  // Un distribuidor es, por dentro, un Usuario con rol DISTRIBUIDOR enlazado
  // uno a uno a su perfil (código, zona, % de comisión) — así reutiliza todo
  // el login/JWT ya existente, solo que sus pantallas son otras.
  async crear(datos: any, empresaId: number) {
    const codigo = String(datos.codigo || '').trim();
    const nombre = String(datos.nombre || '').trim();
    const email = String(datos.email || '').trim().toLowerCase();
    if (!codigo || !nombre || !email || !datos.password) throw new BadRequestException('Código, nombre, email y contraseña son obligatorios');
    const porcentajeComision = monto(Number(datos.porcentajeComision), 'El % de comisión', 0, 100);

    const sucursal = await this.prisma.sucursal.findFirst({ where: { id: Number(datos.sucursalId), empresaId, activo: true } });
    if (!sucursal) throw new BadRequestException('La sucursal no pertenece a esta empresa');

    const codigoExiste = await this.prisma.distribuidor.findUnique({ where: { empresaId_codigo: { empresaId, codigo } } });
    if (codigoExiste) throw new ConflictException('Ya existe un distribuidor con ese código');
    const emailExiste = await this.prisma.usuario.findUnique({ where: { email } });
    if (emailExiste) throw new ConflictException('Ya existe una cuenta con ese email');

    const passwordHash = await bcrypt.hash(String(datos.password), 10);

    return this.prisma.$transaction(async (tx) => {
      const distribuidor = await tx.distribuidor.create({
        data: { empresaId, sucursalId: sucursal.id, codigo, nombre, zona: datos.zona || null, porcentajeComision },
      });
      await tx.usuario.create({
        data: {
          nombre, email, password: passwordHash, rol: 'DISTRIBUIDOR',
          empresaId, sucursalId: sucursal.id, distribuidorId: distribuidor.id,
        },
      });
      return distribuidor;
    });
  }

  async listar(empresaId: number) {
    return this.prisma.distribuidor.findMany({
      where: { empresaId },
      include: { sucursal: { select: { nombre: true } }, usuario: { select: { email: true, activo: true } } },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async obtener(id: number, empresaId: number) {
    const distribuidor = await this.prisma.distribuidor.findFirst({
      where: { id, empresaId },
      include: { sucursal: { select: { nombre: true } }, usuario: { select: { email: true, activo: true } } },
    });
    if (!distribuidor) throw new NotFoundException('Distribuidor no encontrado');
    return distribuidor;
  }

  async actualizar(id: number, datos: any, empresaId: number) {
    const distribuidor = await this.obtener(id, empresaId);
    const data: any = {};
    if (datos.nombre !== undefined) data.nombre = String(datos.nombre).trim();
    if (datos.zona !== undefined) data.zona = datos.zona || null;
    if (datos.porcentajeComision !== undefined) data.porcentajeComision = monto(Number(datos.porcentajeComision), 'El % de comisión', 0, 100);
    if (datos.activo !== undefined) data.activo = !!datos.activo;

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.distribuidor.update({ where: { id }, data });
      if (datos.nombre !== undefined || datos.activo !== undefined || datos.password) {
        const usuarioData: any = {};
        if (datos.nombre !== undefined) usuarioData.nombre = data.nombre;
        if (datos.activo !== undefined) usuarioData.activo = data.activo;
        if (datos.password) usuarioData.password = await bcrypt.hash(String(datos.password), 10);
        await tx.usuario.updateMany({ where: { distribuidorId: id }, data: usuarioData });
      }
      return actualizado;
    });
  }

  private rangoPeriodo(desde?: string, hasta?: string) {
    const periodoHasta = hasta ? new Date(hasta) : new Date();
    const periodoDesde = desde ? new Date(desde) : new Date(periodoHasta.getFullYear(), periodoHasta.getMonth(), 1);
    if (Number.isNaN(periodoDesde.getTime()) || Number.isNaN(periodoHasta.getTime()) || periodoDesde > periodoHasta) {
      throw new BadRequestException('El rango de fechas no es válido');
    }
    return { periodoDesde, periodoHasta };
  }

  // Pedidos de un distribuidor en un periodo que todavía no entraron en
  // ninguna liquidación — es lo que se le debe pagar si se liquida ahora.
  async pendientesLiquidar(distribuidorId: number, empresaId: number, desde?: string, hasta?: string) {
    await this.obtener(distribuidorId, empresaId);
    const { periodoDesde, periodoHasta } = this.rangoPeriodo(desde, hasta);
    const pedidos = await this.prisma.pedidoDistribuidor.findMany({
      where: { distribuidorId, empresaId, estado: 'ENTREGADO', liquidacionId: null, creadoEn: { gte: periodoDesde, lte: periodoHasta } },
      orderBy: { creadoEn: 'desc' },
    });
    const totalVentas = pedidos.reduce((acc, p) => acc + Number(p.total), 0);
    const totalComision = pedidos.reduce((acc, p) => acc + Number(p.comisionMonto), 0);
    return { pedidos, cantidadPedidos: pedidos.length, totalVentas, totalComision, periodoDesde, periodoHasta };
  }

  // Agrupa todos los pedidos pendientes del periodo en una sola liquidación,
  // genera el egreso correspondiente en Financiero (así el pago también
  // queda reflejado en el cuadre del negocio) y marca esos pedidos como ya
  // liquidados para que no se puedan volver a incluir en otra liquidación.
  async liquidar(distribuidorId: number, empresaId: number, usuarioId: number, desde?: string, hasta?: string) {
    const distribuidor = await this.obtener(distribuidorId, empresaId);
    const { periodoDesde, periodoHasta } = this.rangoPeriodo(desde, hasta);

    return this.prisma.$transaction(async (tx) => {
      const pedidos = await tx.pedidoDistribuidor.findMany({
        where: { distribuidorId, empresaId, estado: 'ENTREGADO', liquidacionId: null, creadoEn: { gte: periodoDesde, lte: periodoHasta } },
      });
      if (!pedidos.length) throw new BadRequestException('No hay pedidos pendientes de liquidar en ese periodo');

      const totalVentas = Math.round(pedidos.reduce((acc, p) => acc + Number(p.total), 0) * 100) / 100;
      const totalComision = Math.round(pedidos.reduce((acc, p) => acc + Number(p.comisionMonto), 0) * 100) / 100;

      const movimiento = await tx.movimientoFinanciero.create({
        data: {
          empresaId, sucursalId: distribuidor.sucursalId, usuarioId,
          tipo: 'EGRESO', categoria: 'COMISION_DISTRIBUIDOR',
          descripcion: `Liquidación ${distribuidor.codigo} — ${distribuidor.nombre} (${pedidos.length} pedido(s))`,
          monto: totalComision,
        },
      });

      const liquidacion = await tx.liquidacionDistribuidor.create({
        data: {
          empresaId, distribuidorId, usuarioId, periodoDesde, periodoHasta,
          cantidadPedidos: pedidos.length, totalVentas, totalComision,
          movimientoFinancieroId: movimiento.id,
        },
      });

      await tx.pedidoDistribuidor.updateMany({
        where: { id: { in: pedidos.map((p) => p.id) } },
        data: { liquidacionId: liquidacion.id },
      });

      return liquidacion;
    });
  }

  async listarLiquidaciones(empresaId: number, distribuidorId?: number) {
    return this.prisma.liquidacionDistribuidor.findMany({
      where: { empresaId, ...(distribuidorId ? { distribuidorId } : {}) },
      include: { distribuidor: { select: { codigo: true, nombre: true } }, usuario: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
    });
  }
}
