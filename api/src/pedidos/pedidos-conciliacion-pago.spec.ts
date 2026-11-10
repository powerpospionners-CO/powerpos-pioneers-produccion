import { PedidosService } from './pedidos.service';

describe('Conciliación administrativa del pago de una venta cerrada', () => {
  function escenario(metodo = 'EFECTIVO', montoEfectivo = 100) {
    const venta = { id: 1, numero: 'ANTIGUA-1', sucursalId: 2, cajaId: 3, total: 100, estado: 'ENTREGADO', metodoPago: metodo, pagos: metodo === 'MIXTO' ? [{ metodoPago: 'EFECTIVO', monto: montoEfectivo }, { metodoPago: 'NEQUI', monto: 100 - montoEfectivo }] : [{ metodoPago: metodo, monto: 100 }] };
    const caja = { id: 3, estado: 'CERRADA', montoInicial: 50, montoFinal: 150, diferencia: 0, cerradaEn: new Date('2026-11-01'), retiroEfectivo: null };
    const db: any = {
      $executeRaw: jest.fn(),
      pedido: { findFirst: jest.fn(() => Promise.resolve({ ...venta, pagos: venta.pagos.map(p => ({ ...p })) })), findMany: jest.fn(() => Promise.resolve([venta])), update: jest.fn(({ data }) => { Object.assign(venta, { metodoPago: data.metodoPago, pagos: data.pagos.create }); return Promise.resolve(venta); }) },
      caja: { findFirst: jest.fn().mockResolvedValue(caja), update: jest.fn() },
      pagoPedido: { deleteMany: jest.fn() },
      operacionVentaCaja: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      retiroEfectivoCaja: { update: jest.fn() }, auditoria: { create: jest.fn() }, eventoCaja: { create: jest.fn() },
    };
    db.$transaction = jest.fn(fn => fn(db));
    const eventos: any = { emitir: jest.fn() };
    return { db, venta, caja, eventos, service: new PedidosService(db, eventos, {} as any) };
  }
  const correccion = { metodoPago: 'TRANSFERENCIA', motivo: 'Se registró efectivo por error' };
  it('resta del efectivo esperado todo lo reclasificado a transferencia, conserva conteo y cierre y deja el antes y después', async () => {
    const { db, service, eventos } = escenario();
    await service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA');
    expect(db.caja.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { diferencia: 100 } });
    const detalle = db.auditoria.create.mock.calls[0][0].data.detalle;
    expect(detalle).toMatchObject({ motivo: correccion.motivo, anterior: { metodoPago: 'EFECTIVO', pagos: [{ metodoPago: 'EFECTIVO', monto: 100 }] }, nuevo: { metodoPago: 'TRANSFERENCIA', pagos: [{ metodoPago: 'TRANSFERENCIA', monto: 100 }] }, conciliacion: { montoContado: 150, montoEsperado: 50, diferencia: 100 } });
    expect(db.eventoCaja.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tipo: 'CORRECCION', usuarioId: 4, cajaId: 3 }) }));
    expect(eventos.emitir).toHaveBeenCalledTimes(1);
  });
  it('conserva el retiro real y actualiza su esperado para que el recaudo semanal cuadre con los pagos corregidos', async () => {
    const { db, service, caja } = escenario();
    db.caja.findFirst.mockResolvedValue({ ...caja, montoFinal: 50, retiroEfectivo: { montoEsperado: 100, montoRetirado: 100 } });
    await service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA');
    expect(db.retiroEfectivoCaja.update).toHaveBeenCalledWith({ where: { cajaId: 3 }, data: { montoEsperado: 0 } });
    expect(db.caja.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { diferencia: 100 } });
  });
  it('reclasifica solo la parte que cambia de un pago mixto y sumariza abonos y devoluciones de otras ventas', async () => {
    const { db, service } = escenario('MIXTO', 70);
    db.operacionVentaCaja.findMany.mockResolvedValue([{ tipo: 'COBRO_CREDITO', metodoPago: 'EFECTIVO', monto: 50 }, { tipo: 'DEVOLUCION', metodoPago: 'EFECTIVO', monto: 20 }]);
    await service.actualizarPago(1, { pagos: [{ metodoPago: 'EFECTIVO', monto: 30 }, { metodoPago: 'NEQUI', monto: 70 }], motivo: 'Corregir distribución del pago mixto' }, 4, 7, 'ADMIN_EMPRESA');
    expect(db.auditoria.create.mock.calls[0][0].data.detalle.conciliacion).toMatchObject({ efectivoEsperado: 60, montoEsperado: 110, diferencia: 40 });
  });
  it('incrementa el efectivo esperado cuando la venta pasa de transferencia a efectivo', async () => {
    const { db, service } = escenario('TRANSFERENCIA');
    await service.actualizarPago(1, { metodoPago: 'EFECTIVO', motivo: 'El cliente pagó realmente en efectivo' }, 4, 7, 'ADMIN_EMPRESA');
    expect(db.auditoria.create.mock.calls[0][0].data.detalle.conciliacion).toMatchObject({ montoEsperado: 150, diferencia: 0 });
  });
  it.each(['CAJERO', 'GERENTE', undefined])('rechaza la conciliación cerrada para el rol %s', async rol => {
    const { db, service } = escenario();
    await expect(service.actualizarPago(1, correccion, 4, 7, rol)).rejects.toThrow('Solo el administrador');
    expect(db.pagoPedido.deleteMany).not.toHaveBeenCalled();
  });
  it.each(['', 'abc', 'x'.repeat(251)])('exige un motivo válido antes de modificar el pago', async motivo => {
    const { db, service } = escenario();
    await expect(service.actualizarPago(1, { ...correccion, motivo }, 4, 7, 'ADMIN_EMPRESA')).rejects.toThrow('motivo');
    expect(db.pagoPedido.deleteMany).not.toHaveBeenCalled();
  });
  it('rechaza importes que no coinciden con el total y cajas ajenas', async () => {
    const { db, service } = escenario();
    await expect(service.actualizarPago(1, { ...correccion, pagos: [{ metodoPago: 'NEQUI', monto: 90 }] }, 4, 7, 'ADMIN_EMPRESA')).rejects.toThrow('no coincide');
    db.caja.findFirst.mockResolvedValue(null);
    await expect(service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA')).rejects.toThrow('empresa');
    expect(db.pagoPedido.deleteMany).not.toHaveBeenCalled();
  });
  it('un reintento no duplica movimientos ni vuelve a descontar efectivo esperado', async () => {
    const { db, service } = escenario();
    await service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA');
    await service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA');
    expect(db.caja.update.mock.calls.map(c => c[0].data.diferencia)).toEqual([100, 100]);
  });
  it('no publica éxito cuando no se puede guardar la auditoría', async () => {
    const { db, service, eventos } = escenario();
    db.auditoria.create.mockRejectedValue(new Error('fallo auditoría'));
    await expect(service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA')).rejects.toThrow('fallo auditoría');
    expect(eventos.emitir).not.toHaveBeenCalled();
  });
  it('mantiene las restricciones de crédito, ventas anuladas y devoluciones', async () => {
    const { db, service, venta } = escenario();
    db.pedido.findFirst.mockResolvedValue({ ...venta, metodoPago: 'CREDITO' });
    await expect(service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA')).rejects.toThrow('crédito');
    db.pedido.findFirst.mockResolvedValue({ ...venta, estado: 'ANULADO' });
    await expect(service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA')).rejects.toThrow('anulada');
    db.pedido.findFirst.mockResolvedValue(venta); db.operacionVentaCaja.count.mockResolvedValue(1);
    await expect(service.actualizarPago(1, correccion, 4, 7, 'ADMIN_EMPRESA')).rejects.toThrow('devoluciones');
    expect(db.pagoPedido.deleteMany).not.toHaveBeenCalled();
  });
});
