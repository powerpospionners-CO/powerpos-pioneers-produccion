import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export type Identidad = { id: number; empresaId: number; sucursalId?: number; permisos?: Record<string, unknown> };
const digest = (texto: string) => createHash('sha256').update(texto).digest('hex');

// Cada apartado mantiene autorización, código, intentos y sesiones independientes.
export class AccesoTemporal {
  constructor(protected readonly prisma: PrismaService, private readonly prefijo: string, private readonly modulo: string) {}
  private configuracion(usuario: Identidad) {
    return this.prisma.auditoria.findFirst({ where: { empresaId: usuario.empresaId, entidad: this.prefijo + 'Configuracion', entidadId: usuario.id }, orderBy: { id: 'desc' } });
  }
  async estado(usuario: Identidad) {
    const config = await this.configuracion(usuario);
    return { habilitado: (config?.detalle as any)?.habilitado === true };
  }
  async configurar(id: number, habilitado: boolean, admin: Identidad) {
    if (!Number.isSafeInteger(id) || id < 1 || typeof habilitado !== 'boolean') throw new BadRequestException('Usuario o autorización no válidos');
    const usuario = await this.prisma.usuario.findFirst({ where: { id, empresaId: admin.empresaId, activo: true }, select: { id: true, rol: true } });
    if (!usuario || usuario.rol !== 'CAJERO') throw new BadRequestException('Selecciona un cajero activo de tu empresa');
    const codigo = habilitado ? String(randomInt(10000000, 100000000)) : null;
    await this.prisma.auditoria.create({ data: { empresaId: admin.empresaId, usuarioId: admin.id, entidad: this.prefijo + 'Configuracion', entidadId: id, accion: habilitado ? 'AUTORIZAR' : 'REVOCAR', detalle: { habilitado, hash: codigo ? await bcrypt.hash(codigo, 10) : null } } });
    return { habilitado, codigo, mensaje: habilitado ? 'Entrega este código al usuario. Solo se muestra ahora.' : 'Acceso revocado y sesiones invalidadas.' };
  }
  async desbloquear(usuario: Identidad, codigo: unknown) {
    const config = await this.configuracion(usuario);
    const detalle = config?.detalle as any;
    if (!detalle?.habilitado || usuario.permisos?.[this.modulo] === false) throw new ForbiddenException('El administrador no ha autorizado este acceso');
    await this.prisma.auditoria.create({ data: { empresaId: usuario.empresaId, usuarioId: usuario.id, entidad: this.prefijo + 'Intento', entidadId: usuario.id, accion: 'INTENTO' } });
    const intentos = await this.prisma.auditoria.count({ where: { empresaId: usuario.empresaId, entidad: this.prefijo + 'Intento', entidadId: usuario.id, creadoEn: { gte: new Date(Date.now() - 15 * 60000) } } });
    if (intentos > 5) throw new ForbiddenException('Demasiados intentos. Espera 15 minutos');
    if (typeof codigo !== 'string' || !/^\d{8}$/.test(codigo) || !await bcrypt.compare(codigo, detalle.hash)) throw new ForbiddenException('Código de acceso incorrecto');
    const token = randomBytes(32).toString('hex'), venceEn = Date.now() + 30 * 60000;
    await this.prisma.auditoria.create({ data: { empresaId: usuario.empresaId, usuarioId: usuario.id, entidad: this.prefijo + 'Sesion', entidadId: usuario.id, accion: 'DESBLOQUEAR', detalle: { hash: digest(token), configuracionId: config!.id, venceEn, sucursalId: usuario.sucursalId } } });
    return { token, venceEn };
  }
  async verificar(usuario: Identidad, token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new ForbiddenException('Ingresa el código de acceso');
    if (usuario.permisos?.[this.modulo] === false) throw new ForbiddenException('Este apartado no está habilitado en la empresa');
    const [config, sesion] = await Promise.all([
      this.configuracion(usuario),
      this.prisma.auditoria.findFirst({ where: { empresaId: usuario.empresaId, entidad: this.prefijo + 'Sesion', entidadId: usuario.id }, orderBy: { id: 'desc' } }),
    ]);
    const datos = sesion?.detalle as any;
    if (!(config?.detalle as any)?.habilitado || !datos || datos.configuracionId !== config?.id || datos.venceEn < Date.now() || datos.sucursalId !== usuario.sucursalId || typeof datos.hash !== 'string' || datos.hash.length !== 64 || !timingSafeEqual(Buffer.from(digest(token)), Buffer.from(datos.hash))) throw new ForbiddenException('El acceso venció o fue revocado. Ingresa de nuevo el código');
  }
}
