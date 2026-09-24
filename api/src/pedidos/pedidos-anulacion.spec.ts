import { PedidosService } from './pedidos.service';

function escenario() {
  const pedido: any = {
    id: 1,
    numero: 'PED-1',
    sucursalId: 2,
    cajaId: 3,
    usuarioId: 4,
    estado: 'PENDIENTE',
    puntosGanados: 0,
    puntosCanjeados: 0,
  };
  const db: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    empresa: {
      findUnique: jest.fn().mockResolvedValue({ tipoNegocio: 'RESTAURANTE' }),
    },
    pedido: {
      findFirst: jest.fn().mockImplementation(async () => ({ ...pedido })),
      update: jest
        .fn()
        .mockImplementation(async ({ data }) => Object.assign(pedido, data)),
    },
    pedidoWeb: { findUnique: jest.fn().mockResolvedValue(null) },
    caja: { findUnique: jest.fn().mockResolvedValue({ estado: 'ABIERTA' }) },
    movimientoFinanciero: {
      findFirst: jest.fn().mockResolvedValue({ monto: 20000 }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  db.$transaction = jest.fn(async (fn) => fn(db));
  const eventos = { emitir: jest.fn() };
  return {
    db,
    pedido,
    eventos,
    service: new PedidosService(db, eventos as any, {} as any),
  };
}

describe('Anulación conciliada de pedidos', () => {
  it('revierte el ingreso una sola vez y conserva el movimiento original', async () => {
    const { service, db } = escenario();
    await service.actualizarEstado(1, 'ANULADO', 7);
    expect(db.movimientoFinanciero.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'EGRESO',
        categoria: 'VENTA',
        monto: 20000,
        pedidoId: 1,
        empresaId: 7,
      }),
    });
    await expect(service.actualizarEstado(1, 'ANULADO', 7)).rejects.toThrow(
      'no puede reabrirse',
    );
    expect(db.movimientoFinanciero.create).toHaveBeenCalledTimes(1);
  });
  it('rechaza una anulación con caja cerrada', async () => {
    const { service, db } = escenario();
    db.caja.findUnique.mockResolvedValue({ estado: 'CERRADA' });
    await expect(service.actualizarEstado(1, 'ANULADO', 7)).rejects.toThrow(
      'caja está cerrada',
    );
    expect(db.pedido.update).not.toHaveBeenCalled();
  });
  it('no cambia el pedido ni emite eventos si falla la reversión', async () => {
    const { service, db, eventos } = escenario();
    db.movimientoFinanciero.create.mockRejectedValue(new Error('fallo DB'));
    await expect(service.actualizarEstado(1, 'ANULADO', 7)).rejects.toThrow(
      'fallo DB',
    );
    expect(db.pedido.update).not.toHaveBeenCalled();
    expect(eventos.emitir).not.toHaveBeenCalled();
  });
});
