import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductosService } from './productos.service';

describe('Ajuste de existencias por producto', () => {
  const notificaciones = { enviarAlerta: jest.fn() };

  it('rechaza ajustar el stock de un producto de otra empresa', async () => {
    const prisma: any = { producto: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new ProductosService(prisma, notificaciones as any);
    await expect(service.ajustarStock(9, { tipo: 'ENTRADA', cantidad: 5 }, 1, 24)).rejects.toThrow(NotFoundException);
    expect(prisma.producto.findFirst).toHaveBeenCalledWith({ where: { id: 9, empresaId: 24 } });
  });

  it('rechaza ajustar un producto que no controla existencias', async () => {
    const prisma: any = { producto: { findFirst: jest.fn().mockResolvedValue({ id: 9, empresaId: 24, controlaStock: false }) } };
    const service = new ProductosService(prisma, notificaciones as any);
    await expect(service.ajustarStock(9, { tipo: 'ENTRADA', cantidad: 5 }, 1, 24)).rejects.toThrow(BadRequestException);
  });

  it('rechaza una salida mayor al stock disponible', async () => {
    const prisma: any = { producto: { findFirst: jest.fn().mockResolvedValue({ id: 9, empresaId: 24, controlaStock: true, stockActual: 3, stockMinimo: 1, nombre: 'Gaseosa' }) } };
    const service = new ProductosService(prisma, notificaciones as any);
    await expect(service.ajustarStock(9, { tipo: 'SALIDA', cantidad: 5 }, 1, 24)).rejects.toThrow(BadRequestException);
  });

  it('registra una entrada y crea el movimiento con productoId', async () => {
    const producto = { id: 9, empresaId: 24, controlaStock: true, stockActual: 3, stockMinimo: 1, nombre: 'Gaseosa' };
    const prisma: any = {
      producto: { findFirst: jest.fn().mockResolvedValue(producto), update: jest.fn().mockResolvedValue({ ...producto, stockActual: 8 }) },
      movimientoInventario: { create: jest.fn() },
    };
    const service = new ProductosService(prisma, notificaciones as any);
    const resultado = await service.ajustarStock(9, { tipo: 'ENTRADA', cantidad: 5 }, 1, 24);
    expect(prisma.producto.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { stockActual: 8 } });
    expect(prisma.movimientoInventario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ productoId: 9, tipo: 'ENTRADA', stockAnterior: 3, stockNuevo: 8 }),
    }));
    expect(resultado.stockNuevo).toBe(8);
  });
});
