import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Request, Response } from 'express';

@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(@Optional() private readonly prisma?: PrismaService) {}
  private readonly solicitudes = new Map<
    string,
    { inicio: number; cantidad: number }
  >();
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const ahora = Date.now();
    const ventana = 15 * 60_000;
    for (const [clave, valor] of this.solicitudes)
      if (ahora - valor.inicio >= ventana) this.solicitudes.delete(clave);
    // No confiar en X-Forwarded-For sin un proxy explícitamente configurado.
    const registro = String(req.path || req.url).includes('registrar-empresa');
    const clave = `${registro ? 'registro' : 'login'}:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
    if (process.env.EVENTOS_COMPARTIDOS === 'true' && this.prisma) {
      const hash = createHash('sha256').update(clave).digest('hex');
      const id = `auth-${hash}`;
      const limite = registro ? 5 : 30;
      const permitido = await this.prisma.control.$transaction(async (tx) => {
        // El adaptador MySQL convierte este bloqueo en un bloqueo InnoDB.
        const scope = parseInt(hash.slice(0, 7), 16);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73210, ${scope}::integer)`;
        const anterior = await tx.eventoSistema.findUnique({ where: { id } });
        const vigente = anterior && anterior.venceEn.getTime() > ahora;
        const cantidad = vigente
          ? Number((anterior.datos as { cantidad: number }).cantidad)
          : 0;
        if (cantidad >= limite) return false;
        await tx.eventoSistema.upsert({
          where: { id },
          create: {
            id,
            empresaId: 0,
            canal: 'AUTH_RATE',
            datos: { cantidad: 1 },
            venceEn: new Date(ahora + ventana),
          },
          update: {
            datos: { cantidad: cantidad + 1 },
            ...(!vigente ? { venceEn: new Date(ahora + ventana) } : {}),
          },
        });
        return true;
      });
      if (!permitido) {
        res.setHeader('Retry-After', '900');
        throw new HttpException(
          'Demasiados intentos. Espera antes de volver a intentar.',
          429,
        );
      }
      return true;
    }
    const actual = this.solicitudes.get(clave) || {
      inicio: ahora,
      cantidad: 0,
    };
    if (
      actual.cantidad >= (registro ? 5 : 30) ||
      (!this.solicitudes.has(clave) && this.solicitudes.size >= 10_000)
    ) {
      res.setHeader(
        'Retry-After',
        String(
          Math.max(1, Math.ceil((ventana - (ahora - actual.inicio)) / 1000)),
        ),
      );
      throw new HttpException(
        'Demasiados intentos. Espera antes de volver a intentar.',
        429,
      );
    }
    actual.cantidad++;
    this.solicitudes.set(clave, actual);
    return true;
  }
}
