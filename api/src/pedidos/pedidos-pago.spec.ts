import { PedidosService } from './pedidos.service';

describe('Edición del pago y cierre de caja', () => {
  function escenario() {
    const pedido = {
      id: 1,
      numero: 'PED-1',
      sucursalId: 2,
      cajaId: 3,
      total: 100,
      estado: 'ENTREGADO',
      metodoPago: 'EFECTIVO',
    };
    const db: any = {
      operacionVentaCaja: { count: jest.fn().mockResolvedValue(0) },
    $executeRaw: jest.fn(),
      pedido: {
        findFirst: jest.fn().mockResolvedValue(pedido),
        update: jest.fn().mockResolvedValue(pedido),
      },
      caja: { findUnique: jest.fn().mockResolvedValue({ estado: 'ABIERTA' }) },
      pagoPedido: { deleteMany: jest.fn() },
      eventoCaja: { create: jest.fn() },
    };
    db.$transaction = jest.fn((fn) => fn(db));
    const eventos = { emitir: jest.fn() };
    return {
      db,
      eventos,
      service: new PedidosService(db, eventos as any, {} as any),
    };
  }
  it('vuelve a comprobar la caja después de tomar el bloqueo', async () => {
    const { db, service } = escenario();
    db.caja.findUnique.mockResolvedValue({ estado: 'CERRADA' });
    await expect(
      service.actualizarPago(1, { metodoPago: 'TARJETA' }, 4, 7),
    ).rejects.toThrow('cerrada');
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.caja.findUnique.mock.invocationCallOrder[0],
    );
    expect(db.pagoPedido.deleteMany).not.toHaveBeenCalled();
  });
  it('no confirma el cambio ni emite evento si falla la auditoría de caja', async () => {
    const { db, service, eventos } = escenario();
    db.eventoCaja.create.mockRejectedValue(new Error('fallo DB'));
    await expect(
      service.actualizarPago(1, { metodoPago: 'TARJETA' }, 4, 7),
    ).rejects.toThrow('fallo DB');
    expect(db.pedido.update).not.toHaveBeenCalled();
    expect(eventos.emitir).not.toHaveBeenCalled();
  });
});
