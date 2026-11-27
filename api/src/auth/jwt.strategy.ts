import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { jwtSecret } from './jwt-secret';
import { SeguridadCuentaService } from './seguridad-cuenta.service';
import { NOMBRE_SOPORTE, SoporteService } from './soporte.service';

export function rutaConTokenEnEnlace(url: unknown) {
  return String(url || '').split('?')[0] === '/pedidos/stream';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly seguridad?: SeguridadCuentaService, @Optional() private readonly soporte?: SoporteService) {
    super({
      // La sesión en el enlace (?token=) solo se acepta en la transmisión en vivo de pedidos, que no puede enviar
      // cabeceras (EventSource). En el resto de rutas un enlace con sesión podría quedar en registros o historiales.
      jwtFromRequest: (request) =>
        ExtractJwt.fromAuthHeaderAsBearerToken()(request) ||
        (rutaConTokenEnEnlace(request?.originalUrl || request?.url) && typeof request.query?.token === 'string' ? request.query.token : null),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: any) {
    if (this.prisma.control) await this.prisma.estadoAislamiento();
    if (payload?.soporte !== undefined) return this.validarSoporte(payload);
    let base = this.prisma.control || this.prisma;
    if (this.prisma.aislamientoActivo && payload.rol !== 'SUPERADMIN') {
      if (!Number.isSafeInteger(payload.empresaId) || !Number.isSafeInteger(payload.sucursalId)) throw new UnauthorizedException('La sesión requiere una sede válida');
      base = (await this.prisma.contexto(payload.empresaId,payload.sucursalId)).cliente;
    }
    const usuario = await base.usuario.findUnique({
      where: { id: payload.sub },
      include: {
        empresa: {
          select: {
            activo: true,
            plan: true,
            permisos: true,
            suscripcionVenceEn: true,
            pagoExonerado: true,
            distribuidoresHabilitado: true,
            recaudoEfectivoHabilitado: true,
          },
        },
      },
    });
    if (
      !usuario ||
      !usuario.activo ||
      (this.prisma.aislamientoActivo && payload.rol === 'SUPERADMIN' && usuario.rol !== 'SUPERADMIN') ||
      (this.prisma.aislamientoActivo && payload.rol !== 'SUPERADMIN' && (usuario.empresaId !== payload.empresaId || (usuario.sucursalId != null && usuario.sucursalId !== payload.sucursalId && !['ADMIN_EMPRESA','GERENTE'].includes(usuario.rol)))) ||
      (usuario.empresa &&
        !usuario.empresa.activo &&
        usuario.rol !== 'SUPERADMIN')
    ) {
      throw new UnauthorizedException('Cuenta inactiva');
    }
    // Las fichas emitidas antes del registro de sesiones no traen sid y siguen valiendo hasta vencer.
    if (payload.sid !== undefined && (typeof payload.sid !== 'string' || !this.seguridad || !(await this.seguridad.sesionValida(base, usuario.id, payload.sid))))
      throw new UnauthorizedException('La sesión fue cerrada. Inicia sesión de nuevo.');
    const dosPasosPendiente = this.seguridad ? await this.seguridad.dosPasosPendiente(base, usuario) : false;
    const suscripcion = this.prisma.aislamientoActivo && usuario.rol !== 'SUPERADMIN'
      ? await this.prisma.control.empresa.findUnique({ where: { id: usuario.empresaId }, select: { suscripcionVenceEn: true, pagoExonerado: true } }) : usuario.empresa;
    if (this.prisma.aislamientoActivo && usuario.rol !== 'SUPERADMIN' && !suscripcion) throw new UnauthorizedException('Empresa no encontrada');
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      sucursalId: this.prisma.aislamientoActivo && usuario.rol !== 'SUPERADMIN' ? payload.sucursalId : usuario.sucursalId,
      distribuidorId: usuario.distribuidorId,
      empresaPlan: usuario.empresa?.plan,
      permisos: usuario.empresa?.permisos,
      permisosUsuario: usuario.permisos,
      suscripcionVenceEn: suscripcion?.suscripcionVenceEn,
      pagoExonerado: suscripcion?.pagoExonerado,
      distribuidoresHabilitado: usuario.empresa?.distribuidoresHabilitado,
      recaudoEfectivoHabilitado: usuario.empresa?.recaudoEfectivoHabilitado,
      sesionId: typeof payload.sid === 'string' ? payload.sid : undefined,
      ...(dosPasosPendiente ? { dosPasosPendiente: true } : {}),
    };
  }

  // Ficha de soporte: usuario virtual de solo lectura (id 0) con los permisos de la empresa.
  private async validarSoporte(payload: any) {
    if (!this.soporte || payload.rol !== 'ADMIN_EMPRESA' || payload.sub !== 0 || !Number.isSafeInteger(payload.empresaId) || !Number.isSafeInteger(payload.sucursalId))
      throw new UnauthorizedException('Sesión de soporte no válida');
    if (!(await this.soporte.validar(payload))) throw new UnauthorizedException('Sesión de soporte no válida');
    const base: any = this.prisma.aislamientoActivo ? (await this.prisma.contexto(payload.empresaId, payload.sucursalId)).cliente : this.prisma;
    const empresa = await base.empresa.findUnique({ where: { id: payload.empresaId }, select: { activo: true, plan: true, permisos: true, suscripcionVenceEn: true, pagoExonerado: true, distribuidoresHabilitado: true, recaudoEfectivoHabilitado: true } });
    if (!empresa?.activo) throw new UnauthorizedException('Empresa inactiva');
    const suscripcion = this.prisma.aislamientoActivo ? await this.prisma.control.empresa.findUnique({ where: { id: payload.empresaId }, select: { suscripcionVenceEn: true, pagoExonerado: true } }) : empresa;
    return {
      id: 0, nombre: NOMBRE_SOPORTE, email: '', rol: 'ADMIN_EMPRESA', empresaId: payload.empresaId, sucursalId: payload.sucursalId,
      distribuidorId: null, empresaPlan: empresa.plan, permisos: empresa.permisos, permisosUsuario: null,
      suscripcionVenceEn: suscripcion?.suscripcionVenceEn, pagoExonerado: suscripcion?.pagoExonerado,
      distribuidoresHabilitado: empresa.distribuidoresHabilitado, recaudoEfectivoHabilitado: empresa.recaudoEfectivoHabilitado,
      soporte: true, soporteId: Number(payload.soporte),
    };
  }
}
