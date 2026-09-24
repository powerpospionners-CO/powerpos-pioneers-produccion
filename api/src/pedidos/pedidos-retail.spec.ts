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
    pedido: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 8, numero: data.numero, estado: data.estado, total: data.total, sucursalId: 2 })) },
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
