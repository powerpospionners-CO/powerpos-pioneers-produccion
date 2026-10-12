import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductosService } from './productos.service';

describe('Códigos de barras por sabor', () => {
  const notificaciones = { enviarAlerta: jest.fn() };
  const producto = { id: 7, empresaId: 2 };

  function crearServicio() {
    const prisma: any = {
      producto: { findFirst: jest.fn().mockResolvedValue(producto) },
      productoCodigoBarras: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 11, ...data })),
        update: jest.fn(),
      },
      productoPresentacion: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return { prisma, service: new ProductosService(prisma, notificaciones as any) };
  }

  it('guarda código y sabor asociados al producto y a su empresa', async () => {
    const { prisma, service } = crearServicio();
    prisma.producto.findFirst
      .mockResolvedValueOnce(producto)
      .mockResolvedValueOnce(null);

    await expect(service.agregarCodigoBarras(7, { codigoBarras: '750123', sabor: 'Mango' }, 2))
      .resolves.toEqual({ id: 11, empresaId: 2, productoId: 7, codigoBarras: '750123', sabor: 'Mango' });
    expect(prisma.productoCodigoBarras.create).toHaveBeenCalledWith({
      data: { empresaId: 2, productoId: 7, codigoBarras: '750123', sabor: 'Mango' },
    });
  });

  it('rechaza un código ya registrado como otro sabor', async () => {
    const { prisma, service } = crearServicio();
    prisma.producto.findFirst
      .mockResolvedValueOnce(producto)
      .mockResolvedValueOnce(null);
    prisma.productoCodigoBarras.findFirst.mockResolvedValue({ id: 4 });

    await expect(service.agregarCodigoBarras(7, { codigoBarras: '750123', sabor: 'Sandía' }, 2))
      .rejects.toThrow(ConflictException);
    expect(prisma.productoCodigoBarras.create).not.toHaveBeenCalled();
  });

  it('rechaza sabor o código vacío', async () => {
    const { service } = crearServicio();

    await expect(service.agregarCodigoBarras(7, { codigoBarras: '', sabor: 'Mango' }, 2))
      .rejects.toThrow(BadRequestException);
    await expect(service.agregarCodigoBarras(7, { codigoBarras: '750123', sabor: ' ' }, 2))
      .rejects.toThrow(BadRequestException);
  });
});
