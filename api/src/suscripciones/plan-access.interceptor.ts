import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';

const MODULOS_POR_PLAN: Record<string, string[]> = {
  BASICO: ['pos', 'productos'],
  MEDIUM: ['pos', 'dashboard', 'productos', 'inventario', 'clientes', 'cocina', 'configuracion'],
  PREMIUM: ['pos', 'dashboard', 'productos', 'inventario', 'clientes', 'financiero', 'reportes', 'cocina', 'configuracion'],
};

const RUTAS_POR_MODULO: Array<[string, string]> = [
  ['/administracion', 'financiero'],
  ['/suscripciones', 'suscripciones'],
  ['/pedidos', 'pos'],
  ['/caja', 'pos'],
  ['/categorias', 'pos'],
  ['/adicionales', 'pos'],
  ['/impresion', 'pos'],
  ['/productos', 'productos'],
  ['/inventario', 'inventario'],
  ['/clientes', 'clientes'],
  ['/financiero', 'financiero'],
  ['/compras', 'financiero'],
  ['/reportes', 'reportes'],
  ['/preparaciones', 'cocina'],
  ['/tareas', 'cocina'],
  ['/usuarios', 'configuracion'],
  ['/sucursales', 'configuracion'],
  ['/empresa', 'configuracion'],
];

@Injectable()
export class PlanAccessInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const usuario = request.user;
    if (!usuario?.empresaId || usuario.rol === 'SUPERADMIN') return next.handle();

    const ruta = String(request.originalUrl || request.url || '').split('?')[0];
    if (ruta.startsWith('/suscripciones')) return next.handle();

    if (
      !usuario.distribuidoresHabilitado &&
      (ruta.startsWith('/distribuidores') || ruta.startsWith('/pedidos-distribuidor'))
    ) {
      return throwError(() => new ForbiddenException({
        error: 'FEATURE_DISABLED',
        message: 'El módulo de distribuidores no está habilitado para esta empresa.',
      }));
    }

    if (
      !usuario.recaudoEfectivoHabilitado &&
      ruta.startsWith('/caja/recaudo/')
    ) {
      return throwError(() => new ForbiddenException({
        error: 'FEATURE_DISABLED',
        message: 'El recaudo semanal de efectivo no está habilitado para esta empresa.',
      }));
    }

    const vencimiento = usuario.suscripcionVenceEn
      ? new Date(usuario.suscripcionVenceEn).getTime()
      : null;
    const diasGracia = 5 * 24 * 60 * 60 * 1000;
    if (
      !usuario.pagoExonerado &&
      vencimiento !== null &&
      Date.now() > vencimiento + diasGracia
    ) {
      return throwError(() => new ForbiddenException({
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'La suscripción venció. Paga o contacta al administrador para restablecer el acceso.',
      }));
    }

    const modulo = RUTAS_POR_MODULO.find(([prefijo]) => ruta.startsWith(prefijo))?.[1];
    if (!modulo) return next.handle();
    const permisos = usuario.permisos && typeof usuario.permisos === 'object'
      ? usuario.permisos as Record<string, unknown>
      : {};
    const permitido = typeof permisos[modulo] === 'boolean'
      ? permisos[modulo]
      : (MODULOS_POR_PLAN[usuario.empresaPlan] || MODULOS_POR_PLAN.BASICO).includes(modulo);
    if (!permitido) {
      return throwError(() => new ForbiddenException({
        error: 'PLAN_MODULE_UNAVAILABLE',
        message: `El módulo "${modulo}" no está incluido en el plan de esta empresa.`,
      }));
    }
    return next.handle();
  }
}
