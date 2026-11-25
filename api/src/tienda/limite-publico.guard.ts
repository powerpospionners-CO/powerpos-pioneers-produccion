import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type Limite = { nombre: string; maximo: number; ventanaMs: number };
const LIMITE = 'tienda:limite';
// Presupuesto por IP y por acción pública; cada acción se cuenta por separado.
export const LimitePublico = (nombre: string, maximo: number, ventanaMs = 600000) =>
  SetMetadata(LIMITE, { nombre, maximo, ventanaMs } satisfies Limite);

@Injectable()
export class LimitePublicoGuard implements CanActivate {
  private readonly cuentas = new Map<string, { inicio: number; cantidad: number }>();
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const limite = this.reflector.get<Limite>(LIMITE, context.getHandler());
    if (!limite) return true;
    const req = context.switchToHttp().getRequest();
    const ahora = Date.now();
    if (this.cuentas.size > 20000)
      for (const [k, v] of this.cuentas)
        if (ahora - v.inicio > 3600000) this.cuentas.delete(k);
    const clave = `${limite.nombre}:${String(req.ip || req.socket?.remoteAddress || 'desconocida')}`;
    const actual = this.cuentas.get(clave);
    const vigente =
      actual && ahora - actual.inicio < limite.ventanaMs
        ? actual
        : { inicio: ahora, cantidad: 0 };
    if (vigente.cantidad >= limite.maximo)
      throw new HttpException(
        'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
        429,
      );
    vigente.cantidad++;
    this.cuentas.set(clave, vigente);
    return true;
  }
}
