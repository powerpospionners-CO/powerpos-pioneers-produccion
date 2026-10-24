import { CajaService } from './caja.service';
import { CajaController } from './caja.controller';
import { RolesGuard } from '../auth/roles.guard';
import { Reflector } from '@nestjs/core';

describe('Archivo de cierres concretos en el historial', () => {
  it('rechaza al cajero y al gerente aunque puedan usar otras operaciones de caja', () => {
    const guard = new RolesGuard(new Reflector());
    for (const rol of ['CAJERO', 'GERENTE', 'ADMIN_EMPRESA']) {
      const contexto: any = { getHandler: () => CajaController.prototype.archivoHistorial, getClass: () => CajaController, switchToHttp: () => ({ getRequest: () => ({ user: { rol } }) }) };
      if (rol === 'ADMIN_EMPRESA') expect(guard.canActivate(contexto)).toBe(true);
      else expect(() => guard.canActivate(contexto)).toThrow();
    }
  });
  it('archiva y restaura solo un cierre cerrado de la propia empresa, dejando auditoría', async () => {
    const db: any = { caja: { findFirst: jest.fn().mockResolvedValue({ id: 8 }) }, auditoria: { create: jest.fn().mockResolvedValue({}) } };
    const service = new CajaService(db, {} as any, {} as any);
    expect(await service.cambiarArchivoHistorial(8, 2, 9, true)).toEqual({ id: 8, archivada: true });
    expect(db.caja.findFirst).toHaveBeenCalledWith({ where: { id: 8, sucursal: { empresaId: 2 }, estado: 'CERRADA' } });
    expect(db.auditoria.create.mock.calls[0][0].data).toMatchObject({ empresaId: 2, usuarioId: 9, entidadId: 8, accion: 'ARCHIVAR' });
    await service.cambiarArchivoHistorial(8, 2, 9, false);
    expect(db.auditoria.create.mock.calls[1][0].data.accion).toBe('RESTAURAR');
    db.caja.findFirst.mockResolvedValue(null);
    await expect(service.cambiarArchivoHistorial(8, 3, 9, true)).rejects.toThrow('no encontrado');
    expect(db.auditoria.create).toHaveBeenCalledTimes(2);
    await expect(service.cambiarArchivoHistorial(NaN, 2, 9, true)).rejects.toThrow('no válida');
  });

  it('permite consultar solo los archivados sin devolver los cierres normales', async () => {
    const db: any = { auditoria: { findMany: jest.fn().mockResolvedValue([{ entidadId: 8, accion: 'ARCHIVAR' }]) }, caja: { findMany: jest.fn().mockResolvedValue([]) } };
    await new CajaService(db, {} as any, {} as any).listarCajasCerradas(2, undefined, true);
    expect(db.caja.findMany.mock.calls[0][0].where).toEqual({ sucursal: { empresaId: 2 }, estado: 'CERRADA', id: { in: [8] } });
  });
  it('excluye solo los cierres archivados de la empresa y conserva el filtro de sucursal', async () => {
    const db: any = {
      auditoria: { findMany: jest.fn().mockResolvedValue([{ entidadId: 1, accion: 'ARCHIVAR' }, { entidadId: 2, accion: 'ARCHIVAR' }, { entidadId: 3, accion: 'ARCHIVAR' }]) },
      caja: { findMany: jest.fn().mockResolvedValue([{ id: 4 }]) },
    };
    const service = new CajaService(db, {} as any, {} as any);
    expect(await service.listarCajasCerradas(1, 1)).toEqual([{ id: 4 }]);
    expect(db.auditoria.findMany.mock.calls[0][0].where.empresaId).toBe(1);
    expect(db.caja.findMany.mock.calls[0][0].where).toEqual({ sucursal: { empresaId: 1, id: 1 }, estado: 'CERRADA', id: { notIn: [1, 2, 3] } });
  });

  it('permite restaurar un cierre y no excluye cierres de otra empresa', async () => {
    const db: any = {
      auditoria: { findMany: jest.fn().mockResolvedValue([{ entidadId: 7, accion: 'ARCHIVAR' }, { entidadId: 7, accion: 'RESTAURAR' }]) },
      caja: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CajaService(db, {} as any, {} as any);
    await service.listarCajasCerradas(2);
    expect(db.auditoria.findMany.mock.calls[0][0].where.empresaId).toBe(2);
    expect(db.caja.findMany.mock.calls[0][0].where).toEqual({ sucursal: { empresaId: 2 }, estado: 'CERRADA' });
  });
});
