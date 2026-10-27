import { AuthService } from './auth.service';
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { suscripcionSuspendida } from '../suscripciones/fechas';
import { JwtStrategy } from './jwt.strategy';

describe('Acceso según pago de suscripción', () => {
  const vence = new Date('2026-10-20T15:00:00Z');
  afterEach(() => jest.restoreAllMocks());
  it('respeta exactamente los cinco días y la exoneración', () => {
    const empresa = { suscripcionVenceEn: vence, pagoExonerado: false };
    const limite = vence.getTime() + 5 * 86400000;
    expect(suscripcionSuspendida(empresa, limite)).toBe(false);
    expect(suscripcionSuspendida(empresa, limite + 1)).toBe(true);
    expect(suscripcionSuspendida({ ...empresa, pagoExonerado: true }, limite + 1)).toBe(false);
  });
  it('no emite token después del plazo; permite entrar nuevamente al registrar la renovación', async () => {
    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-26T15:00:00Z').getTime());
    const usuario = { id: 1, email: 'admin@example.com', password: 'hash', activo: true, rol: 'ADMIN_EMPRESA', empresaId: 3, empresa: { activo: true, pagoExonerado: false, suscripcionVenceEn: vence } };
    const prisma: any = { usuario: { findUnique: jest.fn().mockResolvedValue(usuario) } };
    const jwt: any = { sign: jest.fn().mockReturnValue('token') };
    const servicio = new AuthService(prisma, jwt);
    await expect(servicio.login(usuario.email, 'correcta')).rejects.toBeInstanceOf(ForbiddenException);
    expect(jwt.sign).not.toHaveBeenCalled();
    usuario.empresa.suscripcionVenceEn = new Date('2026-11-20T15:00:00Z');
    await expect(servicio.login(usuario.email, 'correcta')).resolves.toMatchObject({ access_token: 'token' });
  });
  it('el acceso de una sede usa el pago central aunque su copia local tenga otra fecha', async () => {
    const usuario = { id: 1, activo: true, rol: 'ADMIN_EMPRESA', empresaId: 3, sucursalId: 8,
      empresa: { activo: true, pagoExonerado: false, suscripcionVenceEn: vence } };
    const central = { pagoExonerado: false, suscripcionVenceEn: new Date('2026-11-20T15:00:00Z') };
    const prisma: any = { aislamientoActivo: true, estadoAislamiento: jest.fn(),
      control: { empresa: { findUnique: jest.fn(async () => central) } },
      contexto: jest.fn(async () => ({ cliente: { usuario: { findUnique: jest.fn(async () => usuario) } } })) };
    const estrategia = Object.assign(Object.create(JwtStrategy.prototype), { prisma }) as JwtStrategy;
    const resultado = await estrategia.validate({ sub: 1, rol: 'ADMIN_EMPRESA', empresaId: 3, sucursalId: 8 });
    expect(resultado.suscripcionVenceEn).toEqual(central.suscripcionVenceEn);
    central.suscripcionVenceEn = new Date('2026-09-01T15:00:00Z');
    usuario.empresa.suscripcionVenceEn = new Date('2026-12-01T15:00:00Z');
    const vencido = await estrategia.validate({ sub: 1, rol: 'ADMIN_EMPRESA', empresaId: 3, sucursalId: 8 });
    expect(suscripcionSuspendida(vencido, new Date('2026-10-26T15:00:00Z').getTime())).toBe(true);
  });
});
