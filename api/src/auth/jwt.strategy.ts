import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { jwtSecret } from './jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: (request) =>
        ExtractJwt.fromAuthHeaderAsBearerToken()(request) ||
        request.query?.token,
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: any) {
    if (this.prisma.control) await this.prisma.estadoAislamiento();
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
      suscripcionVenceEn: usuario.empresa?.suscripcionVenceEn,
      pagoExonerado: usuario.empresa?.pagoExonerado,
      distribuidoresHabilitado: usuario.empresa?.distribuidoresHabilitado,
      recaudoEfectivoHabilitado: usuario.empresa?.recaudoEfectivoHabilitado,
    };
  }
}
