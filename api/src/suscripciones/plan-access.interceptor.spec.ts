import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { PlanAccessInterceptor } from './plan-access.interceptor';

function contextFor(url: string, user: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: url, user }),
    }),
  } as ExecutionContext;
}

describe('PlanAccessInterceptor optional features', () => {
  const interceptor = new PlanAccessInterceptor();
  const handler = { handle: () => of('ok') };

  it('allows inventory preparations even when the kitchen screen is disabled', async () => {
    await expect(firstValueFrom(interceptor.intercept(
      contextFor('/preparaciones', {
        empresaId: 1, rol: 'ADMIN_EMPRESA', empresaPlan: 'PREMIUM',
        permisos: { inventario: true, cocina: false },
      }), handler,
    ))).resolves.toBe('ok');
  });

  it('blocks preparation writes when inventory access is disabled', async () => {
    await expect(firstValueFrom(interceptor.intercept(
      contextFor('/preparaciones/12/lotes', {
        empresaId: 1, rol: 'ADMIN_EMPRESA', empresaPlan: 'PREMIUM',
        permisos: { inventario: false, cocina: true },
      }), handler,
    ))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks distributor endpoints when disabled', async () => {
    await expect(
      firstValueFrom(interceptor.intercept(
        contextFor('/pedidos-distribuidor', {
          empresaId: 12,
          rol: 'DISTRIBUIDOR',
          distribuidoresHabilitado: false,
        }),
        handler,
      )),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows distributor endpoints when enabled', async () => {
    await expect(
      firstValueFrom(interceptor.intercept(
        contextFor('/distribuidores', {
          empresaId: 12,
          rol: 'ADMIN_EMPRESA',
          distribuidoresHabilitado: true,
        }),
        handler,
      )),
    ).resolves.toBe('ok');
  });

  it('blocks weekly cash-reconciliation endpoints when disabled', async () => {
    await expect(
      firstValueFrom(interceptor.intercept(
        contextFor('/caja/recaudo/consignar', {
          empresaId: 12,
          rol: 'ADMIN_EMPRESA',
          recaudoEfectivoHabilitado: false,
        }),
        handler,
      )),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
