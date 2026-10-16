import { Prisma } from '@prisma/client';
import { OperacionesVentaService } from './operaciones-venta.service';
import { desgloseCobros, importesNetos } from './operaciones-venta.reglas';
const decimal = (n: number) => new Prisma.Decimal(n);
const actor = { id: 3, empresaId: 1, sucursalId: 2, rol: 'CAJERO' };
function escenario() {
  const pedido: any = { id: 10, numero: 'POS-10', sucursalId: 2, estado: 'ENTREGADO', metodoPago: 'CREDITO', total: decimal(100), subtotal: decimal(100), descuento: decimal(0), puntosGanados: 0, puntosCanjeados: 0, puntosCreditoPendientes: 0, cuentaCredito: { id: 4, saldo: decimal(100), anulada: false }, detalles: [{ id: 7, productoId: 5, cantidad: 2, subtotal: decimal(100), costoVentaHistorico: decimal(40), consumoInventario: [{ tipo: 'PRODUCTO', id: 5, cantidad: 2 }] }], operacionesCaja: [] };
  const db: any = {
    $executeRaw: jest.fn(),
    pedido: { findFirst: jest.fn().mockResolvedValue(pedido), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    caja: { findFirst: jest.fn().mockResolvedValue({ id: 1, usuarioId: 3, montoInicial: decimal(100) }) },
    operacionVentaCaja: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn().mockImplementation(({ data })=>({ id: 8, ...data })) },
    cuentaAdministrativa: { update: jest.fn() }, abonoAdministrativo: { create: jest.fn() },
    movimientoFinanciero: { create: jest.fn().mockResolvedValue({ id: 6 }), findFirst: jest.fn().mockResolvedValue({ monto: decimal(40) }) },
    auditoria: { create: jest.fn() }, pedidoWeb: { findUnique: jest.fn().mockResolvedValue(null) },
    producto: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, ingrediente: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    cliente: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  db.$transaction = jest.fn(fn=>fn(db));
  return { db, pedido, service: new OperacionesVentaService(db) };
}
describe('Crédito y devoluciones del POS', ()=>{
  it('reparte descuentos sin perder centavos', ()=>{
    expect(importesNetos([1,1,1], 1)).toEqual([0.34,0.33,0.33]);
    expect(importesNetos([20,30],40).reduce((a,b)=>a+b,0)).toBe(40);
    expect(()=>importesNetos([NaN],10)).toThrow();
  });
  it('cuadra cobros reales sin contar la deuda como efectivo', ()=>{
    expect(desgloseCobros([{metodoPago:'CREDITO',total:100},{metodoPago:'EFECTIVO',total:80}], [{tipo:'COBRO_CREDITO',metodoPago:'EFECTIVO',monto:30},{tipo:'DEVOLUCION',metodoPago:'EFECTIVO',monto:20}])).toEqual([{metodo:'EFECTIVO',total:90}]);
  });
  const cobro = { clave:'cobro-1', monto:30, metodoPago:'EFECTIVO', referencia:'Recibo 1' };
  const devolucion = { clave:'dev-1', metodoPago:'EFECTIVO', motivo:'Producto devuelto', reponer:true, items:[{detalleId:7,cantidad:1}] };
  it('registra abono, ingreso y operación en la misma transacción', async()=>{
    const {db,service}=escenario(); const op=await service.cobrar(10,cobro,actor);
    expect(op).toMatchObject({tipo:'COBRO_CREDITO',cajaId:1});
    expect(db.cuentaAdministrativa.update).toHaveBeenCalledWith({where:{id:4},data:{saldo:{decrement:decimal(30)}}});
    expect(db.abonoAdministrativo.create).toHaveBeenCalled();
    expect(db.movimientoFinanciero.create).toHaveBeenCalledWith({data:expect.objectContaining({tipo:'INGRESO',categoria:'VENTA',empresaId:1})});
  });
  it('rechaza abonos por encima del saldo', async()=>{
    const {db,service}=escenario(); await expect(service.cobrar(10,{...cobro,monto:101},actor)).rejects.toThrow('supera');
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
  });
  it('rechaza al cajero de otra sede antes de escribir', async()=>{
    const {db,service}=escenario(); await expect(service.cobrar(10,cobro,{...actor,sucursalId:9})).rejects.toThrow('otra sede');
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
  });
  it('no permite cobrar usando la caja de otro cajero', async()=>{
    const {db,service}=escenario();db.caja.findFirst.mockResolvedValue({id:1,usuarioId:99});
    await expect(service.cobrar(10,cobro,actor)).rejects.toThrow('caja abierta');
  });
  it('repite la respuesta sin cobrar dos veces aunque ya esté cerrada la caja', async()=>{
    const {db,service}=escenario();const op=await service.cobrar(10,cobro,actor);
    db.operacionVentaCaja.findUnique.mockResolvedValue(op);db.caja.findFirst.mockResolvedValue(null);
    expect(await service.cobrar(10,cobro,actor)).toEqual(op);
    expect(db.abonoAdministrativo.create).toHaveBeenCalledTimes(1);
    await expect(service.cobrar(10,{...cobro,monto:31},actor)).rejects.toThrow('otra operación');
    await expect(service.cobrar(10,cobro,{...actor,empresaId:9})).rejects.toThrow('otra operación');
  });
  it('reduce primero la deuda y repone solo la cantidad devuelta', async()=>{
    const {db,service}=escenario();const op=await service.devolver(10,devolucion,actor);
    expect(op.detalle).toMatchObject({valorTotal:50,deudaReducida:50,reembolso:0});
    expect(db.producto.updateMany).toHaveBeenCalledWith({where:{id:5,empresaId:1,stockActual:{lte:2147483646}},data:{stockActual:{increment:1}}});
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalledWith({data:expect.objectContaining({categoria:'VENTA'})});
  });
  it('reembolsa solo lo que supera la deuda pendiente', async()=>{
    const {pedido,service}=escenario();pedido.cuentaCredito.saldo=decimal(20);
    expect((await service.devolver(10,devolucion,actor)).detalle).toMatchObject({deudaReducida:20,reembolso:30});
  });
  it('no devuelve más cantidad de la vendida', async()=>{
    const {db,service}=escenario();await expect(service.devolver(10,{...devolucion,items:[{detalleId:7,cantidad:3}]},actor)).rejects.toThrow('cantidad');
    expect(db.producto.updateMany).not.toHaveBeenCalled();
  });
  it('rechaza reposición parcial de ventas antiguas sin consumo por línea', async()=>{
    const {pedido,service}=escenario();pedido.detalles[0].consumoInventario=null;
    await expect(service.devolver(10,devolucion,actor)).rejects.toThrow('consumo por línea');
  });
  it('no reembolsa efectivo que no está registrado en caja', async()=>{
    const {db,pedido,service}=escenario();pedido.metodoPago='EFECTIVO';pedido.cuentaCredito=null;
    db.caja.findFirst.mockResolvedValue({id:1,usuarioId:3,montoInicial:decimal(0)});
    await expect(service.devolver(10,devolucion,actor)).rejects.toThrow('no alcanza');
    expect(db.producto.updateMany).not.toHaveBeenCalled();
  });
});
