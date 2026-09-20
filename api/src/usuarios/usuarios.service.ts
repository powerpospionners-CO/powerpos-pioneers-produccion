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

  async actualizar(id: number, datos: any, empresaId: number) {
    await this.obtener(id, empresaId);
    if (datos.rol === 'SUPERADMIN') throw new BadRequestException('Rol no permitido');
    if (datos.sucursalId) {
      const sucursal = await this.prisma.sucursal.findFirst({ where: { id: Number(datos.sucursalId), empresaId } });
      if (!sucursal) throw new BadRequestException('La sucursal no pertenece a esta empresa');
    }

    const data: any = {};
    if (datos.nombre !== undefined) data.nombre = datos.nombre;
    if (datos.rol !== undefined) data.rol = datos.rol;
    if (datos.sucursalId !== undefined) data.sucursalId = datos.sucursalId || null;
    if (datos.permisos !== undefined) data.permisos = datos.permisos;
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
