import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { AuditoriaService } from './auditoria.service';

@Injectable()
export class ActividadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActividadInterceptor.name);
  constructor(private readonly auditoria: AuditoriaService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const ruta = String(req.route?.path || '').split('?')[0];
    if (Reflect.getMetadata(SSE_METADATA, context.getHandler()) || ruta.startsWith('/auditoria')) return next.handle();
    const registrar = async (respuesta: any, error?: any) => {
      const usuario = req.user || (ruta === '/auth/login' ? respuesta?.usuario : null);
      if (!usuario?.empresaId) return;
      try {
        await this.auditoria.actividad(usuario, {
          metodo: req.method, ruta, estado: error ? (error.getStatus?.() || 500) : context.switchToHttp().getResponse().statusCode,
          recursoId: /^\d+$/.test(String(req.params?.id || '')) ? Number(req.params.id) : undefined,
          campos: ['POST','PATCH','PUT'].includes(req.method) && req.body && typeof req.body === 'object'
            ? Object.keys(req.body).filter(k => !/password|token|secret|codigo|clave|pin/i.test(k)).slice(0, 30) : [],
          ...(req.auditoriaDetalle ? { cambio: req.auditoriaDetalle } : {}),
        });
      } catch { this.logger.error('No se pudo guardar la actividad de la empresa'); }
    };
    return next.handle().pipe(
      mergeMap(resultado => from(registrar(resultado)).pipe(mergeMap(() => from(Promise.resolve(resultado))))),
      catchError(error => from(registrar(null, error)).pipe(mergeMap(() => throwError(() => error)))),
    );
  }
}
