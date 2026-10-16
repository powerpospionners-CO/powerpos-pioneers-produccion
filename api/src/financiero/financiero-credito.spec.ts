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
