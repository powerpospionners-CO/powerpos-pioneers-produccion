import { BadRequestException } from '@nestjs/common';
import { PedidosDistribuidorService } from './pedidos-distribuidor.service';

function escenario(stockActualizado = 1) {
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    distribuidor: { findFirst: jest.fn().mockResolvedValue({ id: 7, codigo: 'DIST-001', porcentajeComision: 10, activo: true }) },
    producto: {
      findFirst: jest.fn().mockResolvedValue({ id: 5, nombre: 'Arroz', precio: 10000, costo: 6000, disponible: true, activo: true, controlaStock: true }),
      updateMany: jest.fn().mockResolvedValue({ count: stockActualizado }),
      update: jest.fn().mockResolvedValue({}),
    },
    productoPresentacion: { findFirst: jest.fn() },
    pedidoDistribuidor: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 1, numero: data.numero, total: data.total, comisionMonto: data.comisionMonto, comisionPorcentaje: data.comisionPorcentaje })),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    movimientoFinanciero: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const prisma: any = { $transaction: jest.fn((cb: any) => cb(tx)) };
  const service = new PedidosDistribuidorService(prisma);
  return { tx, service };
}

describe('Pedidos de distribuidor', () => {
  const datos = { items: [{ productoId: 5, cantidad: 3 }] };

  it('calcula el total, descuenta stock y registra la comisión del distribuidor', async () => {
    const { tx, service } = escenario();
    const resultado = await service.crearPedido(datos, 7, 2, 1, 9);
    expect(resultado.total).toBe(30000);
    // 10% de 30.000 = 3.000
    expect(resultado.comisionMonto).toBe(3000);
    expect(tx.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 5, empresaId: 1, stockActual: { gte: 3 } },
      data: { stockActual: { decrement: 3 } },
    });
    expect(tx.movimientoFinanciero.create).toHaveBeenCalledTimes(2); // INGRESO venta + EGRESO costo
  });

  it('rechaza el pedido si no hay existencias suficientes', async () => {
    const { tx, service } = escenario(0);
    await expect(service.crearPedido(datos, 7, 2, 1, 9)).rejects.toThrow(BadRequestException);
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('rechaza cantidades inválidas antes de tocar la base de datos', async () => {
    const { tx, service } = escenario();
    await expect(service.crearPedido({ items: [{ productoId: 5, cantidad: 0 }] }, 7, 2, 1, 9)).rejects.toThrow(BadRequestException);
    expect(tx.distribuidor.findFirst).not.toHaveBeenCalled();
  });
});

describe('Anular pedido de distribuidor', () => {
  it('no permite anular un pedido que ya fue liquidado', async () => {
    const { tx, service } = escenario();
    tx.pedidoDistribuidor.findFirst.mockResolvedValue({ id: 1, estado: 'ENTREGADO', liquidacionId: 55, detalles: [], distribuidor: { codigo: 'DIST-001' } });
    await expect(service.anular(1, 1, 9)).rejects.toThrow('liquidado');
  });

  it('repone el stock y crea el egreso de reversión al anular', async () => {
    const { tx, service } = escenario();
    tx.pedidoDistribuidor.findFirst.mockResolvedValue({
      id: 1, numero: 'DIST-2-20261010-0001', sucursalId: 2, estado: 'ENTREGADO', liquidacionId: null, total: 30000,
      detalles: [{ productoId: 5, cantidad: 3, factorUnidades: 1, producto: { controlaStock: true } }],
      distribuidor: { codigo: 'DIST-001' },
    });
    await service.anular(1, 1, 9);
    expect(tx.producto.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { stockActual: { increment: 3 } } });
    expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: 'EGRESO', categoria: 'VENTA', monto: 30000 }) }));
    expect(tx.pedidoDistribuidor.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'ANULADO' } });
  });
});
