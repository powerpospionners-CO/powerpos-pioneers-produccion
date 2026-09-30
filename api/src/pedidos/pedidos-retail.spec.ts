import { BadRequestException } from '@nestjs/common';
import { PedidosService } from './pedidos.service';

function escenario(tipoNegocio: 'RESTAURANTE' | 'SUPERMERCADO', stockActualizado = 1) {
  const db: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    empresa: { findFirst: jest.fn().mockResolvedValue({ id: 1, activo: true, tipoNegocio, fidelizacionConfig: {} }) },
    caja: { findFirst: jest.fn().mockResolvedValue({ id: 4, usuarioId: 3, usuario: { id: 3, nombre: 'Cajero' } }) },
    usuario: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Cajero', rol: 'CAJERO' }) },
    sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2, empresaId: 1 }) },
    producto: {
      findFirst: jest.fn().mockResolvedValue({ id: 5, nombre: 'Arroz', precio: 10000, disponible: true, activo: true, controlaStock: true, ingredientes: [], adicionales: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: stockActualizado }),
    },
    pedido: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 8, numero: data.numero, estado: data.estado, total: data.total, sucursalId: 2 })),
    },
    movimientoFinanciero: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const service = new PedidosService({} as any, { emitir: jest.fn() } as any, { enviarAlerta: jest.fn() } as any);
  return { db, service };
}

describe('Pedidos comerciales', () => {
  const venta = { sucursalId: 2, metodoPago: 'EFECTIVO', items: [{ productoId: 5, cantidad: 2 }] };

  it('entrega la venta comercial y descuenta dos unidades de stock', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    const resultado = await service.crearEnTransaccion(venta, 3, 1, db);
    expect(resultado.estado).toBe('ENTREGADO');
    expect(db.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 5, empresaId: 1, stockActual: { gte: 2 } },
      data: { stockActual: { decrement: 2 } },
    });
    expect(db.movimientoFinanciero.create).toHaveBeenCalledTimes(1);
  });

  it('rechaza stock insuficiente antes de registrar el ingreso', async () => {
    const { db, service } = escenario('SUPERMERCADO', 0);
    await expect(service.crearEnTransaccion(venta, 3, 1, db)).rejects.toThrow(BadRequestException);
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('mantiene el estado de cocina para restaurantes', async () => {
    const { db, service } = escenario('RESTAURANTE');
    const resultado = await service.crearEnTransaccion(venta, 3, 1, db);
    expect(resultado.estado).toBe('PENDIENTE');
  });
});

describe('Idempotencia (reintento de venta guardada offline)', () => {
  it('devuelve la venta ya existente sin crear otra ni volver a descontar stock', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    const yaExistente = { id: 8, numero: 'PED-2-existente', claveIdempotencia: 'abc-123' };
    db.pedido.findUnique.mockResolvedValue(yaExistente);
    const ventaConClave = { sucursalId: 2, metodoPago: 'EFECTIVO', items: [{ productoId: 5, cantidad: 2 }], claveIdempotencia: 'abc-123' };
    const resultado = await service.crearEnTransaccion(ventaConClave, 3, 1, db);
    expect(resultado).toBe(yaExistente);
    expect(db.pedido.create).not.toHaveBeenCalled();
    expect(db.producto.updateMany).not.toHaveBeenCalled();
  });

  it('crea la venta normalmente la primera vez, guardando la clave', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    const ventaConClave = { sucursalId: 2, metodoPago: 'EFECTIVO', items: [{ productoId: 5, cantidad: 2 }], claveIdempotencia: 'nueva-456' };
    await service.crearEnTransaccion(ventaConClave, 3, 1, db);
    expect(db.pedido.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ claveIdempotencia: 'nueva-456' }) }));
  });
});

describe('Combos/canastas', () => {
  it('vender un combo descuenta el stock de cada componente, no el del combo', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    db.producto.findFirst.mockResolvedValue({
      id: 9, nombre: 'Canasta básica', precio: 25000, disponible: true, activo: true,
      controlaStock: false, esCombo: true, ingredientes: [], adicionales: [],
    });
    db.comboComponente = {
      findMany: jest.fn().mockResolvedValue([
        { productoId: 10, cantidad: 2, producto: { id: 10, nombre: 'Tomate', controlaStock: true } },
        { productoId: 11, cantidad: 1, producto: { id: 11, nombre: 'Cebolla', controlaStock: true } },
      ]),
    };
    const ventaCombo = { sucursalId: 2, metodoPago: 'EFECTIVO', items: [{ productoId: 9, cantidad: 3 }] };
    await service.crearEnTransaccion(ventaCombo, 3, 1, db);
    expect(db.comboComponente.findMany).toHaveBeenCalledWith({ where: { comboId: 9 }, include: { producto: true } });
    // 3 canastas × 2 tomates cada una = 6; 3 canastas × 1 cebolla cada una = 3
    expect(db.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 10, empresaId: 1, stockActual: { gte: 6 } },
      data: { stockActual: { decrement: 6 } },
    });
    expect(db.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 11, empresaId: 1, stockActual: { gte: 3 } },
      data: { stockActual: { decrement: 3 } },
    });
    expect(db.producto.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 9 }) }));
  });

  it('rechaza la venta si un componente del combo no tiene existencias', async () => {
    const { db, service } = escenario('SUPERMERCADO', 0);
    db.producto.findFirst.mockResolvedValue({
      id: 9, nombre: 'Canasta básica', precio: 25000, disponible: true, activo: true,
      controlaStock: false, esCombo: true, ingredientes: [], adicionales: [],
    });
    db.comboComponente = {
      findMany: jest.fn().mockResolvedValue([
        { productoId: 10, cantidad: 2, producto: { id: 10, nombre: 'Tomate', controlaStock: true } },
      ]),
    };
    const ventaCombo = { sucursalId: 2, metodoPago: 'EFECTIVO', items: [{ productoId: 9, cantidad: 1 }] };
    await expect(service.crearEnTransaccion(ventaCombo, 3, 1, db)).rejects.toThrow('Tomate');
  });
});
