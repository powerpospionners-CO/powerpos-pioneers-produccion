import { PedidosDistribuidorService } from './pedidos-distribuidor.service';
function escenario(modalidad:string){
  const control:any={modalidad,pedidoCajaId:null};
  const p={id:1,numero:'DIST-2-1',empresaId:2,sucursalId:2,distribuidorId:7,total:30000,estado:'ENTREGADO',clienteReferencia:'Cliente',detalles:[{productoId:5,presentacionId:null,cantidad:3,factorUnidades:1,precioUnitario:10000}],distribuidor:{codigo:'D7',nombre:'Persona',activo:true,sucursalId:2}};
  const tx:any={$executeRaw:jest.fn(),pedidoDistribuidor:{findFirst:jest.fn().mockResolvedValue(p)},auditoria:{findMany:jest.fn().mockImplementation(()=>[{entidadId:1,detalle:control}]),create:jest.fn()},cliente:{upsert:jest.fn().mockResolvedValue({id:99,activo:true})},pedido:{findFirst:jest.fn().mockResolvedValue({id:10,numero:'PED-2-1',cuentaCredito:{saldo:0}})}};
  const pos:any={crearEnTransaccion:jest.fn().mockResolvedValue({id:10,numero:'PED-2-1',total:30000,cuentaCredito:{saldo:30000}})};
  return {control,tx,pos,service:new PedidosDistribuidorService({$transaction:jest.fn(fn=>fn(tx))} as any,pos)};
}
const actor={id:3,empresaId:2,sucursalId:2,rol:'CAJERO'};
describe('Entrega de distribuidor a cargo de caja',()=>{
  it('no permite retirar con deuda en la modalidad de pago anticipado',async()=>{
    const {service,pos}=escenario('PAGO_ANTES');await expect(service.entregar(1,{clave:'entrega-1',condicionPago:'CREDITO'},actor)).rejects.toThrow('pago completo');expect(pos.crearEnTransaccion).not.toHaveBeenCalled();
  });
  it('genera una sola venta de crédito al responsable, usando precios y unidades del pedido',async()=>{
    const {service,tx,pos}=escenario('COBRO_POSTERIOR');const r=await service.entregar(1,{clave:'entrega-2',condicionPago:'CREDITO',vencimientoCredito:'2099-01-01',pagos:[]},actor);
    expect(r).toMatchObject({pedidoCajaId:10,saldoPendiente:30000});
    expect(pos.crearEnTransaccion).toHaveBeenCalledWith(expect.objectContaining({clienteId:99,condicionPago:'CREDITO',items:[{productoId:5,presentacionId:null,cantidad:3}]}),3,2,tx,0,{precios:{'5:0':10000},factores:{'5:0':1}});
    expect(tx.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({accion:'ENTREGAR',detalle:expect.objectContaining({pedidoCajaId:10,claveEntrega:'entrega-2'})})}));
  });
  it('reintentar una entrega confirmada no vuelve a descontar ni cobrar',async()=>{
    const {service,pos,control}=escenario('PAGO_ANTES');const datos={clave:'entrega-3',pagos:[{metodoPago:'EFECTIVO',monto:30000}]};Object.assign(control,{pedidoCajaId:10,claveEntrega:datos.clave,solicitudEntrega:JSON.stringify({pagos:datos.pagos,condicionPago:'CONTADO',vencimientoCredito:null,cambio:0})});
    expect(await service.entregar(1,datos,actor)).toMatchObject({pedidoCajaId:10,saldoPendiente:0});expect(pos.crearEnTransaccion).not.toHaveBeenCalled();
  });
});
