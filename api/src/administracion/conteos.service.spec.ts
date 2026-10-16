import { ConteosService } from './conteos.service';
const actor = { empresaId: 7, id: 4, sucursalId: 2 };
function escenario() {
  const conteo: any = {
    id: 8,
    usuarioId: 3,
    estado: 'PENDIENTE',
    detalles: [
      {
        productoId: 5,
        productoNombre: 'Producto',
        stockEsperado: 10,
        stockContado: 8,
      },
    ],
  };
  const db: any = {
    $queryRaw: jest.fn(),
    producto: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 5, nombre: 'Producto', stockActual: 10 }]),
      findFirst: jest.fn().mockResolvedValue({ stockActual: 10 }),
      update: jest.fn(),
    },
    conteoInventario: {
      findFirst: jest.fn().mockImplementation(async () => ({ ...conteo })),
      create: jest.fn().mockResolvedValue(conteo),
      update: jest
        .fn()
        .mockImplementation(async ({ data }) => Object.assign(conteo, data)),
    },
    movimientoInventario: { create: jest.fn() },
    auditoria: { create: jest.fn() },
  };
  db.$transaction = jest.fn((fn) => fn(db));
  return { db, conteo, service: new ConteosService(db) };
}
describe('Conteos físicos con aprobación', () => {
  const datos = {
    descripcion: 'Conteo sede actual',
    items: [{ productoId: 5, stockEsperado: 10, stockContado: 8 }],
  };
  it('registrar un conteo no modifica existencias', async () => {
    const { service, db } = escenario();
    await service.crear(datos, actor);
    expect(db.producto.update).not.toHaveBeenCalled();
    expect(db.conteoInventario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ empresaId: 7, usuarioId: 4 }),
      include: { detalles: true },
    });
  });
  it('exige recuento si hubo ventas mientras se contaba', async () => {
    const { service, db } = escenario();
    db.producto.findMany.mockResolvedValue([
      { id: 5, nombre: 'Producto', stockActual: 9 },
    ]);
    await expect(service.crear(datos, actor)).rejects.toThrow(
      'Cambió el stock',
    );
    expect(db.conteoInventario.create).not.toHaveBeenCalled();
  });
  it('no permite agregar productos ajenos', async () => {
    const { service, db } = escenario();
    db.producto.findMany.mockResolvedValue([]);
    await expect(service.crear(datos, actor)).rejects.toThrow('esta empresa');
    expect(db.producto.findMany.mock.calls[0][0].where.empresaId).toBe(7);
  });
  it('aprueba, ajusta stock y registra el movimiento en la misma transacción', async () => {
    const { service, db } = escenario();
    await service.resolver(8, true, 'Recuento verificado', actor);
    expect(db.producto.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { stockActual: 8 },
    });
    expect(db.movimientoInventario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockAnterior: 10,
        stockNuevo: 8,
        cantidadMovida: 2,
        usuarioId: 4,
      }),
    });
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('no repite el ajuste al reintentar una aprobación', async () => {
    const { service, db } = escenario();
    await service.resolver(8, true, 'Verificado', actor);
    await service.resolver(8, true, 'Verificado', actor);
    expect(db.producto.update).toHaveBeenCalledTimes(1);
  });
  it('rechazar no cambia stock ni crea movimientos', async () => {
    const { service, db } = escenario();
    await service.resolver(8, false, 'Recontar', actor);
    expect(db.producto.update).not.toHaveBeenCalled();
    expect(db.movimientoInventario.create).not.toHaveBeenCalled();
  });
  it('no sobreescribe ventas posteriores a la solicitud', async () => {
    const { service, db } = escenario();
    db.producto.findFirst.mockResolvedValue({ stockActual: 9 });
    await expect(
      service.resolver(8, true, 'Verificado', actor),
    ).rejects.toThrow('cambió');
    expect(db.producto.update).not.toHaveBeenCalled();
    expect(db.conteoInventario.update).not.toHaveBeenCalled();
  });
  it('un fallo del historial impide confirmar la aprobación', async () => {
    const { service, db } = escenario();
    db.movimientoInventario.create.mockRejectedValue(
      new Error('Historial no disponible'),
    );
    await expect(
      service.resolver(8, true, 'Verificado', actor),
    ).rejects.toThrow('Historial no disponible');
    expect(db.conteoInventario.update).not.toHaveBeenCalled();
  });
  it('no resuelve conteos de otra empresa', async () => {
    const { service, db } = escenario();
    db.conteoInventario.findFirst.mockResolvedValue(null);
    await expect(
      service.resolver(8, true, 'Verificado', actor),
    ).rejects.toThrow('no encontrado');
    expect(db.producto.update).not.toHaveBeenCalled();
  });
});
