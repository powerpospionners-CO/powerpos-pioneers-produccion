import { BadRequestException } from '@nestjs/common';
import { DistribuidoresService } from './distribuidores.service';

function escenario(pedidosPendientes: any[]) {
  const tx: any = {
    distribuidor: { findFirst: jest.fn().mockResolvedValue({ id: 7, empresaId: 1, sucursalId: 2, codigo: 'DIST-001', nombre: 'Juan Pérez' }) },
    pedidoDistribuidor: {
      findMany: jest.fn().mockResolvedValue(pedidosPendientes),
      updateMany: jest.fn().mockResolvedValue({ count: pedidosPendientes.length }),
    },
    movimientoFinanciero: { create: jest.fn().mockResolvedValue({ id: 99 }) },
    liquidacionDistribuidor: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 55, ...data })) },
  };
  const prisma: any = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    distribuidor: { findFirst: jest.fn().mockResolvedValue({ id: 7, empresaId: 1, sucursalId: 2, codigo: 'DIST-001', nombre: 'Juan Pérez', usuario: null, sucursal: { nombre: 'Principal' } }) },
  };
  const service = new DistribuidoresService(prisma);
  return { tx, prisma, service };
}

describe('Liquidación de distribuidores', () => {
  const pedidos = [
    { id: 1, total: 100000, comisionMonto: 10000 },
    { id: 2, total: 50000, comisionMonto: 5000 },
  ];

  it('agrupa los pedidos pendientes del periodo en una sola liquidación y un solo egreso', async () => {
    const { tx, service } = escenario(pedidos);
    const liquidacion = await service.liquidar(7, 1, 9, '2026-10-01', '2026-10-10');
    expect(tx.movimientoFinanciero.create).toHaveBeenCalledTimes(1);
    expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: 'EGRESO', categoria: 'COMISION_DISTRIBUIDOR', monto: 15000 }),
    }));
    expect(liquidacion.totalComision).toBe(15000);
    expect(liquidacion.cantidadPedidos).toBe(2);
    expect(tx.pedidoDistribuidor.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: { liquidacionId: 55 },
    });
  });

  it('rechaza liquidar si no hay pedidos pendientes en el periodo', async () => {
    const { service } = escenario([]);
    await expect(service.liquidar(7, 1, 9, '2026-10-01', '2026-10-10')).rejects.toThrow(BadRequestException);
  });
});
