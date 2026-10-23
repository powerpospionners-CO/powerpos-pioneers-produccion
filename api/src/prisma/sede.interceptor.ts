import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { SSE_METADATA } from '@nestjs/common/constants';
import { PrismaService } from './prisma.service';
import { contextoSede, ContextoSede } from './sede-context';

@Injectable()
export class SedeInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const ruta = String(req.originalUrl || req.url).split('?')[0];
    const salud = ruta === '/' || ruta === '/health' || ruta === '/health/ready';
    // Liveness no depende de la base. Readiness comprueba sus dependencias
    // dentro del controlador y convierte los fallos en HTTP 503.
    if (salud) return next.handle();
    const write =
      !salud && !Reflect.getMetadata(SSE_METADATA,context.getHandler()) &&
      (!this.prisma.aislamientoActivo || !['GET','HEAD','OPTIONS'].includes(req.method));
    const resolver = async (): Promise<ContextoSede | 'CONTROL'> => {
      const estado = await this.prisma.estadoAislamiento();
      if (estado?.escriturasSuspendidas && !salud) throw new ServiceUnavailableException('Estamos verificando las bases de datos. Espera unos minutos antes de registrar operaciones.');
      if (!this.prisma.aislamientoActivo) return 'CONTROL';
      if (
        req.user?.rol === 'SUPERADMIN' ||
        ruta.startsWith('/auth/') ||
        ruta === '/webhooks/whatsapp' ||
        ruta.startsWith('/suscripciones/') ||
        ruta === '/sucursales' ||
        ruta.startsWith('/sucursales/')
      )
        return 'CONTROL';
      if (req.user)
        return this.prisma.contexto(req.user.empresaId, req.user.sucursalId);
      if (req.sedeContext) return req.sedeContext;
      if (
        /^\/(tiendas|catalogo-publico|registro-clientes)\//.test(ruta) &&
        typeof req.params.slug === 'string'
      ) {
        try {
          return await this.prisma.sedePublica(req.params.slug);
        } catch {
          throw new NotFoundException('No se encontró la sede');
        }
      }
      if (salud) return 'CONTROL';
      throw new ServiceUnavailableException(
        'La solicitud no tiene una sede verificada',
      );
    };
    if (write)
      return from(
        (async () => {
          const scope = await resolver();
          return this.prisma.conEscritura(`HTTP ${req.method}`, () =>
            contextoSede.run(scope, () => lastValueFrom(next.handle())),
          );
        })(),
      );
    return new Observable((subscriber) => {
      let inner: { unsubscribe: () => void } | undefined;
      void resolver()
        .then((scope) => {
          if (!subscriber.closed)
            inner = contextoSede.run(scope, () =>
              next.handle().subscribe(subscriber),
            );
        })
        .catch((e) => subscriber.error(e));
      return () => inner?.unsubscribe();
    });
  }
}
