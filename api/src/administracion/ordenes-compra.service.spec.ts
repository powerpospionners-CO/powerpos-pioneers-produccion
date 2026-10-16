import { OrdenesCompraService } from './ordenes-compra.service';
const actor = { id: 3, empresaId: 7, sucursalId: 2 };
function escenario() {
  const orden = { id: 5, referencia: 'OC-1', descripcion: 'Mercancía', sucursalId: 2, proveedorId: 4, estado: 'APROBADA', detalles: [{ id: 8, productoId: 9, cantidad: 10, recibida: 0, costoUnitario: 20 }] };
  const tx: any = {
    $executeRaw: jest.fn(), ordenCompra: { findFirst: jest.fn().mockResolvedValue(orden), update: jest.fn() },
    recepcionOrdenCompra: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 11 }) },
    detalleOrdenCompra: { update: jest.fn() }, auditoria: { create: jest.fn() },
    producto: { findMany: jest.fn().mockResolvedValue([{ id: 9, ventaGranel: false }]) },
  };
  const compras = { registrar: jest.fn().mockResolvedValue({ id: 12 }) };
  const db: any = { $transaction: jest.fn(fn => fn(tx)) };
  return { service: new OrdenesCompraService(db, compras as any), tx, compras, orden };
}
describe('Purchase order receipt', () => {
  const datos = { clave: 'receipt-1', condicionPago: 'CONTADO' as const, items: [{ detalleId: 8, cantidad: 4 }] };
  it('receives only the delivered amount using the same database transaction', async () => {
    const { service, tx, compras } = escenario();
    await service.recibir(5, datos, actor);
    expect(tx.ordenCompra.findFirst.mock.calls[0][0].where).toEqual({ id: 5, empresaId: 7 });
    expect(compras.registrar).toHaveBeenCalledWith(expect.objectContaining({ items: [{ productoId: 9, cantidad: 4, costoUnitario: 20 }] }), 3, 7, 2, tx);
    expect(tx.detalleOrdenCompra.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { recibida: { increment: 4 } } });
    expect(tx.ordenCompra.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { estado: 'PARCIAL' } });
  });
  it('prevents overreceipt and receiving unapproved orders before writing any purchase', async () => {
    const { service, compras, orden } = escenario();
    await expect(service.recibir(5, { ...datos, items: [{ detalleId: 8, cantidad: 11 }] }, actor)).rejects.toThrow('excede');
    orden.estado = 'PENDIENTE';
    await expect(service.recibir(5, datos, actor)).rejects.toThrow('aprobada');
    expect(compras.registrar).not.toHaveBeenCalled();
  });
  it('replays a confirmed receipt without changing inventory or money twice', async () => {
    const { service, tx, compras } = escenario();
    const solicitud = JSON.stringify({ ordenId: 5, condicionPago: 'CONTADO', documento: null, vencimiento: null, items: datos.items });
    tx.recepcionOrdenCompra.findUnique.mockResolvedValue({ id: 11, solicitud });
    expect(await service.recibir(5, datos, actor)).toEqual({ id: 11, solicitud });
    expect(compras.registrar).not.toHaveBeenCalled();
    await expect(service.recibir(5, {...datos, items: [{ detalleId: 8, cantidad: 1 }]}, actor)).rejects.toThrow('otra recepción');
  });
  it('converts base grams to the purchase unit without multiplying the received stock', async () => {
    const { service, tx, compras } = escenario();
    tx.producto.findMany.mockResolvedValue([{ id: 9, ventaGranel: true, unidadGranel: 'kg' }]);
    await service.recibir(5, datos, actor);
    expect(compras.registrar.mock.calls[0][0].items).toEqual([{ productoId: 9, cantidad: 0.004, costoUnitario: 20000 }]);
  });
  it('closes the order only when all quantities have been received', async () => {
    const { service, tx } = escenario();
    await service.recibir(5, {...datos, items: [{ detalleId: 8, cantidad: 10 }]}, actor);
    expect(tx.ordenCompra.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { estado: 'RECIBIDA' } });
  });
});
