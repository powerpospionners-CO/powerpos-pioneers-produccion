import { CajaService } from './caja.service';

describe('Archivo de cierres concretos en el historial', () => {
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
