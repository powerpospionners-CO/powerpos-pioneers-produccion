import { FinancieroService } from './financiero.service';
function escenario(movimientos: any[], ventas: any[], operaciones: any[]) {
  const db: any = { movimientoFinanciero: { findMany: jest.fn().mockResolvedValue(movimientos) }, pedido: { findMany: jest.fn().mockResolvedValue(ventas) }, operacionVentaCaja: { findMany: jest.fn().mockResolvedValue(operaciones) } };
  return new FinancieroService(db);
}
describe('Financiero con cartera y devoluciones',()=>{
  const venta={total:100,metodoPago:'CREDITO',pagos:[]};
  it('reconoce el margen del crédito aunque no haya cobros, sin inventar efectivo',async()=>{
    const d=await escenario([{tipo:'EGRESO',categoria:'COSTO_VENTA',monto:40}],[venta],[]).resumenFinanciero(1);
    expect(d).toMatchObject({totalIngresos:0,ingresosDevengados:100,utilidad:60,ventasPorMetodoPago:[]});
  });
  it('resta devolución y costo repuesto sin contar dos veces los abonos',async()=>{
    const d=await escenario([{tipo:'EGRESO',categoria:'COSTO_VENTA',monto:40},{tipo:'INGRESO',categoria:'VENTA',monto:30},{tipo:'INGRESO',categoria:'COSTO_VENTA',monto:20}],[venta],[{tipo:'COBRO_CREDITO',metodoPago:'EFECTIVO',monto:30,detalle:{}},{tipo:'DEVOLUCION',metodoPago:'EFECTIVO',monto:0,detalle:{deudaReducida:50,valorTotal:50}}]).resumenFinanciero(1);
    expect(d).toMatchObject({totalIngresos:30,totalEgresos:20,ingresosDevengados:50,utilidad:30,totalVentasRango:50,ventasPorMetodoPago:[{metodo:'EFECTIVO',total:30}]});
  });
  it('un cobro de un crédito antiguo aumenta efectivo, sin generar otra venta ni utilidad',async()=>{
    const d=await escenario([{tipo:'INGRESO',categoria:'VENTA',monto:100}],[],[{tipo:'COBRO_CREDITO',metodoPago:'EFECTIVO',monto:100,detalle:{}}]).resumenFinanciero(1);
    expect(d).toMatchObject({totalIngresos:100,ingresosDevengados:0,utilidad:0,totalVentasRango:0});
  });
});

describe('Ventas de hoy en horario colombiano', () => {
  afterEach(() => jest.useRealTimers());
  it('excluye la noche anterior y el inicio del día siguiente aunque el servidor use UTC', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T18:00:00Z'));
    const ventas = [
      { total: 17500, creadoEn: new Date('2026-11-09T00:24:28Z'), metodoPago: 'EFECTIVO', pagos: [] },
      { total: 71200, creadoEn: new Date('2026-11-09T16:50:00Z'), metodoPago: 'EFECTIVO', pagos: [] },
      { total: 2000, creadoEn: new Date('2026-11-10T05:00:00Z'), metodoPago: 'EFECTIVO', pagos: [] },
    ];
    const pedido = { findMany: jest.fn(async ({ where }) => where.creadoEn
      ? ventas.filter(v => v.creadoEn >= where.creadoEn.gte && v.creadoEn < where.creadoEn.lt)
      : ventas) };
    const db: any = { pedido, movimientoFinanciero: { findMany: jest.fn().mockResolvedValue([]) }, operacionVentaCaja: { findMany: jest.fn().mockResolvedValue([]) } };
    const resultado = await new FinancieroService(db).resumenFinanciero(2);
    expect(resultado).toMatchObject({ totalVentasHoy: 71200, cantidadPedidosHoy: 1 });
    expect(pedido.findMany).toHaveBeenNthCalledWith(1, { where: { sucursal: { empresaId: 2 }, estado: { not: 'ANULADO' }, creadoEn: { gte: new Date('2026-11-09T05:00:00Z'), lt: new Date('2026-11-10T05:00:00Z') } } });
  });
  it('antes de las cinco UTC conserva la fecha anterior de Colombia', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T03:00:00Z'));
    const pedido = { findMany: jest.fn().mockResolvedValue([]) };
    const db: any = { pedido, movimientoFinanciero: { findMany: jest.fn().mockResolvedValue([]) }, operacionVentaCaja: { findMany: jest.fn().mockResolvedValue([]) } };
    await new FinancieroService(db).resumenFinanciero(2);
    expect(pedido.findMany).toHaveBeenNthCalledWith(1, { where: { sucursal: { empresaId: 2 }, estado: { not: 'ANULADO' }, creadoEn: { gte: new Date('2026-11-08T05:00:00Z'), lt: new Date('2026-11-09T05:00:00Z') } } });
  });
});
