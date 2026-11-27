import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { SeguridadCuentaService } from './seguridad-cuenta.service';

export const DURACION_SOPORTE_MIN = 30;
export const NOMBRE_SOPORTE = 'Soporte PowerPOS';

// Modo soporte: el superadministrador ve el panel de una sede como su administrador, solo lectura, 30 minutos,
// con motivo, auditado y avisado por correo a los administradores de la empresa.
@Injectable()
export class SoporteService {
  private readonly logger = new Logger(SoporteService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Optional() private readonly seguridad?: SeguridadCuentaService,
    @Optional() private readonly notificaciones?: NotificacionesService,
  ) {}

  private control(): any {
    return this.prisma.control || this.prisma;
  }

  async iniciar(actor: { id: number; rol: string; nombre?: string }, empresaIdRaw: unknown, sucursalIdRaw: unknown, motivoRaw: unknown) {
    if (actor?.rol !== 'SUPERADMIN') throw new ForbiddenException('Solo el superadministrador puede usar el modo soporte');
    const empresaId = Number(empresaIdRaw), sucursalId = Number(sucursalIdRaw);
    const motivo = typeof motivoRaw === 'string' ? motivoRaw.trim() : '';
    if (!Number.isSafeInteger(empresaId) || empresaId < 1 || !Number.isSafeInteger(sucursalId) || sucursalId < 1) throw new BadRequestException('Empresa o sede no válidas');
    if (motivo.length < 10 || motivo.length > 200) throw new BadRequestException('Escribe el motivo del soporte (10 a 200 caracteres)');
    const control = this.control();
    const superadmin = await control.usuario.findUnique({ where: { id: actor.id }, select: { id: true, rol: true, activo: true, nombre: true } });
    if (!superadmin || superadmin.rol !== 'SUPERADMIN' || !superadmin.activo) throw new ForbiddenException('Sesión no válida');
    const sede = await control.sucursal.findFirst({ where: { id: sucursalId, empresaId }, select: { id: true, nombre: true } });
    if (!sede) throw new NotFoundException('La sede no pertenece a esa empresa');
    if (this.prisma.aislamientoActivo) {
      const base = await control.baseSede.findUnique({ where: { empresaId_sucursalId: { empresaId, sucursalId } } });
      if (base?.estado !== 'ACTIVA') throw new BadRequestException('La base de esa sede todavía no está activa');
    }
    const db: any = this.prisma.aislamientoActivo ? (await this.prisma.contexto(empresaId, sucursalId)).cliente : this.prisma;
    const empresa = await db.empresa.findUnique({ where: { id: empresaId } });
    if (!empresa?.activo) throw new BadRequestException('La empresa está inactiva');
    const vence = new Date(Date.now() + DURACION_SOPORTE_MIN * 60000);
    const token = this.jwt.sign({ sub: 0, rol: 'ADMIN_EMPRESA', empresaId, sucursalId, soporte: superadmin.id }, { expiresIn: `${DURACION_SOPORTE_MIN}m` });
    await control.auditoria.create({ data: { accion: 'SOPORTE', entidad: 'EMPRESA', entidadId: empresaId, usuarioId: superadmin.id, detalle: { sucursalId, motivo, vence: vence.toISOString(), soloLectura: true } } });
    this.logger.log(`Modo soporte: superadmin ${superadmin.id} en empresa ${empresaId}, sede ${sucursalId}`);
    void this.avisar(db, empresaId, empresa.nombre, sede.nombre, motivo, vence).catch(() => undefined);
    return {
      access_token: token,
      vence,
      usuario: {
        id: 0, nombre: NOMBRE_SOPORTE, email: '', rol: 'ADMIN_EMPRESA', soporte: true, soporteVence: vence,
        empresa: empresa.nombre, sucursal: sede.nombre, empresaId, sucursalId, plan: empresa.plan, tipoNegocio: empresa.tipoNegocio,
        permisos: empresa.permisos, permisosUsuario: null, modoPreparacion: empresa.modoPreparacion,
        facturacionElectronicaHabilitada: empresa.facturacionElectronicaHabilitada, consumoEmpleadosHabilitado: empresa.consumoEmpleadosHabilitado,
        catalogoHabilitado: empresa.catalogoHabilitado, tiendaSlug: empresa.tiendaSlug,
      },
    };
  }

  // Avisa a los administradores de la empresa en su correo personal registrado, y al correo de la empresa.
  private async avisar(db: any, empresaId: number, empresa: string, sede: string, motivo: string, vence: Date) {
    if (!this.notificaciones) return;
    const admins: any[] = await db.usuario.findMany({ where: { empresaId, rol: 'ADMIN_EMPRESA', activo: true }, select: { id: true, nombre: true, empresaId: true } });
    const correos = new Set<string>();
    for (const a of admins) {
      const correo = this.seguridad ? await this.seguridad.correoPersonal(db, a).catch(() => '') : '';
      if (correo) correos.add(correo.toLowerCase());
    }
    const empresaCorreo = (await db.empresa.findUnique({ where: { id: empresaId }, select: { email: true } }))?.email;
    if (empresaCorreo) correos.add(String(empresaCorreo).toLowerCase());
    await Promise.all([...correos].map((c) => this.notificaciones!.enviarAvisoSoporte(c, empresa, sede, motivo, vence)));
  }

  // Valida una ficha de soporte: el superadministrador sigue activo y la empresa también.
  async validar(payload: any) {
    const superadmin = await this.control().usuario.findUnique({ where: { id: Number(payload.soporte) }, select: { id: true, rol: true, activo: true } });
    if (!superadmin || superadmin.rol !== 'SUPERADMIN' || !superadmin.activo) return null;
    return superadmin;
  }
}
