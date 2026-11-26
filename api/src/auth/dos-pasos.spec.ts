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
import { JwtAuthGuard, rutaPermitidaSinDosPasos } from './jwt-auth.guard';

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
      k === 'NOT' ? !coincide(f, v) : v && typeof v === 'object' && !(v instanceof Date) && 'in' in v ? v.in.includes(f[k]) : v && typeof v === 'object' && !(v instanceof Date) && ('gte' in v || 'lt' in v) ? ('gte' in v ? f[k] >= v.gte : f[k] < v.lt) : f[k] === v,
    );
  const tabla = {
    findUnique: async ({ where }: any) => filas.find((f) => coincide(f, where.usuarioId_tipo_clave)) || null,
    findMany: async ({ where }: any) => filas.filter((f) => coincide(f, where)),
    create: async ({ data }: any) => { const f = { creadoEn: new Date(), actualizadoEn: new Date(), ...data }; filas.push(f); return f; },
    upsert: async ({ where, create, update }: any) => { const f = filas.find((x) => coincide(x, where.usuarioId_tipo_clave)); if (f) Object.assign(f, update, { actualizadoEn: new Date() }); else filas.push({ creadoEn: new Date(), actualizadoEn: new Date(), ...create }); },
    updateMany: async ({ where, data }: any) => { const fs = filas.filter((f) => coincide(f, where)); fs.forEach((f) => Object.assign(f, data, { actualizadoEn: new Date(Date.now() + 1) })); return { count: fs.length }; },
    deleteMany: async ({ where }: any) => { let count = 0; for (let i = filas.length - 1; i >= 0; i--) if (coincide(filas[i], where)) { filas.splice(i, 1); count++; } return { count }; },
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

describe('2FA exigida por la empresa y restablecimiento', () => {
  const admin = { id: 7, rol: 'ADMIN_EMPRESA', empresaId: 1, sucursalId: 1, email: 'admin@empresa.co', nombre: 'Admin' };
  const gerente = { id: 8, rol: 'GERENTE', empresaId: 1, sucursalId: 1, email: 'gerente@empresa.co', nombre: 'Gerente' };
  const paso = () => Math.floor(Date.now() / 30000);
  async function preparar() {
    const bcrypt = await import('bcrypt');
    const clave = await bcrypt.hash('Clave segura 1', 4);
    const usuarios = [
      { ...admin, password: clave },
      { ...gerente, password: clave },
      { id: 9, rol: 'CAJERO', empresaId: 1, nombre: 'Caja', email: 'caja@empresa.co', password: clave },
      { id: 20, rol: 'GERENTE', empresaId: 2, nombre: 'Otra', email: 'otra@empresa.co', password: clave },
    ];
    const db = baseFalsa();
    db.usuario = {
      findUnique: async ({ where }: any) => usuarios.find((u) => u.id === where.id) || null,
      findFirst: async ({ where }: any) => usuarios.find((u) => (where.id === undefined || u.id === where.id) && (where.email === undefined || u.email === where.email) && u.empresaId === where.empresaId) || null,
      findMany: async ({ where }: any) => usuarios.filter((u) => u.empresaId === where.empresaId),
    };
    const aviso = { enviarAvisoDosPasos: jest.fn().mockResolvedValue(true) };
    const s = new SeguridadCuentaService({ control: db, aislamientoActivo: false } as any, aviso as any);
    let ultimaRecuperacion: string[] = [];
    const recuperacion = () => ultimaRecuperacion;
    const activar = async (u: any) => {
      const { secreto } = await s.iniciar(u);
      ultimaRecuperacion = (await s.activar(u, codigoTotp(secreto, paso()))).recuperacion;
      return secreto;
    };
    return { db, s, aviso, activar, recuperacion };
  }

  it('solo el administrador con 2FA propia puede exigirla, y bloquea a gerentes sin ella', async () => {
    const { db, s, activar } = await preparar();
    await expect(s.cambiarPolitica(gerente, true, 'Clave segura 1', '')).rejects.toThrow('administrador');
    await expect(s.cambiarPolitica(admin, true, 'Clave segura 1', '')).rejects.toThrow('Activa primero');
    const secreto = await activar(admin);
    await expect(s.cambiarPolitica(admin, true, 'otra', codigoTotp(secreto, paso() + 1))).rejects.toThrow('contraseña');
    await expect(s.cambiarPolitica(admin, true, 'Clave segura 1', '000000')).rejects.toThrow('código');
    expect(await s.dosPasosPendiente(db, gerente)).toBe(false);
    await s.cambiarPolitica(admin, true, 'Clave segura 1', codigoTotp(secreto, paso() + 1));
    expect(await s.dosPasosPendiente(db, gerente)).toBe(true);
    expect(await s.dosPasosPendiente(db, admin)).toBe(false);
    expect(await s.dosPasosPendiente(db, { id: 9, rol: 'CAJERO' })).toBe(false);
    expect((await s.resumen(gerente)).dosPasosObligatorio).toBe(true);
    expect((await s.resumen(admin)).politicaEmpresa).toBe(true);
    await activar(gerente);
    expect(await s.dosPasosPendiente(db, gerente)).toBe(false);
    await expect(s.desactivar(admin, 'Clave segura 1', '123456')).rejects.toThrow('exige');
  });

  it('el administrador restablece la 2FA de otro usuario de su empresa y le cierra las sesiones', async () => {
    const { db, s, aviso, activar, recuperacion } = await preparar();
    const secreto = await activar(admin);
    const deAdmin = recuperacion();
    await activar(gerente);
    const sid = await s.crearSesion(db, gerente, { ip: '10.0.0.1', agente: 'Chrome' });
    await expect(s.restablecer(gerente, 7, 'Clave segura 1', '')).rejects.toThrow('administrador');
    await expect(s.restablecer(admin, 7, 'Clave segura 1', '')).rejects.toThrow('propia');
    await expect(s.restablecer(admin, 20, 'Clave segura 1', '')).rejects.toThrow('no encontrado');
    await expect(s.restablecer(admin, 9, 'Clave segura 1', codigoTotp(secreto, paso() + 1))).rejects.toThrow('no tiene activa');
    const equipo = await s.equipo(admin);
    expect(equipo.find((u: any) => u.id === 8).dosPasos).toBe(true);
    expect(equipo.some((u: any) => u.id === 20)).toBe(false);
    await s.restablecer(admin, 8, 'Clave segura 1', deAdmin[0]);
    expect(await s.dosPasosActivo(db, 8)).toBe(false);
    expect(await s.sesionValida(db, 8, sid)).toBe(false);
    expect(aviso.enviarAvisoDosPasos).toHaveBeenCalledWith('gerente@empresa.co', 'Gerente', 'Admin');
  });

  it('bloquea la confirmación tras cinco contraseñas incorrectas', async () => {
    const { s, activar } = await preparar();
    await activar(admin);
    for (let i = 0; i < 5; i++) await expect(s.restablecer(admin, 8, 'mala', '')).rejects.toThrow('contraseña');
    await expect(s.restablecer(admin, 8, 'Clave segura 1', '')).rejects.toThrow('Demasiados');
  });

  it('el guardia solo deja pasar Seguridad mientras falte activar la 2FA', () => {
    expect(rutaPermitidaSinDosPasos('/auth/seguridad')).toBe(true);
    expect(rutaPermitidaSinDosPasos('/auth/seguridad/2fa/iniciar?x=1')).toBe(true);
    expect(rutaPermitidaSinDosPasos('/auth/seguridadx')).toBe(false);
    expect(rutaPermitidaSinDosPasos('/ventas')).toBe(false);
    const guardia = new JwtAuthGuard();
    const contexto = (url: string) => ({ switchToHttp: () => ({ getRequest: () => ({ originalUrl: url }) }) }) as any;
    const pendiente = { id: 8, dosPasosPendiente: true };
    expect(() => guardia.handleRequest(null, pendiente, null, contexto('/ventas'))).toThrow('exige');
    expect(guardia.handleRequest(null, pendiente, null, contexto('/auth/seguridad/2fa/activar'))).toBe(pendiente);
    expect(guardia.handleRequest(null, { id: 9 }, null, contexto('/ventas'))).toEqual({ id: 9 });
  });
});
