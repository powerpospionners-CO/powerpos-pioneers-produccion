import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: (request) => ExtractJwt.fromAuthHeaderAsBearerToken()(request) || request.query?.token,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'powerpos_secret_key_2024',
    });
  }

  async validate(payload: any) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub }, include: { empresa: { select: { activo: true } } } });
    if (!usuario || !usuario.activo || (usuario.empresa && !usuario.empresa.activo && usuario.rol !== 'SUPERADMIN')) {
      throw new UnauthorizedException('Cuenta inactiva');
    }
    return {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      sucursalId: usuario.sucursalId,
    };
  }
}
