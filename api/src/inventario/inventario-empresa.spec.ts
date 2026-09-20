import { NotFoundException } from '@nestjs/common';
import { InventarioService } from './inventario.service';

describe('Inventario por empresa', () => {
  it('filtra los ingredientes de la empresa autenticada', async () => {
    const prisma: any = { ingrediente: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new InventarioService(prisma, {} as any);
    await service.listarIngredientes(24);
    expect(prisma.ingrediente.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { empresaId: 24, activo: true } }));
  });

  it('rechaza ajustar el inventario de otra empresa', async () => {
    const prisma: any = {
      ingrediente: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      movimientoInventario: { create: jest.fn() },
    };
    const service = new InventarioService(prisma, {} as any);
    await expect(service.ajustarStock(7, { tipo: 'ENTRADA', cantidad: 5 }, 10, 24)).rejects.toThrow(NotFoundException);
    expect(prisma.ingrediente.findFirst).toHaveBeenCalledWith({ where: { id: 7, empresaId: 24 } });
    expect(prisma.ingrediente.update).not.toHaveBeenCalled();
    expect(prisma.movimientoInventario.create).not.toHaveBeenCalled();
  });
});
