import {
  base32,
  codigoTotp,
  desdeBase32,
  firmarDesafio,
  hashRecuperacion,
  leerDesafio,
  verificarTotp,
} from './dos-pasos';
import { SeguridadCuentaService } from './seguridad-cuenta.service';
import { AuthService } from './auth.service';

process.env.JWT_SECRET = 'secreto-de-prueba-suficientemente-largo';
process.env.PERSONAL_ENCRYPTION_KEY = 'b'.repeat(64);

describe('Verificación en dos pasos', () => {
  const secreto = base32(Buffer.from('12345678901234567890'));
  it('cumple el vector de prueba de la RFC 6238', () => {
    expect(secreto).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(desdeBase32(secreto).toString()).toBe('12345678901234567890');
    expect(codigoTotp(secreto, 1)).toBe('287082');
    expect(codigoTotp(secreto, Math.floor(1111111109 / 30))).toBe('081804');
  });
  it('acepta un paso de desfase y nunca un paso ya usado', () => {
    const ahora = 1111111109000;
    const paso = Math.floor(ahora / 30000);
    expect(verificarTotp(secreto, codigoTotp(secreto, paso), 0, ahora)).toBe(paso);
    expect(verificarTotp(secreto, codigoTotp(secreto, paso - 1), 0, ahora)).toBe(paso - 1);
    expect(verificarTotp(secreto, codigoTotp(secreto, paso), paso, ahora)).toBeNull();
    expect(verificarTotp(secreto, codigoTotp(secreto, paso - 3), 0, ahora)).toBeNull();
    expect(verificarTotp(secreto, '12345', 0, ahora)).toBeNull();
  });
  it('el desafío vence, no se puede alterar y no tiene formato de JWT', () => {
    const t = firmarDesafio({ sub: 4, rol: 'ADMIN_EMPRESA', empresaId: 1, sucursalId: 2 });
    expect(t.startsWith('2fa.')).toBe(true);
    expect(leerDesafio(t)?.sub).toBe(4);
    expect(leerDesafio(t, Date.now() + 301000)).toBeNull();
    const [p, , firma] = t.split('.');
    const otro = Buffer.from(JSON.stringify({ sub: 1, rol: 'SUPERADMIN', empresaId: null, sucursalId: null, exp: Date.now() + 1e5 })).toString('base64url');
    expect(leerDesafio(`${p}.${otro}.${firma}`)).toBeNull();
  });
  it('normaliza los códigos de recuperación', () => {
    expect(hashRecuperacion('abcde-fghij')).toBe(hashRecuperacion('ABCDEFGHIJ'));
  });
});

// Base en memoria con la semántica mínima de seguridad_registros.
function baseFalsa() {
  const filas: any[] = [];
  const coincide = (f: any, w: any) =>
    Object.entries(w).every(([k, v]: any) =>
      k === 'NOT' ? !coincide(f, v) : v && typeof v === 'object' && !(v instanceof Date) && ('gte' in v || 'lt' in v) ? ('gte' in v ? f[k] >= v.gte : f[k] < v.lt) : f[k] === v,
    );
  const tabla = {
    findUnique: async ({ where }: any) => filas.find((f) => coincide(f, where.usuarioId_tipo_clave)) || null,
    findMany: async ({ where }: any) => filas.filter((f) => coincide(f, where)),
    create: async ({ data }: any) => { const f = { creadoEn: new Date(), actualizadoEn: new Date(), ...data }; filas.push(f); return f; },
    upsert: async ({ where, create, update }: any) => { const f = filas.find((x) => coincide(x, where.usuarioId_tipo_clave)); if (f) Object.assign(f, update, { actualizadoEn: new Date() }); else filas.push({ creadoEn: new Date(), actualizadoEn: new Date(), ...create }); },
    updateMany: async ({ where, data }: any) => { const fs = filas.filter((f) => coincide(f, where)); fs.forEach((f) => Object.assign(f, data, { actualizadoEn: new Date(Date.now() + 1) })); return { count: fs.length }; },
    deleteMany: async ({ where }: any) => { for (let i = filas.length - 1; i >= 0; i--) if (coincide(filas[i], where)) filas.splice(i, 1); return {}; },
  };
  const db: any = {
    filas,
    $executeRawUnsafe: jest.fn(),
    seguridadRegistro: tabla,
    $transaction: (fn: any) => fn(db),
    usuario: { findUnique: jest.fn() },
  };
  return db;
}

describe('Servicio de seguridad de cuentas', () => {
  const usuario = { id: 7, rol: 'ADMIN_EMPRESA', empresaId: 1, sucursalId: 1, email: 'admin@empresa.co', nombre: 'Admin' };
  it('activa 2FA con un código válido, bloquea tras cinco fallos y consume códigos de recuperación', async () => {
    const db = baseFalsa();
    const s = new SeguridadCuentaService({ control: db, aislamientoActivo: false } as any);
    const { secreto, uri } = await s.iniciar(usuario);
    expect(uri).toContain('otpauth://totp/');
    expect(JSON.stringify(db.filas)).not.toContain(secreto);
    await expect(s.activar(usuario, '000000')).rejects.toThrow('no coincide');
    const { recuperacion } = await s.activar(usuario, codigoTotp(secreto, Math.floor(Date.now() / 30000)));
    expect(recuperacion).toHaveLength(10);
    expect(await s.dosPasosActivo(db, 7)).toBe(true);
    expect(await s.verificar(db, 7, recuperacion[0])).toBe(true);
    expect(await s.verificar(db, 7, recuperacion[0])).toBe(false);
    for (let i = 0; i < 4; i++) expect(await s.verificar(db, 7, '111111')).toBe(false);
    await expect(s.verificar(db, 7, recuperacion[1])).rejects.toThrow('Demasiados');
  });
  it('una sesión revocada deja de ser válida y avisa de dispositivos nuevos', async () => {
    const db = baseFalsa();
    const aviso = { enviarAvisoAcceso: jest.fn().mockResolvedValue(true) };
    const s = new SeguridadCuentaService({ control: db, aislamientoActivo: false } as any, aviso as any);
    const a = await s.crearSesion(db, usuario, { ip: '10.0.0.5', agente: 'Mozilla Chrome/120 Windows' });
    expect(aviso.enviarAvisoAcceso).not.toHaveBeenCalled();
    await s.crearSesion(db, usuario, { ip: '10.0.0.9', agente: 'Mozilla Chrome/120 Windows' });
    expect(aviso.enviarAvisoAcceso).not.toHaveBeenCalled();
    const b = await s.crearSesion(db, usuario, { ip: '181.50.1.1', agente: 'Mozilla Firefox/119 Android' });
    expect(aviso.enviarAvisoAcceso).toHaveBeenCalledTimes(1);
    expect(await s.sesionValida(db, 7, a)).toBe(true);
    await s.cerrarOtras({ ...usuario, sesionId: b });
    expect(await s.sesionValida(db, 7, a)).toBe(false);
    expect(await s.sesionValida(db, 7, b)).toBe(true);
  });
  it('con 2FA activo la contraseña solo entrega un desafío y el código emite la sesión', async () => {
    const db = baseFalsa();
    const s = new SeguridadCuentaService({ control: db, aislamientoActivo: false } as any);
    const { secreto } = await s.iniciar(usuario);
    await s.activar(usuario, codigoTotp(secreto, Math.floor(Date.now() / 30000)));
    const bcrypt = await import('bcrypt');
    const registro = { ...usuario, activo: true, password: await bcrypt.hash('Clave segura 1', 4), empresa: { activo: true, plan: 'PREMIUM' }, sucursal: null, distribuidor: null };
    const prisma: any = { control: db, aislamientoActivo: false, estadoAislamiento: jest.fn(), usuario: { findUnique: jest.fn().mockResolvedValue(registro) } };
    db.usuario.findUnique = jest.fn().mockResolvedValue(registro);
    const jwt = { sign: jest.fn().mockReturnValue('jwt') };
    const auth = new AuthService(prisma, jwt as any, undefined, s);
    const paso1: any = await auth.login('admin@empresa.co', 'Clave segura 1');
    expect(paso1.requiere2fa).toBe(true);
    expect(paso1.access_token).toBeUndefined();
    await expect(auth.loginDosPasos(paso1.desafio, '000000')).rejects.toThrow('incorrecto');
    const paso2: any = await auth.loginDosPasos(paso1.desafio, codigoTotp(secreto, Math.floor(Date.now() / 30000) + 1));
    expect(paso2.access_token).toBe('jwt');
    expect(jwt.sign.mock.calls[0][0].sid).toEqual(expect.any(String));
  });
});
