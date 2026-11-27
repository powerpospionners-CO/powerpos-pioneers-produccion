import { JwtService } from '@nestjs/jwt';
import { SoporteService } from './soporte.service';
import { escrituraPermitidaEnSoporte, JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

describe('Modo soporte del superadministrador', () => {
  beforeAll(() => { process.env.JWT_SECRET ||= 'prueba-secreta-de-soporte-123456'; });
  const jwt = new JwtService({ secret: 'prueba-secreta-de-soporte-123456' });
  function escenario(superadmin: any = { id: 1, rol: 'SUPERADMIN', activo: true, nombre: 'Súper' }) {
    const sede: any = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ id: 4, nombre: 'Enchila', activo: true, plan: 'PREMIUM', tipoNegocio: 'TIENDA', permisos: {}, email: 'empresa@x.co' }) },
      usuario: { findMany: jest.fn().mockResolvedValue([{ id: 9, nombre: 'Admin', empresaId: 4 }]) },
    };
    const prisma: any = {
      aislamientoActivo: true,
      control: {
        usuario: { findUnique: jest.fn().mockResolvedValue(superadmin) },
        sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2, nombre: 'Dosquebradas' }) },
        baseSede: { findUnique: jest.fn().mockResolvedValue({ estado: 'ACTIVA' }) },
        auditoria: { create: jest.fn() },
        empresa: { findUnique: jest.fn().mockResolvedValue({ suscripcionVenceEn: null, pagoExonerado: true }) },
      },
      contexto: jest.fn().mockResolvedValue({ cliente: sede }),
      estadoAislamiento: jest.fn(),
    };
    const seguridad: any = { correoPersonal: jest.fn().mockResolvedValue('admin.personal@x.co') };
    const notificaciones: any = { enviarAvisoSoporte: jest.fn().mockResolvedValue(true) };
    return { prisma, sede, notificaciones, s: new SoporteService(prisma, jwt, seguridad, notificaciones) };
  }

  it('solo el superadministrador entra, con motivo, y queda auditado y avisado', async () => {
    const { s, prisma, notificaciones } = escenario();
    await expect(s.iniciar({ id: 5, rol: 'ADMIN_EMPRESA' }, 4, 2, 'Revisar tarifas de IVA')).rejects.toThrow('superadministrador');
    await expect(s.iniciar({ id: 1, rol: 'SUPERADMIN' }, 4, 2, 'corto')).rejects.toThrow('motivo');
    const r: any = await s.iniciar({ id: 1, rol: 'SUPERADMIN' }, 4, 2, 'Revisar tarifas de IVA');
    const ficha: any = jwt.verify(r.access_token);
    expect(ficha).toMatchObject({ sub: 0, rol: 'ADMIN_EMPRESA', empresaId: 4, sucursalId: 2, soporte: 1 });
    expect(ficha.exp - ficha.iat).toBe(30 * 60);
    expect(r.usuario).toMatchObject({ id: 0, soporte: true, empresa: 'Enchila', sucursal: 'Dosquebradas' });
    expect(prisma.control.auditoria.create.mock.calls[0][0].data).toMatchObject({ accion: 'SOPORTE', entidadId: 4, usuarioId: 1, detalle: { motivo: 'Revisar tarifas de IVA', soloLectura: true } });
    await new Promise((r) => setImmediate(r));
    expect(notificaciones.enviarAvisoSoporte.mock.calls.map((c: any[]) => c[0]).sort()).toEqual(['admin.personal@x.co', 'empresa@x.co']);
  });

  it('una sede sin base activa o una empresa inactiva no admiten soporte', async () => {
    const a = escenario();
    a.prisma.control.baseSede.findUnique.mockResolvedValue({ estado: 'PENDIENTE' });
    await expect(a.s.iniciar({ id: 1, rol: 'SUPERADMIN' }, 4, 2, 'Revisar tarifas de IVA')).rejects.toThrow('no está activa');
    const b = escenario();
    b.sede.empresa.findUnique.mockResolvedValue({ activo: false });
    await expect(b.s.iniciar({ id: 1, rol: 'SUPERADMIN' }, 4, 2, 'Revisar tarifas de IVA')).rejects.toThrow('inactiva');
  });

  it('la ficha de soporte es solo lectura y deja de valer si el superadministrador se desactiva', async () => {
    expect(escrituraPermitidaEnSoporte('GET', '/productos')).toBe(true);
    expect(escrituraPermitidaEnSoporte('POST', '/actividad/vista')).toBe(true);
    expect(escrituraPermitidaEnSoporte('PATCH', '/iva/tarifas')).toBe(false);
    expect(escrituraPermitidaEnSoporte('DELETE', '/usuarios/1')).toBe(false);
    const guardia = new JwtAuthGuard();
    const ctx = (method: string, url: string) => ({ switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url }) }) }) as any;
    expect(() => guardia.handleRequest(null, { soporte: true }, null, ctx('POST', '/pedidos'))).toThrow('solo lectura');
    expect(guardia.handleRequest(null, { soporte: true }, null, ctx('GET', '/pedidos'))).toEqual({ soporte: true });

    const { prisma, s } = escenario();
    const estrategia = new JwtStrategy(prisma, undefined, s);
    const usuario: any = await estrategia.validate({ sub: 0, rol: 'ADMIN_EMPRESA', empresaId: 4, sucursalId: 2, soporte: 1 });
    expect(usuario).toMatchObject({ id: 0, rol: 'ADMIN_EMPRESA', soporte: true, soporteId: 1, empresaId: 4 });
    await expect(estrategia.validate({ sub: 7, rol: 'ADMIN_EMPRESA', empresaId: 4, sucursalId: 2, soporte: 1 })).rejects.toThrow('soporte');
    prisma.control.usuario.findUnique.mockResolvedValue({ id: 1, rol: 'SUPERADMIN', activo: false });
    await expect(estrategia.validate({ sub: 0, rol: 'ADMIN_EMPRESA', empresaId: 4, sucursalId: 2, soporte: 1 })).rejects.toThrow('soporte');
  });
});
