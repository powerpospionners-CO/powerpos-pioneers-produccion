import { BadRequestException } from '@nestjs/common';
import { PedidosDistribuidorService } from './pedidos-distribuidor.service';

function escenario(stockActualizado = 1) {
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    auditoria: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    distribuidor: { findFirst: jest.fn().mockResolvedValue({ id: 7, sucursalId: 2, codigo: 'DIST-001', porcentajeComision: 10, activo: true }) },
    producto: {
      findFirst: jest.fn().mockResolvedValue({ id: 5, stockActual: stockActualizado ? 100 : 0, nombre: 'Arroz', precio: 10000, costo: 6000, disponible: true, activo: true, controlaStock: true }),
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
  const service = new PedidosDistribuidorService(prisma, {} as any);
  return { tx, service };
}

describe('Pedidos de distribuidor', () => {
  const datos = { modalidad:'PAGO_ANTES', clave:'pedido-prueba-1', items: [{ productoId: 5, cantidad: 3 }] };

  it('calcula el total y comisión sin descontar inventario ni inventar dinero recibido', async () => {
    const { tx, service } = escenario();
    const resultado = await service.crearPedido(datos, 7, 2, 1, 9);
    expect(resultado.total).toBe(30000);
    // 10% de 30.000 = 3.000
    expect(resultado.comisionMonto).toBe(3000);
    expect(tx.producto.updateMany).not.toHaveBeenCalled();
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
    expect(tx.auditoria.create).toHaveBeenCalledTimes(2);
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

describe('Corrección de pedidos pendientes', () => {
  function pendiente() {
    const caso = escenario();
    const pedido: any = { id: 1, numero: 'DIST-2-1', empresaId: 2, sucursalId: 2, distribuidorId: 7, estado: 'ENTREGADO', liquidacionId: null, total: 30000, comisionPorcentaje: 10, clienteReferencia: 'Cliente', detalles: [{ productoId: 5, presentacionId: null, cantidad: 3, precioUnitario: 10000, factorUnidades: 1 }] };
    const control: any = { modalidad: 'PAGO_ANTES', pedidoCajaId: null, revision: 0 };
    caso.tx.pedidoDistribuidor.findFirst.mockResolvedValue(pedido);
    caso.tx.auditoria.findMany.mockImplementation(async ({ where }) => where.entidad === 'CONTROL_PEDIDO_DISTRIBUIDOR' ? [{ entidadId: 1, detalle: control }] : []);
    caso.tx.auditoria.create.mockImplementation(async ({ data }) => { if (data.entidad === 'CONTROL_PEDIDO_DISTRIBUIDOR') Object.assign(control, data.detalle); });
    caso.tx.pedidoDistribuidor.update.mockImplementation(async ({ data }) => { pedido.total = data.total; return { ...pedido, ...data }; });
    return { ...caso, control, pedido };
  }
  const datos = { modalidad: 'PAGO_ANTES', clave: 'editar-prueba-1', revision: 0, items: [{ productoId: 5, cantidad: 2 }] };
  it('corrige cantidades conservando precios y reintenta sin crear otro pedido', async () => {
    const { service, tx } = pendiente();
    tx.producto.findFirst.mockResolvedValue({ id: 5, nombre: 'Arroz', precio: 12000, disponible: true, controlaStock: true, stockActual: 100 });
    const resultado = await service.editarPedido(1, datos, 7, 2, 2, 9);
    expect(resultado).toMatchObject({ total: 20000, comisionMonto: 2000, revision: 1 });
    await service.editarPedido(1, datos, 7, 2, 2, 9);
    expect(tx.pedidoDistribuidor.update).toHaveBeenCalledTimes(1);
    expect(tx.pedidoDistribuidor.create).not.toHaveBeenCalled();
    expect(tx.producto.update).not.toHaveBeenCalled();
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });
  it('impide sobrescribir una revisión nueva o una entrega confirmada', async () => {
    const { service, tx, control } = pendiente();
    control.revision = 1;
    await expect(service.editarPedido(1, datos, 7, 2, 2, 9)).rejects.toThrow('cambió');
    control.pedidoCajaId = 10;
    await expect(service.editarPedido(1, datos, 7, 2, 2, 9)).rejects.toThrow('pendientes de retiro');
    expect(tx.pedidoDistribuidor.update).not.toHaveBeenCalled();
  });
  it('la búsqueda de edición restringe empresa, sede y dueño', async () => {
    const { service, tx } = pendiente();
    tx.pedidoDistribuidor.findFirst.mockResolvedValue(null);
    await expect(service.editarPedido(1, datos, 7, 2, 2, 9)).rejects.toThrow('no encontrado');
    expect(tx.pedidoDistribuidor.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1, empresaId: 2, distribuidorId: 7, sucursalId: 2 } }));
  });
  it('cancelar antes del retiro deja auditoría sin reponer mercancía que aún no salió', async () => {
    const { service, tx } = pendiente();
    await service.anular(1, 2, 9, 7);
    expect(tx.producto.update).not.toHaveBeenCalled();
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
    expect(tx.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accion: 'ANULAR', entidadId: 1 }) }));
  });
});
