import * as bcrypt from 'bcrypt';
import { UsuariosService, validarClave } from './usuarios.service';

describe('Seguridad de usuarios', () => {
  function preparar(usuarios: any[]) {
    const db: any = {
      usuario: {
        findFirst: jest.fn(async ({ where }: any) => usuarios.find((u) => u.id === where.id && u.empresaId === where.empresaId) || null),
        findUnique: jest.fn(async ({ where }: any) => usuarios.find((u) => (where.id !== undefined ? u.id === where.id : u.email === where.email)) || null),
        findMany: jest.fn(async () => usuarios),
        count: jest.fn(async ({ where }: any) => usuarios.filter((u) => u.empresaId === where.empresaId && u.rol === where.rol && u.activo && u.id !== where.NOT.id).length),
        create: jest.fn(async ({ data }: any) => ({ id: 99, ...data })),
        update: jest.fn(async ({ where, data }: any) => ({ ...usuarios.find((u) => u.id === where.id), ...data })),
      },
      seguridadRegistro: { updateMany: jest.fn() },
      sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
    };
    return { db, s: new UsuariosService(db) };
  }
  const gerente = { id: 2, rol: 'GERENTE' }, admin = { id: 1, rol: 'ADMIN_EMPRESA' };

  it('exige contraseñas de al menos 10 caracteres con letras y números', () => {
    expect(() => validarClave('1')).toThrow('10 caracteres');
    expect(() => validarClave('soloLetrasLargas')).toThrow('letras y números');
    expect(validarClave('Clave segura 1')).toBe('Clave segura 1');
  });

  it('el gerente no puede crear ni administrar administradores o gerentes', async () => {
    const { s } = preparar([{ id: 1, empresaId: 4, rol: 'ADMIN_EMPRESA', activo: true }, { id: 3, empresaId: 4, rol: 'GERENTE', activo: true }, { id: 5, empresaId: 4, rol: 'CAJERO', activo: true }]);
    const nuevo = { nombre: 'X', email: 'x@x.co', password: 'Clave segura 1' };
    await expect(s.crear({ ...nuevo, rol: 'ADMIN_EMPRESA' }, 4, gerente)).rejects.toThrow('gerente');
    await expect(s.crear({ ...nuevo, rol: 'SUPERADMIN' }, 4, admin)).rejects.toThrow('Rol');
    await expect(s.crear({ ...nuevo, rol: 'CAJERO', password: 'corta' }, 4, gerente)).rejects.toThrow('10 caracteres');
    expect(await s.crear({ ...nuevo, rol: 'CAJERO', email: ' X@X.CO ' }, 4, gerente)).toMatchObject({ email: 'x@x.co', rol: 'CAJERO' });
    await expect(s.toggleActivo(1, 4, gerente)).rejects.toThrow('gerente');
    await expect(s.actualizarPermisos(3, { pos: true }, 4, gerente)).rejects.toThrow('gerente');
    await expect(s.actualizarPermisos(2, { pos: true }, 4, gerente)).rejects.toThrow();
    await expect(s.actualizarPermisos(5, [], 4, gerente)).rejects.toThrow('Permisos');
  });

  it('nadie se desactiva a sí mismo ni deja la empresa sin administradores', async () => {
    const { s } = preparar([{ id: 1, empresaId: 4, rol: 'ADMIN_EMPRESA', activo: true }, { id: 7, empresaId: 4, rol: 'ADMIN_EMPRESA', activo: true }]);
    await expect(s.toggleActivo(1, 4, admin)).rejects.toThrow('propio');
    const solo = preparar([{ id: 1, empresaId: 4, rol: 'ADMIN_EMPRESA', activo: true }, { id: 7, empresaId: 4, rol: 'ADMIN_EMPRESA', activo: true }]);
    solo.db.usuario.count.mockResolvedValue(0);
    await expect(solo.s.toggleActivo(7, 4, admin)).rejects.toThrow('al menos un administrador');
  });

  it('el personal operativo no ve correos ni permisos', async () => {
    const { db, s } = preparar([]);
    await s.listar(4, 'CAJERO');
    expect(db.usuario.findMany.mock.calls[0][0].select).toEqual({ id: true, nombre: true, rol: true, activo: true });
  });

  it('cambiar la contraseña o el correo propio exige la contraseña actual y cierra las sesiones', async () => {
    const hash = await bcrypt.hash('Actual segura 1', 4);
    const { db, s } = preparar([{ id: 5, empresaId: 4, rol: 'CAJERO', email: 'yo@x.co', password: hash }, { id: 6, email: 'otro@x.co' }]);
    await expect(s.actualizarPerfilPropio(5, { password: 'Nueva segura 2' })).rejects.toThrow('contraseña actual');
    await expect(s.actualizarPerfilPropio(5, { email: 'nuevo@x.co', passwordActual: 'mala' })).rejects.toThrow('contraseña actual');
    await expect(s.actualizarPerfilPropio(5, { email: 'otro@x.co', passwordActual: 'Actual segura 1' })).rejects.toThrow('Ya existe');
    expect(await s.actualizarPerfilPropio(5, { nombre: ' Ana ' })).toMatchObject({ nombre: 'Ana' });
    await s.actualizarPerfilPropio(5, { password: 'Nueva segura 2', passwordActual: 'Actual segura 1' });
    expect(db.seguridadRegistro.updateMany).toHaveBeenCalledWith({ where: { usuarioId: 5, tipo: 'SESION', estado: 'ACTIVA' }, data: { estado: 'REVOCADA' } });
  });
});
