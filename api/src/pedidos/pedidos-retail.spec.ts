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
    productoCodigoBarras: { findFirst: jest.fn().mockResolvedValue(null) },
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

  it('ofrece extras globales del Trailer aunque el producto tenga otros asociados y descuenta gramos', async () => {
    const { db, service } = escenario('RESTAURANTE');
    const queso = { id: 9, nombre: 'Queso', precio: 2000, ingredienteId: 40, cantidad: 30, ingrediente: { id: 40, activo: true, costoUnitario: 20 }, activo: true, disponible: true };
    db.producto.findFirst.mockResolvedValue({ id: 5, nombre: 'Hamburguesa', categoria: { nombre: 'Plancha' }, precio: 10000, disponible: true, ingredientes: [], aceptaAdicionales: false, adicionales: [{ adicional: { id: 8, activo: true, disponible: true } }] });
    db.adicional = { findMany: jest.fn().mockResolvedValue([queso]) }; db.ingrediente = { update: jest.fn() };
    await service.crearEnTransaccion({ ...venta, items: [{ productoId: 5, cantidad: 2, adicionales: [{ adicionalId: 9, cantidad: 2 }] }] }, 3, 1, db);
    const data = db.pedido.create.mock.calls[0][0].data;
    expect(Number(data.total)).toBe(28000);
    expect(data.consumoInventario).toContainEqual({ tipo: 'INGREDIENTE', id: 40, cantidad: 120 });
    expect(db.adicional.findMany.mock.calls[0][0].where).toMatchObject({ empresaId: 1, empaqueParaLlevar: false });
  });

  it.each([
    { nombre: 'Coca Cola personal', categoria: { nombre: 'Otros' } },
    { nombre: 'Personal 250 ml', categoria: { nombre: 'Personales', categoriaPadre: { nombre: 'Bebidas' } } },
  ])('rechaza extras en bebidas del Trailer también desde la API: $nombre', async producto => {
    const { db, service } = escenario('RESTAURANTE');
    db.producto.findFirst.mockResolvedValue({ ...producto, id: 5, precio: 1000, disponible: true, ingredientes: [], adicionales: [], aceptaAdicionales: true });
    await expect(service.crearEnTransaccion({ ...venta, items: [{ productoId: 5, cantidad: 1, adicionales: [{ adicionalId: 9 }] }] }, 3, 1, db)).rejects.toThrow('no está disponible');
    expect(db.pedido.create).not.toHaveBeenCalled();
  });

  it('no vende adicionales pendientes de gramaje ni ingredientes desactivados', async () => {
    const { db, service } = escenario('RESTAURANTE');
    db.producto.findFirst.mockResolvedValue({ id: 5, nombre: 'Perro', precio: 10000, disponible: true, ingredientes: [], adicionales: [] });
    db.adicional = { findMany: jest.fn().mockResolvedValue([{ id: 9, ingredienteId: 40, cantidad: null, disponible: true }]) };
    await expect(service.crearEnTransaccion({ ...venta, items: [{ productoId: 5, cantidad: 1, adicionales: [{ adicionalId: 9 }] }] }, 3, 1, db)).rejects.toThrow('no está disponible');
  });

  it.each(['AQUI', 'PARA_LLEVAR'])('guarda y descuenta el empaque real de dos hamburguesas %s', async tipoConsumo => {
    const { db, service } = escenario('RESTAURANTE');
    const bolsa = { id: 21, nombre: 'Bolsita metalizada', costoUnitario: 100 };
    const porta = { id: 22, nombre: 'Porta hamburguesa', costoUnitario: 300 };
    const adicional = { id: 7, nombre: 'Empaque', precio: 0, ingredienteId: 22, cantidad: 1, activo: true, disponible: true, empaqueParaLlevar: true, ingrediente: porta };
    db.producto.findFirst.mockResolvedValue({ id: 5, nombre: 'Hamburguesa', precio: 10000, disponible: true, activo: true, ingredientes: [{ ingredienteId: 21, ingrediente: bolsa, cantidad: 1 }], adicionales: [{ adicional }] });
    db.ingrediente = { update: jest.fn() };
    await service.crearEnTransaccion({ ...venta, items: [{ productoId: 5, cantidad: 2, tipoConsumo }] }, 3, 1, db);
    const data = db.pedido.create.mock.calls[0][0].data;
    expect(data.consumoInventario).toEqual(tipoConsumo === 'AQUI'
      ? [{ tipo: 'INGREDIENTE', id: 21, cantidad: 2 }]
      : [{ tipo: 'INGREDIENTE', id: 21, cantidad: 2 }, { tipo: 'INGREDIENTE', id: 22, cantidad: 2 }]);
    expect(Number(data.costoVentaHistorico)).toBe(tipoConsumo === 'AQUI' ? 200 : 800);
    expect(db.ingrediente.update).toHaveBeenCalledTimes(tipoConsumo === 'AQUI' ? 1 : 2);
    expect(data.detalles.create[0].observacion).toContain(tipoConsumo === 'AQUI' ? 'Comer aquí' : 'Para llevar');
  });

  it('entrega crédito, descuenta existencias y registra cartera sin inventar efectivo', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    db.cliente = { findFirst: jest.fn().mockResolvedValue({ id: 9, nombre: 'Cliente' }), update: jest.fn() };
    db.cuentaAdministrativa = { create: jest.fn() };
    await service.crearEnTransaccion({ ...venta, clienteId: 9, condicionPago: 'CREDITO', pagos: [], cambio: 0, claveIdempotencia: 'credito-1', vencimientoCredito: '2099-01-01' }, 3, 1, db);
    expect(db.producto.updateMany).toHaveBeenCalled();
    expect(db.cuentaAdministrativa.create).toHaveBeenCalledWith({ data: expect.objectContaining({ empresaId: 1, sucursalId: 2, pedidoId: 8, tipo: 'COBRAR', monto: 20000, saldo: 20000 }) });
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
    expect(db.cliente.update).not.toHaveBeenCalled();
    expect(db.pedido.create.mock.calls[0][0].data).toMatchObject({ metodoPago: 'CREDITO', puntosGanados: 0, pagos: { create: [] } });
  });

  it('rechaza crédito sin cliente antes de entregar mercancía', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    await expect(service.crearEnTransaccion({ ...venta, condicionPago: 'CREDITO', claveIdempotencia: 'credito-2', vencimientoCredito: '2099-01-01' }, 3, 1, db)).rejects.toThrow('requiere cliente');
    expect(db.producto.updateMany).not.toHaveBeenCalled();
  });

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

  it('guarda como Unidad la venta base de productos con presentaciones', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    db.producto.findFirst.mockResolvedValue({
      id: 5, nombre: 'Dulce', precio: 1000, disponible: true, activo: true,
      controlaStock: true, ingredientes: [], adicionales: [], presentaciones: [{ id: 9 }],
    });
    await service.crearEnTransaccion(venta, 3, 1, db);

    const detalles = db.pedido.create.mock.calls[0][0].data.detalles.create;
    expect(detalles[0]).toEqual(expect.objectContaining({
      presentacionId: null,
      presentacionNombre: 'Unidad',
      factorUnidades: 1,
    }));
  });

  it('rechaza stock insuficiente antes de registrar el ingreso', async () => {
    const { db, service } = escenario('SUPERMERCADO', 0);
    await expect(service.crearEnTransaccion(venta, 3, 1, db)).rejects.toThrow(BadRequestException);
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('registra el sabor escaneado en la venta y comparte el inventario del producto', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    db.productoCodigoBarras.findFirst.mockResolvedValue({ sabor: 'Mango' });
    await service.crearEnTransaccion({
      sucursalId: 2,
      metodoPago: 'EFECTIVO',
      items: [{ productoId: 5, codigoVarianteId: 12, cantidad: 1 }],
    }, 3, 1, db);

    const detalles = db.pedido.create.mock.calls[0][0].data.detalles.create;
    expect(detalles[0]).toEqual(expect.objectContaining({ productoId: 5, varianteSabor: 'Mango', precioUnitario: 10000 }));
    expect(db.producto.updateMany).toHaveBeenCalledWith({
      where: { id: 5, empresaId: 1, stockActual: { gte: 1 } },
      data: { stockActual: { decrement: 1 } },
    });
  });

  it('rechaza una variante que no pertenece al producto y empresa de la venta', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    await expect(service.crearEnTransaccion({
      sucursalId: 2,
      metodoPago: 'EFECTIVO',
      items: [{ productoId: 5, codigoVarianteId: 12, cantidad: 1 }],
    }, 3, 1, db)).rejects.toThrow('El sabor seleccionado no está disponible');

    expect(db.productoCodigoBarras.findFirst).toHaveBeenCalledWith({
      where: { id: 12, empresaId: 1, productoId: 5 },
      select: { sabor: true },
    });
    expect(db.pedido.create).not.toHaveBeenCalled();
  });

  it('mantiene el estado de cocina para restaurantes', async () => {
    const { db, service } = escenario('RESTAURANTE');
    const resultado = await service.crearEnTransaccion(venta, 3, 1, db);
    expect(resultado.estado).toBe('PENDIENTE');
  });
});

describe('Idempotencia (reintento de venta guardada offline)', () => {
  it('no devuelve una venta de otra empresa aunque conozcan su clave', async () => {
    const { db, service } = escenario('SUPERMERCADO');
    db.pedido.findUnique.mockResolvedValue({ id: 77, sucursalId: 22 });
    db.sucursal.findFirst.mockResolvedValue(null);
    await expect(service.crearEnTransaccion({ claveIdempotencia: 'ajena' }, 3, 1, db)).rejects.toThrow('no está disponible');
    expect(db.pedido.create).not.toHaveBeenCalled();
  });
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
    expect(db.comboComponente.findMany).toHaveBeenCalledWith({ where: { comboId: 9, producto: { empresaId: 1 } }, include: { producto: true } });
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
