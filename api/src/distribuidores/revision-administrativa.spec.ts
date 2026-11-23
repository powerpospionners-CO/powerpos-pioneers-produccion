import { PedidosDistribuidorService } from './pedidos-distribuidor.service';
const actor = { id: 9, empresaId: 2, sucursalId: 3, rol: 'ADMIN_EMPRESA' };
function caso() {
  const pedido: any = {
    id: 1,
    empresaId: 2,
    sucursalId: 3,
    estado: 'ENTREGADO',
    numero: 'DIST-3-1',
    total: 280000,
    comisionMonto: 28000,
    liquidacionId: null,
    distribuidor: { nombre: 'Distribuidor', codigo: 'DIST' },
    detalles: [],
  };
  const venta: any = {
    id: 10,
    numero: 'PED-3-1',
    estado: 'ANULADO',
    total: 280000,
    devueltoTotal: false,
    metodoPago: 'EFECTIVO',
    pagos: [],
    cuentaCredito: null,
    operacionesCaja: [],
  };
  const control = { pedidoCajaId: 10, modalidad: 'PAGO_ANTES' };
  const tx: any = {
    $executeRaw: jest.fn(),
    pedidoDistribuidor: {
      findFirst: jest.fn().mockResolvedValue(pedido),
      update: jest
        .fn()
        .mockImplementation(async ({ data }) => Object.assign(pedido, data)),
    },
    auditoria: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ entidadId: 1, detalle: control }]),
      create: jest.fn(),
    },
    pedido: { findFirst: jest.fn().mockResolvedValue(venta) },
    producto: { update: jest.fn() },
    movimientoFinanciero: { create: jest.fn() },
  };
  return {
    pedido,
    venta,
    tx,
    service: new PedidosDistribuidorService(
      { $transaction: (cb: any) => cb(tx) } as any,
      {} as any,
    ),
  };
}
describe('Revisión administrativa de pedidos de distribuidores', () => {
  it('cierra el pedido de una venta anulada una sola vez sin duplicar inventario o reembolsos', async () => {
    const { service, tx } = caso();
    const r = await service.revisarAdministrador(1, actor);
    expect(r.puedeCancelar).toBe(true);
    const datos = {
      revision: r.revision,
      motivo: 'Venta previamente cancelada por el cliente',
      confirmado: true,
    };
    await service.cancelarRevisado(1, datos, actor);
    await service.cancelarRevisado(1, datos, actor);
    expect(tx.pedidoDistribuidor.update).toHaveBeenCalledTimes(1);
    expect(tx.producto.update).not.toHaveBeenCalled();
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
    expect(tx.auditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accion: 'ANULAR',
          usuarioId: 9,
          detalle: expect.objectContaining({
            motivo: datos.motivo,
            estadoVenta: 'ANULADO',
            inventarioModificado: false,
          }),
        }),
      }),
    );
  });
  it.each(['CAJERO', 'DISTRIBUIDOR', 'GERENTE'])(
    'no concede la revisión administrativa a %s',
    async (rol) => {
      const { service, tx } = caso();
      await expect(
        service.revisarAdministrador(1, { ...actor, rol }),
      ).rejects.toThrow('administrador');
      expect(tx.pedidoDistribuidor.findFirst).not.toHaveBeenCalled();
    },
  );
  it('exige empresa y sede del administrador', async () => {
    const { service, tx } = caso();
    tx.pedidoDistribuidor.findFirst.mockResolvedValue(null);
    await expect(service.revisarAdministrador(1, actor)).rejects.toThrow(
      'no encontrado',
    );
    expect(tx.pedidoDistribuidor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, empresaId: 2, sucursalId: 3 },
      }),
    );
  });
  it('impide cerrar una venta activa, una devolución parcial, una comisión liquidada o un saldo de crédito', async () => {
    for (const condicion of [
      'activa',
      'parcial',
      'liquidada',
      'credito',
      'faltante',
    ]) {
      const { service, pedido, venta, tx } = caso();
      if (condicion === 'activa') venta.estado = 'ENTREGADO';
      if (condicion === 'parcial') {
        venta.estado = 'ENTREGADO';
        venta.operacionesCaja = [{ id: 1 }];
      }
      if (condicion === 'liquidada') pedido.liquidacionId = 5;
      if (condicion === 'credito') venta.cuentaCredito = { saldo: 100 };
      if (condicion === 'faltante') tx.pedido.findFirst.mockResolvedValue(null);
      const r = await service.revisarAdministrador(1, actor);
      expect(r.puedeCancelar).toBe(false);
      await expect(
        service.cancelarRevisado(
          1,
          {
            revision: r.revision,
            motivo: 'Intento de cancelación para prueba',
            confirmado: true,
          },
          actor,
        ),
      ).rejects.toThrow();
      expect(tx.pedidoDistribuidor.update).not.toHaveBeenCalled();
    }
  });
  it('rechaza una revisión desactualizada y exige motivo y confirmación', async () => {
    const { service, venta, tx } = caso();
    const r = await service.revisarAdministrador(1, actor);
    venta.estado = 'ENTREGADO';
    await expect(
      service.cancelarRevisado(
        1,
        {
          revision: r.revision,
          motivo: 'Revisión que ya cambió de estado',
          confirmado: true,
        },
        actor,
      ),
    ).rejects.toThrow('cambió');
    await expect(
      service.cancelarRevisado(
        1,
        { revision: r.revision, motivo: 'x', confirmado: true },
        actor,
      ),
    ).rejects.toThrow('motivo');
    expect(tx.pedidoDistribuidor.update).not.toHaveBeenCalled();
  });
});
