import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

const MODULOS = ['pos', 'dashboard', 'productos', 'inventario', 'clientes', 'financiero', 'reportes', 'cocina', 'configuracion'];

function permisosCompletos() {
  return MODULOS.reduce((acc, modulo) => {
    acc[modulo] = { ver: true, editar: true };
    return acc;
  }, {} as Record<string, { ver: boolean; editar: boolean }>);
}

function permisosBasicos() {
  // Por defecto un rol operativo (cajero/cocinero/domiciliario) solo ve POS
  return MODULOS.reduce((acc, modulo) => {
    acc[modulo] = { ver: modulo === 'pos', editar: modulo === 'pos' };
    return acc;
  }, {} as Record<string, { ver: boolean; editar: boolean }>);
}

function permisosPorDefecto(rol: string) {
  if (rol === 'SUPERADMIN' || rol === 'ADMIN_EMPRESA' || rol === 'GERENTE') {
    return permisosCompletos();
  }
  return permisosBasicos();
}

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  async crear(datos: any, empresaId: number) {
    if (!empresaId || datos.rol === 'SUPERADMIN') throw new BadRequestException('Rol o empresa no válidos');
    if (datos.sucursalId) {
      const sucursal = await this.prisma.sucursal.findFirst({ where: { id: Number(datos.sucursalId), empresaId } });
      if (!sucursal) throw new BadRequestException('La sucursal no pertenece a esta empresa');
    }
    const existe = await this.prisma.usuario.findUnique({
      where: { email: datos.email },
    });
    if (existe) throw new ConflictException('Ya existe un usuario con ese email');

    const passwordHash = await bcrypt.hash(datos.password, 10);
    const permisos = datos.permisos || permisosPorDefecto(datos.rol);

    const usuario = await this.prisma.usuario.create({
      data: {
        nombre: datos.nombre,
        email: datos.email,
        password: passwordHash,
        rol: datos.rol,
        empresaId,
        sucursalId: datos.sucursalId || null,
        permisos,
      },
    });

    const { password, ...resultado } = usuario;
    return resultado;
  }

  async listar(empresaId: number) {
    return this.prisma.usuario.findMany({
      where: { empresaId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        permisos: true,
        creadoEn: true,
        sucursalId: true,
        sucursal: { select: { nombre: true } },
      },
      orderBy: { creadoEn: 'asc' },
    });
  }

  async obtener(id: number, empresaId: number) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, empresaId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        permisos: true,
        sucursalId: true,
      },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  async actualizar(id: number, datos: any, empresaId: number, actorId?: number) {
    if (!Number.isSafeInteger(id) || id < 1 || !datos || typeof datos !== 'object' || Array.isArray(datos)) throw new BadRequestException('Datos de usuario no válidos');
    const actual = await this.obtener(id, empresaId);
    if (actual.rol === 'SUPERADMIN' || (datos.rol !== undefined && !['ADMIN_EMPRESA', 'GERENTE', 'CAJERO', 'COCINERO', 'DOMICILIARIO', 'DISTRIBUIDOR'].includes(datos.rol))) throw new BadRequestException('Rol no permitido');
    if (id === actorId && datos.rol !== undefined && datos.rol !== actual.rol) throw new BadRequestException('No puedes cambiar tu propio rol');
    if (datos.nombre !== undefined && (typeof datos.nombre !== 'string' || !datos.nombre.trim() || datos.nombre.trim().length > 191)) throw new BadRequestException('Nombre no válido');
    if (datos.email !== undefined && (typeof datos.email !== 'string' || datos.email.trim().length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim()))) throw new BadRequestException('Email no válido');
    if (datos.password !== undefined && (typeof datos.password !== 'string' || datos.password.length < 10 || Buffer.byteLength(datos.password, 'utf8') > 72)) throw new BadRequestException('La contraseña debe tener al menos 10 caracteres y un máximo de 72 bytes');
    if (datos.sucursalId !== undefined && datos.sucursalId !== null && (!Number.isSafeInteger(datos.sucursalId) || datos.sucursalId < 1)) throw new BadRequestException('Sucursal no válida');
    if (datos.sucursalId) {
      const sucursal = await this.prisma.sucursal.findFirst({ where: { id: Number(datos.sucursalId), empresaId } });
      if (!sucursal) throw new BadRequestException('La sucursal no pertenece a esta empresa');
    }

    const data: any = {};
    if (datos.nombre !== undefined) data.nombre = datos.nombre.trim();
    if (datos.email !== undefined) {
      const email = datos.email.trim().toLowerCase();
      const duplicado = await this.prisma.usuario.findUnique({ where: { email } });
      if (duplicado && duplicado.id !== id) throw new ConflictException('Ya existe un usuario con ese email');
      data.email = email;
    }
    if (datos.rol !== undefined) data.rol = datos.rol;
    if (datos.sucursalId !== undefined) data.sucursalId = datos.sucursalId || null;
    if (datos.permisos !== undefined) data.permisos = datos.permisos;
    if (datos.password) {
      data.password = await bcrypt.hash(datos.password, 10);
    }

    const usuario = await this.prisma.usuario.update({
      where: { id },
      data,
    }).catch(error => {
      if (error.code === 'P2002') throw new ConflictException('Ya existe un usuario con ese email');
      throw error;
    });

    const { password, ...resultado } = usuario;
    return resultado;
  }

  async actualizarPermisos(id: number, permisos: any, empresaId: number) {
    await this.obtener(id, empresaId);
    const usuario = await this.prisma.usuario.update({
      where: { id },
      data: { permisos },
    });
    const { password, ...resultado } = usuario;
    return resultado;
  }

  async toggleActivo(id: number, empresaId: number) {
    const usuario = await this.obtener(id, empresaId);
    return this.prisma.usuario.update({
      where: { id },
      data: { activo: !usuario.activo },
      select: { id: true, nombre: true, activo: true },
    });
  }

  async actualizarPerfilPropio(id: number, datos: any) {
    const data: any = {};
    if (datos.nombre !== undefined) data.nombre = datos.nombre;
    if (datos.email !== undefined) data.email = datos.email;
    if (datos.password) {
      data.password = await bcrypt.hash(datos.password, 10);
    }

    const usuario = await this.prisma.usuario.update({
      where: { id },
      data,
    });
    const { password, ...resultado } = usuario;
    return resultado;
  }
}
