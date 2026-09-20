import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
@Injectable()
export class PedidosPublicosGuard implements CanActivate {
  private solicitudes = new Map<string, { inicio: number; cantidad: number }>();
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const ahora = Date.now();
    const clave = String(req.ip || req.socket?.remoteAddress || 'unknown');
    for (const [key, value] of this.solicitudes)
      if (ahora - value.inicio > 600000) this.solicitudes.delete(key);
    const actual = this.solicitudes.get(clave) || {
      inicio: ahora,
      cantidad: 0,
    };
    if (actual.cantidad >= 20)
      throw new HttpException(
        'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
        429,
      );
    actual.cantidad++;
    this.solicitudes.set(clave, actual);
    return true;
  }
}
