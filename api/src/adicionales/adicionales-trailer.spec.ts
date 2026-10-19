import { AdicionalesService } from './adicionales.service';
import { AdicionalesController } from './adicionales.controller';
import { InventarioService } from '../inventario/inventario.service';

describe('Catálogo automático del Trailer', () => {
  it('prepara solo ingredientes faltantes sin cambiar precios, gramos ni revivir eliminados', async () => {
    const db: any = {
      $executeRaw: jest.fn(),
      ingrediente: { findMany: jest.fn().mockResolvedValue([{ id: 10, nombre: 'Queso' }, { id: 11, nombre: 'Carne' }, { id: 12, nombre: 'Salchicha' }]) },
      adicional: { findMany: jest.fn().mockResolvedValue([{ ingredienteId: 10 }, { ingredienteId: 11 }]), createMany: jest.fn() },
    };
    db.$transaction = jest.fn(fn => fn(db));
    const service = new AdicionalesService(db);
    expect(await service.sincronizarIngredientes(1)).toEqual({ creados: 1 });
    expect(db.adicional.createMany).toHaveBeenCalledWith({ data: [{ empresaId: 1, ingredienteId: 12, nombre: 'Salchicha', precio: 0, cantidad: null, disponible: false }] });
    db.adicional.findMany.mockResolvedValue([{ ingredienteId: 10 }, { ingredienteId: 11 }, { ingredienteId: 12 }]);
    db.adicional.createMany.mockClear();
    expect(await service.sincronizarIngredientes(1)).toEqual({ creados: 0 });
    expect(db.adicional.createMany).not.toHaveBeenCalled();
    await expect(service.sincronizarIngredientes(2)).rejects.toThrow();
  });

  it('crea el adicional pendiente junto al ingrediente y conserva las existencias ingresadas', async () => {
    const db: any = { ingrediente: { create: jest.fn().mockResolvedValue({ id: 10 }) }, movimientoInventario: { create: jest.fn() } };
    const service = new InventarioService(db, {} as any);
    await service.crearIngrediente({ nombre: 'Queso', unidad: 'gramos', stock: 1000 }, 3, 1);
    expect(db.ingrediente.create.mock.calls[0][0].data).toMatchObject({ stock: 1000, adicionales: { create: { empresaId: 1, nombre: 'Queso', precio: 0, cantidad: null, disponible: false } } });
    await service.crearIngrediente({ nombre: 'Sal', unidad: 'gramos', stock: 1000 }, 3, 2);
    expect(db.ingrediente.create.mock.calls[1][0].data).not.toHaveProperty('adicionales');
  });

  it('solo el administrador configura el catálogo del Trailer', () => {
    const service: any = { actualizar: jest.fn() }; const controller = new AdicionalesController(service);
    expect(() => controller.actualizar('8', { precio: 500 }, { user: { empresaId: 1, rol: 'CAJERO' } })).toThrow('Solo el administrador');
    expect(service.actualizar).not.toHaveBeenCalled();
    controller.actualizar('8', { precio: 500 }, { user: { empresaId: 1, rol: 'ADMIN_EMPRESA' } });
    expect(service.actualizar).toHaveBeenCalledWith(8, { precio: 500 }, 1);
  });

  it('exige gramaje antes de habilitar y no modifica el inventario al configurar', async () => {
    const db: any = { adicional: { findFirst: jest.fn().mockResolvedValue({ id: 8, empresaId: 1, ingredienteId: 10, cantidad: null, precio: 0, empaqueParaLlevar: false }), update: jest.fn() } };
    const service = new AdicionalesService(db);
    await expect(service.actualizar(8, { precio: 2000 }, 1)).rejects.toThrow('gramaje');
    expect(db.adicional.update).not.toHaveBeenCalled();
    await service.actualizar(8, { precio: 2000, cantidad: 30 }, 1);
    expect(db.adicional.update.mock.calls[0][0].data).toMatchObject({ precio: 2000, cantidad: 30, disponible: true });
  });
});
