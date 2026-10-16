import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// El agente de impresión no inicia sesión como un usuario (no tiene rol ni
// permisos, y necesita quedar conectado indefinidamente sin que un JWT de
// 8h lo desconecte). Se identifica con un token propio por empresa,
// generado desde Configuración y sin fecha de expiración.
@Injectable()
export class AgenteImpresionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-agente-token'] || request.query?.token;
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Falta el token del agente de impresión');
    }

    if (this.prisma.control) await this.prisma.estadoAislamiento();
    const scope = this.prisma.aislamientoActivo ? await this.prisma.sedeAgente(token) : null;
    const base = scope?.cliente || this.prisma;
    const empresa = await base.empresa.findUnique({
      where: { impresionAgenteToken: token },
      select: { id: true, activo: true },
    });

    if (!empresa || !empresa.activo) {
      throw new UnauthorizedException('Token de agente de impresión inválido');
    }

    request.empresaId = empresa.id;
    request.sedeContext = scope;
    request.sucursalId = scope?.sucursalId;
    return true;
  }
}
