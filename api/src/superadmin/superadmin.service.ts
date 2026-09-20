import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TipoNegocio } from '@prisma/client';

const tiposNegocio = Object.values(TipoNegocio);

function validarTipoNegocio(valor: unknown): TipoNegocio {
  if (typeof valor !== 'string' || !tiposNegocio.includes(valor as TipoNegocio)) {
    throw new BadRequestException('Tipo de negocio no válido');
  }
  return valor as TipoNegocio;
}

@Injectable()
export class SuperadminService {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  async crearEmpresa(datos: any, usuarioId?: number) {
    const { empresa, admin, administradores, plan = 'BASICO', permisos = {} } = datos;
    const tipoNegocio = validarTipoNegocio(empresa?.tipoNegocio ?? 'RESTAURANTE');
    const listaAdministradores = Array.isArray(administradores) && administradores.length > 0
      ? administradores
      : admin
        ? [admin]
        : [];

    if (listaAdministradores.length === 0) {
      throw new ConflictException('Debe indicar al menos 1 administrador para la empresa');
    }

    if (listaAdministradores.length > 3) {
      throw new ConflictException('La empresa puede tener máximo 3 administradores');
    }

    const empresaExistente = await this.prisma.empresa.findUnique({ where: { nit: empresa.nit } });
    if (empresaExistente) throw new ConflictException('Ya existe una empresa con ese NIT');

    const emailsUsados = new Set<string>();
    for (const administrador of listaAdministradores) {
      if (!administrador?.nombre || !administrador?.email || !administrador?.password) {
        throw new ConflictException('Cada administrador debe tener nombre, email y contraseña');
      }

      const emailNormalizado = administrador.email.trim().toLowerCase();
      if (emailsUsados.has(emailNormalizado)) {
        throw new ConflictException(`El email ${emailNormalizado} está repetido en la lista de administradores`);
      }

      const usuarioExistente = await this.prisma.usuario.findUnique({ where: { email: emailNormalizado } });
      if (usuarioExistente) {
        throw new ConflictException(`Ya existe un usuario con el email ${emailNormalizado}`);
      }

      emailsUsados.add(emailNormalizado);
    }

    const creada = await this.prisma.empresa.create({
      data: {
        nombre: empresa.nombre,
        nit: empresa.nit,
        email: empresa.email,
        telefono: empresa.telefono || null,
        direccion: empresa.direccion || null,
        tipoNegocio,
        plan,
        permisos,
        sucursales: { create: { nombre: 'Sucursal Principal', direccion: empresa.direccion || null, telefono: empresa.telefono || null } },
      },
      include: { sucursales: true },
    });

    const administradoresCreados = [] as Array<{ id: number; nombre: string; email: string; rol: string }>;

    for (const administrador of listaAdministradores) {
      const password = await bcrypt.hash(administrador.password, 10);
      const usuarioCreado = await this.prisma.usuario.create({
        data: {
          nombre: administrador.nombre,
          email: administrador.email.trim().toLowerCase(),
          password,
          rol: 'ADMIN_EMPRESA',
          empresaId: creada.id,
          sucursalId: creada.sucursales[0].id,
          permisos: { global: true },
        },
      });

      administradoresCreados.push({
        id: usuarioCreado.id,
        nombre: usuarioCreado.nombre,
        email: usuarioCreado.email,
        rol: usuarioCreado.rol,
      });
    }

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'EMPRESA',
      entidadId: creada.id,
      usuarioId,
      detalle: { plan, tipoNegocio, administradores: administradoresCreados.map((admin) => ({ nombre: admin.nombre, email: admin.email })) },
    });

    return {
      id: creada.id,
      nombre: creada.nombre,
      tiendaRuta: `/tienda/${creada.tiendaSlug}`,
      nit: creada.nit,
      plan: creada.plan,
      tipoNegocio: creada.tipoNegocio,
      administradores: administradoresCreados,
      sucursal: {
        id: creada.sucursales[0].id,
        nombre: creada.sucursales[0].nombre,
      },
    };
  }

  async resumen() {
    const [empresas, activas, usuarios] = await Promise.all([
      this.prisma.empresa.count(),
      this.prisma.empresa.count({ where: { activo: true } }),
      this.prisma.usuario.count({ where: { activo: true } }),
    ]);

    return {
      empresas,
      empresasActivas: activas,
      usuariosActivos: usuarios,
    };
  }

  async listarEmpresas() {
    const empresas = await this.prisma.empresa.findMany({
      include: {
        _count: { select: { usuarios: true, sucursales: true } },
      },
      orderBy: { creadoEn: 'desc' },
    });

    return empresas;
  }

  async cambiarEstadoEmpresa(id: number, activo: boolean, usuarioId?: number) {
    if (typeof activo !== 'boolean') throw new BadRequestException('El estado debe ser verdadero o falso');
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const actualizada = await this.prisma.empresa.update({
      where: { id },
      data: { activo },
      select: { id: true, nombre: true, nit: true, activo: true },
    });
    await this.auditoria.registrar({ accion: activo ? 'ACTIVAR' : 'DESACTIVAR', entidad: 'EMPRESA', entidadId: id, usuarioId, detalle: { activo } });
    return actualizada;
  }

  async editarEmpresa(id: number, datos: { nombre: string; nit: string; email: string; telefono?: string; direccion?: string }, usuarioId?: number) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const nombre = datos.nombre?.trim();
    const nit = datos.nit?.trim();
    const email = datos.email?.trim().toLowerCase();
    if (!nombre || !nit || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Nombre, NIT y email válido son obligatorios');
    }
    const nitExistente = await this.prisma.empresa.findUnique({ where: { nit } });
    if (nitExistente && nitExistente.id !== id) throw new ConflictException('Ya existe una empresa con ese NIT');
    const actualizada = await this.prisma.empresa.update({
      where: { id },
      data: { nombre, nit, email, telefono: datos.telefono?.trim() || null, direccion: datos.direccion?.trim() || null },
      select: { id: true, nombre: true, nit: true, email: true, telefono: true, direccion: true, activo: true },
    });
    await this.auditoria.registrar({ accion: 'EDITAR', entidad: 'EMPRESA', entidadId: id, usuarioId, detalle: { anterior: { nombre: empresa.nombre, nit: empresa.nit }, nuevo: { nombre, nit } } });
    return actualizada;
  }

  async eliminarEmpresa(id: number, usuarioId?: number) {
    await this.prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.findUnique({ where: { id }, select: { id: true, nombre: true, nit: true } });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      const [categorias, productos, clientes, movimientos, adicionales, preparaciones, lotes, consumos, pedidosWeb, pedidos, cajas, movimientosInventario, ingredientes] = await Promise.all([
        tx.categoria.count({ where: { empresaId: id } }),
        tx.producto.count({ where: { empresaId: id } }),
        tx.cliente.count({ where: { empresaId: id } }),
        tx.movimientoFinanciero.count({ where: { empresaId: id } }),
        tx.adicional.count({ where: { empresaId: id } }),
        tx.preparacion.count({ where: { empresaId: id } }),
        tx.lotePreparacion.count({ where: { empresaId: id } }),
        tx.consumoEmpleado.count({ where: { empresaId: id } }),
        tx.pedidoWeb.count({ where: { empresaId: id } }),
        tx.pedido.count({ where: { sucursal: { empresaId: id } } }),
        tx.caja.count({ where: { sucursal: { empresaId: id } } }),
        tx.movimientoInventario.count({ where: { usuario: { empresaId: id } } }),
        tx.ingrediente.count({ where: { empresaId: id } }),
      ]);
      if ([categorias, productos, clientes, movimientos, adicionales, preparaciones, lotes, consumos, pedidosWeb, pedidos, cajas, movimientosInventario, ingredientes].some(Boolean)) {
        throw new ConflictException('La empresa tiene datos cargados o actividad. Desactívala para conservar su historial.');
      }
      const usuarios = await tx.usuario.findMany({ where: { empresaId: id }, select: { id: true } });
      await tx.auditoria.updateMany({ where: { usuarioId: { in: usuarios.map((usuario) => usuario.id) } }, data: { usuarioId: null } });
      await tx.auditoria.updateMany({ where: { empresaId: id }, data: { empresaId: null } });
      await tx.usuario.deleteMany({ where: { empresaId: id } });
      await tx.sucursal.deleteMany({ where: { empresaId: id } });
      await tx.empresa.delete({ where: { id } });
      await tx.auditoria.create({ data: { accion: 'ELIMINAR', entidad: 'EMPRESA', entidadId: id, usuarioId, detalle: { nombre: empresa.nombre, nit: empresa.nit } } });
    });
    return { eliminado: true, id };
  }

  async actualizarConfiguracion(
    id: number,
    datos: {
      plan?: 'BASICO' | 'MEDIUM' | 'PREMIUM';
      permisos?: Record<string, boolean>;
      modoPreparacion?: 'KDS' | 'COMANDAS';
      facturacionElectronicaHabilitada?: boolean;
      consumoEmpleadosHabilitado?: boolean;
      tipoNegocio?: TipoNegocio;
    },
    usuarioId?: number,
  ) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const tipoNegocio = datos.tipoNegocio === undefined ? undefined : validarTipoNegocio(datos.tipoNegocio);

    const actualizada = await this.prisma.empresa.update({
      where: { id },
      data: {
        ...(datos.plan ? { plan: datos.plan } : {}),
        ...(tipoNegocio ? { tipoNegocio } : {}),
        ...(datos.permisos ? { permisos: datos.permisos } : {}),
        ...(datos.modoPreparacion ? { modoPreparacion: datos.modoPreparacion } : {}),
        ...(datos.facturacionElectronicaHabilitada !== undefined ? { facturacionElectronicaHabilitada: datos.facturacionElectronicaHabilitada } : {}),
        ...(datos.consumoEmpleadosHabilitado !== undefined ? { consumoEmpleadosHabilitado: datos.consumoEmpleadosHabilitado } : {}),
      },
      select: { id: true, nombre: true, plan: true, tipoNegocio: true, permisos: true, modoPreparacion: true, facturacionElectronicaHabilitada: true, consumoEmpleadosHabilitado: true, activo: true },
    });
    await this.auditoria.registrar({ accion: 'CONFIGURAR', entidad: 'EMPRESA', entidadId: id, usuarioId, detalle: datos });
    return actualizada;
  }

  listarAuditoria() {
    return this.prisma.auditoria.findMany({
      include: {
        usuario: { select: { nombre: true, email: true } },
        empresa: { select: { nombre: true } },
      },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
  }
}
