import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { RolesGuard } from '../auth/roles.guard';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';

describe('Edición de usuarios de empresa', () => {
  const preparar = () => {
    const db: any = {
      usuario: {
        findFirst: jest.fn().mockResolvedValue({ id: 7, rol: 'CAJERO' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data, password: 'hash-privado' })),
      },
      sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
    };
    return { db, servicio: new UsuariosService(db) };
  };

  it('guarda nombre, correo y sucursal sin cambiar la contraseña si se omite', async () => {
    const { db, servicio } = preparar();
    const resultado = await servicio.actualizar(7, { nombre: ' Paula ', email: ' PAULA@EJEMPLO.COM ', sucursalId: 2 }, 2, 9);
    expect(db.usuario.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7, empresaId: 2 } }));
    expect(db.sucursal.findFirst).toHaveBeenCalledWith({ where: { id: 2, empresaId: 2 } });
    expect(db.usuario.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { nombre: 'Paula', email: 'paula@ejemplo.com', sucursalId: 2 } });
    expect(resultado).not.toHaveProperty('password');
  });

  it('rechaza usuarios y sucursales de otra empresa sin escribir cambios', async () => {
    const { db, servicio } = preparar();
    db.usuario.findFirst.mockResolvedValueOnce(null);
    await expect(servicio.actualizar(7, { nombre: 'Otro' }, 3, 9)).rejects.toThrow('Usuario no encontrado');
    db.sucursal.findFirst.mockResolvedValueOnce(null);
    await expect(servicio.actualizar(7, { sucursalId: 4 }, 2, 9)).rejects.toThrow('no pertenece');
    expect(db.usuario.update).not.toHaveBeenCalled();
  });

  it('rechaza correos duplicados y datos inválidos', async () => {
    const { db, servicio } = preparar();
    db.usuario.findUnique.mockResolvedValue({ id: 8 });
    await expect(servicio.actualizar(7, { email: 'otro@ejemplo.com' }, 2, 9)).rejects.toThrow('Ya existe');
    for (const datos of [{ email: 'invalido' }, { nombre: ' ' }, { password: 'corta' }, { password: 'é'.repeat(40) }, { rol: 'SUPERADMIN' }, { sucursalId: '2' }]) {
      await expect(servicio.actualizar(7, datos, 2, 9)).rejects.toThrow();
    }
    expect(db.usuario.update).not.toHaveBeenCalled();
  });

  it('no permite que el administrador cambie su propio rol', async () => {
    const { db, servicio } = preparar();
    db.usuario.findFirst.mockResolvedValue({ id: 7, rol: 'ADMIN_EMPRESA' });
    await expect(servicio.actualizar(7, { rol: 'CAJERO' }, 2, 7)).rejects.toThrow('propio rol');
    expect(db.usuario.update).not.toHaveBeenCalled();
  });

  it('guarda la contraseña nueva como hash sin devolverla', async () => {
    const { db, servicio } = preparar();
    const resultado = await servicio.actualizar(7, { password: 'clave-prueba-valida' }, 2, 9);
    const hash = db.usuario.update.mock.calls[0][0].data.password;
    expect(await bcrypt.compare('clave-prueba-valida', hash)).toBe(true);
    expect(resultado).not.toHaveProperty('password');
  });

  it('solo permite editar al administrador', () => {
    const guard = new RolesGuard(new Reflector());
    for (const rol of ['CAJERO', 'GERENTE', 'ADMIN_EMPRESA']) {
      const contexto: any = { getHandler: () => UsuariosController.prototype.actualizar, getClass: () => UsuariosController, switchToHttp: () => ({ getRequest: () => ({ user: { rol } }) }) };
      if (rol === 'ADMIN_EMPRESA') expect(guard.canActivate(contexto)).toBe(true);
      else expect(() => guard.canActivate(contexto)).toThrow();
    }
  });
});
