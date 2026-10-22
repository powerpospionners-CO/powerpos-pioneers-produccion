import { AuthService } from './auth.service';
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { suscripcionSuspendida } from '../suscripciones/fechas';

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
});
