import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { monto } from '../tienda/reglas';
import { gestionPedidos } from './gestion-pedidos';
import { fechaDia } from '../administracion/administracion.service';

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

  async actualizar(id: number, datos: any, empresaId: number, usuarioId?: number) {
    const data: any = {};
    if (datos.nombre !== undefined) {
      if (typeof datos.nombre !== 'string' || !datos.nombre.trim() || datos.nombre.trim().length > 150) throw new BadRequestException('El nombre debe tener entre 1 y 150 caracteres');
      data.nombre = datos.nombre.trim();
    }
    if (datos.codigo !== undefined) {
      if (typeof datos.codigo !== 'string' || !datos.codigo.trim() || datos.codigo.trim().length > 50) throw new BadRequestException('El código debe tener entre 1 y 50 caracteres');
      data.codigo = datos.codigo.trim();
    }
    if (datos.zona !== undefined) data.zona = datos.zona || null;
    if (datos.porcentajeComision !== undefined) data.porcentajeComision = monto(Number(datos.porcentajeComision), 'El % de comisión', 0, 100);
    if (datos.activo !== undefined) {
      if (typeof datos.activo !== 'boolean') throw new BadRequestException('El estado debe ser activo o inactivo');
      data.activo = datos.activo;
    }
    const email = datos.email === undefined ? undefined : String(datos.email).trim().toLowerCase();
    if (email !== undefined && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150)) throw new BadRequestException('El correo no es válido');

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73111, ${empresaId}::integer)`;
      const distribuidor = await tx.distribuidor.findFirst({ where: { id, empresaId } });
      if (!distribuidor) throw new NotFoundException('Distribuidor no encontrado');
      if (data.codigo && await tx.distribuidor.findFirst({ where: { empresaId, codigo: data.codigo, id: { not: id } } })) throw new ConflictException('Ya existe un distribuidor con ese código');
      if (email) {
        const otraCuenta = await tx.usuario.findUnique({ where: { email }, select: { distribuidorId: true, empresaId: true } });
        if (otraCuenta && (otraCuenta.distribuidorId !== id || otraCuenta.empresaId !== empresaId)) throw new ConflictException('Ya existe una cuenta con ese correo');
      }
      const actualizado = await tx.distribuidor.update({ where: { id }, data });
      if (datos.nombre !== undefined || datos.activo !== undefined || datos.password || email !== undefined) {
        const usuarioData: any = {};
        if (datos.nombre !== undefined) usuarioData.nombre = data.nombre;
        if (datos.activo !== undefined) usuarioData.activo = data.activo;
        if (datos.password) usuarioData.password = await bcrypt.hash(String(datos.password), 10);
        if (email !== undefined) usuarioData.email = email;
        const acceso = await tx.usuario.updateMany({ where: { distribuidorId: id, empresaId }, data: usuarioData });
        if (email !== undefined && acceso.count === 0) throw new BadRequestException('Este perfil no tiene una cuenta de acceso vinculada');
      }
      if (usuarioId) await tx.auditoria.create({ data: { empresaId, usuarioId, accion: 'EDITAR', entidad: 'DISTRIBUIDOR', entidadId: id, detalle: { anterior: { codigo: distribuidor.codigo, nombre: distribuidor.nombre, zona: distribuidor.zona, activo: distribuidor.activo, porcentajeComision: Number(distribuidor.porcentajeComision) }, nuevo: { codigo: actualizado.codigo, nombre: actualizado.nombre, zona: actualizado.zona, activo: actualizado.activo, porcentajeComision: Number(actualizado.porcentajeComision) } } } });
      return actualizado;
    });
  }

  private rangoPeriodo(desde?: string, hasta?: string) {
    const periodoHasta = hasta ? /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? new Date(fechaDia(hasta).getTime()+86400000-1) : new Date(hasta) : new Date();
    if (Number.isNaN(periodoHasta.getTime())) throw new BadRequestException('El rango de fechas no es válido');
    const diaHasta = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(periodoHasta);
    const periodoDesde = desde ? /^\d{4}-\d{2}-\d{2}$/.test(desde) ? fechaDia(desde) : new Date(desde) : fechaDia(diaHasta.slice(0,7)+'-01');
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
    const registros = await this.prisma.pedidoDistribuidor.findMany({
      where: { distribuidorId, empresaId, estado: 'ENTREGADO', liquidacionId: null, creadoEn: { gte: periodoDesde, lte: periodoHasta } },
      orderBy: { creadoEn: 'desc' },
    });
    const pedidos = (await gestionPedidos(this.prisma,empresaId,registros)).filter(p=>p.comisionDisponible);
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73111, ${empresaId}::integer)`;
      const registros = await tx.pedidoDistribuidor.findMany({
        where: { distribuidorId, empresaId, estado: 'ENTREGADO', liquidacionId: null, creadoEn: { gte: periodoDesde, lte: periodoHasta } },
      });
      const pedidos = (await gestionPedidos(tx,empresaId,registros)).filter(p=>p.comisionDisponible);
      if (!pedidos.length) throw new BadRequestException('No hay pedidos entregados y pagados pendientes de liquidar en ese periodo');

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
