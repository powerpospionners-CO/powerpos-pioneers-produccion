import { UnauthorizedException } from '@nestjs/common';
import { BloqueoCuentaService, MAX_FALLOS_CUENTA } from './bloqueo-cuenta.service';
import { AuthService } from './auth.service';

describe('Bloqueo de cuenta por intentos fallidos', () => {
  it('bloquea el correo tras 10 fallos sin importar mayúsculas y se limpia al entrar', async () => {
    const b = new BloqueoCuentaService();
    for (let i = 0; i < MAX_FALLOS_CUENTA - 1; i++) await b.registrarFallo('Admin@Empresa.co');
    await expect(b.verificar('admin@empresa.co')).resolves.toBeUndefined();
    await b.registrarFallo(' admin@empresa.co ');
    await expect(b.verificar('ADMIN@empresa.co')).rejects.toThrow('bloqueada');
    await expect(b.verificar('otro@empresa.co')).resolves.toBeUndefined();
    await b.limpiar('admin@empresa.co');
    await expect(b.verificar('admin@empresa.co')).resolves.toBeUndefined();
  });

  it('el inicio de sesión cuenta los fallos, rechaza durante el bloqueo y limpia al acertar', async () => {
    const bloqueo = new BloqueoCuentaService();
    const auth = new AuthService({} as any, {} as any, undefined, undefined, bloqueo);
    const interno = jest.spyOn(auth as any, 'iniciarSesion');
    interno.mockRejectedValue(new UnauthorizedException('Credenciales inválidas'));
    for (let i = 0; i < MAX_FALLOS_CUENTA; i++) await expect(auth.login('a@b.co', 'mala')).rejects.toThrow('Credenciales');
    interno.mockResolvedValue({ access_token: 'x' } as any);
    await expect(auth.login('a@b.co', 'Buena clave 1')).rejects.toThrow('bloqueada');
    await bloqueo.limpiar('a@b.co');
    await expect(auth.login('a@b.co', 'Buena clave 1')).resolves.toEqual({ access_token: 'x' });
    // Un error que no es de credenciales (p. ej. sede caída) no cuenta como fallo.
    interno.mockRejectedValue(new Error('sin conexión'));
    for (let i = 0; i < MAX_FALLOS_CUENTA + 2; i++) await expect(auth.login('c@d.co', 'x')).rejects.toThrow('sin conexión');
    await expect(bloqueo.verificar('c@d.co')).resolves.toBeUndefined();
  });

  it('con eventos compartidos guarda el contador en la base de control', async () => {
    process.env.EVENTOS_COMPARTIDOS = 'true';
    try {
      const filas = new Map<string, any>();
      const prisma: any = { control: { eventoSistema: {
        findUnique: jest.fn(async ({ where }: any) => filas.get(where.id) || null),
        upsert: jest.fn(async ({ where, create, update }: any) => filas.set(where.id, { ...(filas.get(where.id) || create), ...update })),
        deleteMany: jest.fn(async ({ where }: any) => filas.delete(where.id)),
      } } };
      const b = new BloqueoCuentaService(prisma);
      for (let i = 0; i < MAX_FALLOS_CUENTA; i++) await b.registrarFallo('x@y.co');
      expect([...filas.values()][0]).toMatchObject({ canal: 'AUTH_CUENTA', datos: { cantidad: MAX_FALLOS_CUENTA } });
      await expect(b.verificar('x@y.co')).rejects.toThrow('bloqueada');
    } finally {
      delete process.env.EVENTOS_COMPARTIDOS;
    }
  });
});
