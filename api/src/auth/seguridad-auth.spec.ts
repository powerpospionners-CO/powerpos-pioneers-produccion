import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { LoginInputPipe, RegistroInputPipe } from './auth-input.pipe';
import { AuthRateGuard } from './auth-rate.guard';
import { PlanAccessInterceptor } from '../suscripciones/plan-access.interceptor';
import { permisoIndividual } from './permisos';

describe('Validación y autorización de acceso', () => {
  it('permite al cajero consultar el catálogo del POS sin conceder edición de productos', async () => {
    const interceptor = new PlanAccessInterceptor();
    const user = {
      empresaId: 1,
      rol: 'CAJERO',
      empresaPlan: 'PREMIUM',
      permisosUsuario: {
        pos: { ver: true, editar: true },
        productos: { ver: false, editar: false },
        clientes: { ver: false, editar: false },
      },
    };
    const contexto = (url: string, method: string) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user, method, url }) }),
      }) as ExecutionContext;
    const handler = { handle: () => of('ok') };
    for (const ruta of [
      '/productos',
      '/productos/comandas/configuracion',
      '/clientes',
    ])
      await expect(
        firstValueFrom(interceptor.intercept(contexto(ruta, 'GET'), handler)),
      ).resolves.toBe('ok');
    await expect(
      firstValueFrom(
        interceptor.intercept(contexto('/productos/1', 'PATCH'), handler),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    user.permisosUsuario.pos.ver = false;
    await expect(
      firstValueFrom(
        interceptor.intercept(contexto('/productos', 'GET'), handler),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rechaza JSON inesperado, sedes inválidas, contraseñas ambiguas y campos privilegiados', () => {
    const pipe = new LoginInputPipe();
    for (const datos of [
      null,
      [],
      { email: 'mal', password: 'x' },
      { email: 'a@b.co', password: 'x', sucursalId: '1' },
      { email: 'a@b.co', password: 'á'.repeat(40) },
      { email: 'a@b.co', password: 'x', rol: 'SUPERADMIN' },
    ])
      expect(() => pipe.transform(datos)).toThrow(BadRequestException);
    expect(
      pipe.transform({ email: 'a@b.co', password: ' clave ' }).password,
    ).toBe(' clave ');
    expect(() =>
      new RegistroInputPipe().transform({
        empresa: {
          nombre: 'Tienda',
          nit: '123',
          email: 'a@b.co',
          plan: 'PREMIUM',
        },
        admin: { nombre: 'Admin', email: 'a@b.co', password: '1234567890' },
      }),
    ).toThrow(BadRequestException);
  });
  it('limita intentos por dirección y recupera acceso al vencer la ventana', async () => {
    const guard = new AuthRateGuard();
    const header = jest.fn();
    const contexto = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/auth/login', ip: '127.0.0.1' }),
        getResponse: () => ({ setHeader: header }),
      }),
    } as unknown as ExecutionContext;
    const ahora = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      for (let i = 0; i < 30; i++)
        expect(await guard.canActivate(contexto)).toBe(true);
      await expect(guard.canActivate(contexto)).rejects.toMatchObject({
        status: 429,
      });
      expect(header).toHaveBeenCalledWith('Retry-After', '900');
      ahora.mockReturnValue(901001);
      expect(await guard.canActivate(contexto)).toBe(true);
    } finally {
      ahora.mockRestore();
    }
  });
  it('un permiso individual no concede edición ni amplía un plan', async () => {
    const interceptor = new PlanAccessInterceptor();
    const user = {
      empresaId: 1,
      rol: 'GERENTE',
      empresaPlan: 'PREMIUM',
      permisos: { productos: true },
      permisosUsuario: { productos: { ver: true, editar: false } },
    };
    const contexto = (method: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ user, method, url: '/productos/1' }),
        }),
      }) as ExecutionContext;
    const handler = { handle: () => of('permitido') };
    await expect(
      firstValueFrom(interceptor.intercept(contexto('GET'), handler)),
    ).resolves.toBe('permitido');
    await expect(
      firstValueFrom(interceptor.intercept(contexto('PATCH'), handler)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    user.permisosUsuario.productos.editar = true;
    user.permisos.productos = false;
    await expect(
      firstValueFrom(interceptor.intercept(contexto('PATCH'), handler)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      permisoIndividual(
        { productos: { ver: false, editar: true } },
        'productos',
        true,
      ),
    ).toBe(false);
  });
});
