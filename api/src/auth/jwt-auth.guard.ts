import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Mientras la empresa exija la verificación en dos pasos y el usuario no la tenga, solo puede activarla.
export const DOS_PASOS_REQUERIDO = 'DOS_PASOS_REQUERIDO';
// Modo soporte: solo lectura. Se permite registrar la navegación (auditoría) y cerrar la sesión.
export function escrituraPermitidaEnSoporte(metodo: string, url: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(String(metodo || '').toUpperCase())) return true;
  return ['/actividad/vista', '/actividad/salir'].includes(String(url || '').split('?')[0]);
}
export function rutaPermitidaSinDosPasos(url: string) {
  return /^\/auth\/seguridad(\/|$)/.test(String(url || '').split('?')[0]);
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    const usuario = super.handleRequest(err, user, info, context, status);
    if (usuario?.soporte) {
      const req = context.switchToHttp().getRequest();
      if (!escrituraPermitidaEnSoporte(req?.method, req?.originalUrl || req?.url))
        throw new ForbiddenException({ error: 'SOPORTE_SOLO_LECTURA', message: 'Modo soporte: solo lectura. No se pueden hacer cambios.' });
    }
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
