import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

type Actor = { id: number; rol: string };
// El gerente solo administra al personal operativo; nunca a administradores ni a otros gerentes.
const ROLES_OPERATIVOS = ['CAJERO', 'COCINERO', 'DOMICILIARIO'];
const ROLES_CREABLES = ['ADMIN_EMPRESA', 'GERENTE', ...ROLES_OPERATIVOS];

export function validarClave(password: unknown) {
  if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72)
    throw new BadRequestException('La contraseña debe tener al menos 10 caracteres y un máximo de 72 bytes');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) || !/\d/.test(password))
    throw new BadRequestException('La contraseña debe combinar letras y números');
  return password;
}
const emailValido = (email: unknown) => typeof email === 'string' && email.trim().length <= 191 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const nombreValido = (nombre: unknown) => typeof nombre === 'string' && !!nombre.trim() && nombre.trim().length <= 191;
function puedeAdministrar(actor: Actor | undefined, rolObjetivo: string) {
  if (!actor || actor.rol === 'ADMIN_EMPRESA') return true;
  return actor.rol === 'GERENTE' && ROLES_OPERATIVOS.includes(rolObjetivo);
}
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

  async crear(datos: any, empresaId: number, actor?: Actor) {
    if (!empresaId || !datos || typeof datos !== 'object' || !ROLES_CREABLES.includes(datos.rol)) throw new BadRequestException('Rol o empresa no válidos');
    if (!puedeAdministrar(actor, datos.rol)) throw new ForbiddenException('El gerente solo puede crear cajeros, cocineros y domiciliarios');
    if (!nombreValido(datos.nombre) || !emailValido(datos.email)) throw new BadRequestException('Nombre o correo no válidos');
    validarClave(datos.password);
    if (datos.permisos !== undefined && (!datos.permisos || typeof datos.permisos !== 'object' || Array.isArray(datos.permisos))) throw new BadRequestException('Permisos no válidos');
    datos = { ...datos, nombre: datos.nombre.trim(), email: datos.email.trim().toLowerCase() };
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

  // El personal operativo (p. ej. el cajero que reparte propinas) solo ve nombres y roles, no correos ni permisos.
  async listar(empresaId: number, rol?: string) {
    if (rol && !['ADMIN_EMPRESA', 'GERENTE'].includes(rol))
      return this.prisma.usuario.findMany({ where: { empresaId }, select: { id: true, nombre: true, rol: true, activo: true }, orderBy: { creadoEn: 'asc' } });
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
    if (datos.password !== undefined) validarClave(datos.password);
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
    // Contraseña restablecida por el administrador: las sesiones abiertas de ese usuario se cierran.
    if (datos.password) await this.cerrarSesiones(id);

    const { password, ...resultado } = usuario;
    return resultado;
  }

  async actualizarPermisos(id: number, permisos: any, empresaId: number, actor?: Actor) {
    const objetivo = await this.obtener(id, empresaId);
    if (actor && id === actor.id) throw new ForbiddenException('No puedes cambiar tus propios permisos');
    if (!puedeAdministrar(actor, objetivo.rol)) throw new ForbiddenException('El gerente solo administra cajeros, cocineros y domiciliarios');
    if (!permisos || typeof permisos !== 'object' || Array.isArray(permisos)) throw new BadRequestException('Permisos no válidos');
    const usuario = await this.prisma.usuario.update({
      where: { id },
      data: { permisos },
    });
    const { password, ...resultado } = usuario;
    return resultado;
  }

  async toggleActivo(id: number, empresaId: number, actor?: Actor) {
    const usuario = await this.obtener(id, empresaId);
    if (actor && id === actor.id) throw new ForbiddenException('No puedes desactivar tu propio usuario');
    if (!puedeAdministrar(actor, usuario.rol)) throw new ForbiddenException('El gerente solo administra cajeros, cocineros y domiciliarios');
    // Nunca se deja una empresa sin administradores activos.
    if (usuario.activo && usuario.rol === 'ADMIN_EMPRESA') {
      const otros = await this.prisma.usuario.count({ where: { empresaId, rol: 'ADMIN_EMPRESA', activo: true, NOT: { id } } });
      if (!otros) throw new BadRequestException('La empresa debe conservar al menos un administrador activo');
    }
    return this.prisma.usuario.update({
      where: { id },
      data: { activo: !usuario.activo },
      select: { id: true, nombre: true, activo: true },
    });
  }

  // Cambiar la contraseña o el correo exige la contraseña actual: una sesión olvidada abierta no basta para tomar la cuenta.
  async actualizarPerfilPropio(id: number, datos: any) {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new BadRequestException('Datos no válidos');
    const actual = await this.prisma.usuario.findUnique({ where: { id }, select: { email: true, password: true } });
    if (!actual) throw new NotFoundException('Usuario no encontrado');
    const data: any = {};
    if (datos.nombre !== undefined) {
      if (!nombreValido(datos.nombre)) throw new BadRequestException('Nombre no válido');
      data.nombre = datos.nombre.trim();
    }
    const nuevoEmail = datos.email !== undefined ? (emailValido(datos.email) ? datos.email.trim().toLowerCase() : null) : undefined;
    if (nuevoEmail === null) throw new BadRequestException('Correo no válido');
    const cambiaEmail = nuevoEmail !== undefined && nuevoEmail !== actual.email.toLowerCase();
    const cambiaClave = typeof datos.password === 'string' && datos.password !== '';
    if (cambiaEmail || cambiaClave) {
      if (typeof datos.passwordActual !== 'string' || !(await bcrypt.compare(datos.passwordActual.slice(0, 500), actual.password)))
        throw new ForbiddenException('La contraseña actual no coincide');
    }
    if (cambiaEmail) {
      const duplicado = await this.prisma.usuario.findUnique({ where: { email: nuevoEmail! } });
      if (duplicado && duplicado.id !== id) throw new ConflictException('Ya existe un usuario con ese email');
      data.email = nuevoEmail;
    }
    if (cambiaClave) data.password = await bcrypt.hash(validarClave(datos.password), 10);

    const usuario = await this.prisma.usuario.update({
      where: { id },
      data,
    }).catch((error) => {
      if (error.code === 'P2002') throw new ConflictException('Ya existe un usuario con ese email');
      throw error;
    });
    if (cambiaClave) await this.cerrarSesiones(id);
    const { password, ...resultado } = usuario;
    return resultado;
  }

  // Al cambiar la contraseña se cierran las sesiones registradas del usuario (tabla aditiva; puede no existir).
  private async cerrarSesiones(usuarioId: number) {
    try {
      const tabla = (this.prisma as any).seguridadRegistro;
      if (!tabla) return;
      await tabla.updateMany({ where: { usuarioId, tipo: 'SESION', estado: 'ACTIVA' }, data: { estado: 'REVOCADA' } });
    } catch (e) {
      if (e?.code !== 'P2021') throw e;
    }
  }
}
