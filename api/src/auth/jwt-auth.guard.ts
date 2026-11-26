import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Mientras la empresa exija la verificación en dos pasos y el usuario no la tenga, solo puede activarla.
export const DOS_PASOS_REQUERIDO = 'DOS_PASOS_REQUERIDO';
export function rutaPermitidaSinDosPasos(url: string) {
  return /^\/auth\/seguridad(\/|$)/.test(String(url || '').split('?')[0]);
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    const usuario = super.handleRequest(err, user, info, context, status);
    if (usuario?.dosPasosPendiente) {
      const req = context.switchToHttp().getRequest();
      if (!rutaPermitidaSinDosPasos(req?.originalUrl || req?.url))
        throw new ForbiddenException({
          error: DOS_PASOS_REQUERIDO,
          message: 'La seguridad de tu cuenta exige la verificación en dos pasos. Actívala en Seguridad para continuar.',
        });
    }
    return usuario;
  }
}
