import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductosService } from './productos.service';

describe('Códigos de barras por sabor', () => {
  const notificaciones = { enviarAlerta: jest.fn() };
  const producto = { id: 7, empresaId: 2 };

  function crearServicio() {
    const prisma: any = {
      producto: { findFirst: jest.fn().mockResolvedValue(producto), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      productoCodigoBarras: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 11, ...data })),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productoPresentacion: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      auditoria: { create: jest.fn() },
      $executeRaw: jest.fn(),
    };
    prisma.$transaction = jest.fn((fn) => fn(prisma));
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

  it('libera el código de un sabor cuyo producto fue eliminado y conserva su registro histórico', async () => {
    const { prisma, service } = crearServicio();
    prisma.producto.findFirst.mockResolvedValueOnce(producto).mockResolvedValueOnce(null);
    prisma.productoCodigoBarras.findMany.mockResolvedValue([{ id: 4, productoId: 3, sabor: 'Vegano' }]);
    await service.agregarCodigoBarras(7, { codigoBarras: '8801043022705', sabor: 'Vegano' }, 2, 8);
    expect(prisma.productoCodigoBarras.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { codigoBarras: expect.stringMatching(/^ARCHIVADO-4-/) } });
    expect(prisma.auditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuarioId: 8, empresaId: 2, accion: 'REUTILIZAR_CODIGO_BARRAS', detalle: expect.objectContaining({ codigoBarras: '8801043022705', saboresRetirados: [{ id: 4, productoId: 3, sabor: 'Vegano' }] }) }) });
    expect(prisma.productoCodigoBarras.create).toHaveBeenCalledWith({ data: { empresaId: 2, productoId: 7, codigoBarras: '8801043022705', sabor: 'Vegano' } });
  });

  it('libera también códigos base o presentaciones retiradas, sin tocar ventas ni existencias', async () => {
    const { prisma, service } = crearServicio();
    prisma.producto.findFirst.mockResolvedValueOnce(producto).mockResolvedValueOnce(null);
    prisma.producto.findMany.mockResolvedValue([{ id: 2, nombre: 'Ramen eliminado' }]);
    prisma.productoPresentacion.findMany.mockResolvedValue([{ id: 8, productoId: 3, nombre: 'Caja' }]);
    await service.agregarCodigoBarras(7, { codigoBarras: '12345', sabor: 'Vegano' }, 2);
    expect(prisma.producto.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { codigoBarras: null } });
    expect(prisma.productoPresentacion.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { codigoBarras: null } });
    expect(prisma.productoCodigoBarras.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { empresaId: 2, codigoBarras: '12345', producto: { activo: false } } }));
  });

  it('no libera ningún código si pertenece a un producto activo', async () => {
    const { prisma, service } = crearServicio();
    prisma.producto.findFirst.mockResolvedValueOnce(producto).mockResolvedValueOnce({ id: 99 });
    await expect(service.agregarCodigoBarras(7, { codigoBarras: '12345', sabor: 'Vegano' }, 2)).rejects.toThrow(ConflictException);
    expect(prisma.producto.update).not.toHaveBeenCalled();
    expect(prisma.productoCodigoBarras.update).not.toHaveBeenCalled();
    expect(prisma.productoCodigoBarras.create).not.toHaveBeenCalled();
  });
});
