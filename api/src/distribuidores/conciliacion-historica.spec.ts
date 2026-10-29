import { PedidosDistribuidorService } from './pedidos-distribuidor.service';
function escenario(){
 const fecha=new Date('2026-10-28T17:00:00Z');
 const p={id:1,numero:'DIST-2-001',empresaId:2,sucursalId:2,distribuidorId:7,total:30000,estado:'ENTREGADO',liquidacionId:null,creadoEn:fecha,distribuidor:{codigo:'D7',nombre:'Persona'},detalles:[{productoId:5,cantidad:3,precioUnitario:10000,subtotal:30000,presentacionId:null,presentacionNombre:null,factorUnidades:1}]};
 let control:any=null;
 const tx:any={$executeRaw:jest.fn(),pedidoDistribuidor:{findFirst:jest.fn().mockResolvedValue(p)},auditoria:{findMany:jest.fn().mockImplementation(()=>control?[{entidadId:1,detalle:control}]:[]),create:jest.fn().mockImplementation(({data})=>{control=data.detalle;})},cliente:{upsert:jest.fn().mockResolvedValue({id:99,activo:true,nombre:'Distribuidor'})},producto:{updateMany:jest.fn()},pedido:{create:jest.fn().mockResolvedValue({id:10,numero:'HIST-DIST-2-001'}),findMany:jest.fn().mockResolvedValue([{id:10,estado:'ENTREGADO',cuentaCredito:{saldo:30000},operacionesCaja:[]}])},cuentaAdministrativa:{create:jest.fn()},movimientoFinanciero:{findMany:jest.fn().mockResolvedValue([{id:20,tipo:'INGRESO',categoria:'VENTA',monto:30000,pedidoId:null,fecha},{id:21,tipo:'EGRESO',categoria:'COSTO_VENTA',monto:12000,pedidoId:null,fecha}]),create:jest.fn().mockResolvedValue({id:22}),update:jest.fn()}};
 const pos:any={crearEnTransaccion:jest.fn()};
 return {tx,pos,service:new PedidosDistribuidorService({$transaction:jest.fn(fn=>fn(tx))} as any,pos)};
}
const actor={id:3,empresaId:2,rol:'ADMIN_EMPRESA'};
const datos={clave:'conciliar-1',confirmarSalidaSinPago:true,totalEsperado:30000};
describe('Conciliación de mercancía histórica retirada sin pagar',()=>{
 it('recupera el saldo sin otra salida de stock, costo o ingreso y puede reintentarse',async()=>{
  const {service,tx,pos}=escenario();
  expect(await service.conciliarCreditoHistorico(1,datos,actor)).toMatchObject({estadoGestion:'PENDIENTE_PAGO',saldoPendiente:30000,entregado:true,comisionDisponible:false});
  expect(await service.conciliarCreditoHistorico(1,datos,actor)).toMatchObject({pedidoCajaId:10,saldoPendiente:30000});
  expect(tx.pedido.create).toHaveBeenCalledTimes(1);expect(tx.cuentaAdministrativa.create).toHaveBeenCalledTimes(1);
  expect(tx.producto.updateMany).not.toHaveBeenCalled();expect(pos.crearEnTransaccion).not.toHaveBeenCalled();
  expect(tx.movimientoFinanciero.create).toHaveBeenCalledTimes(1);
  expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith({data:expect.objectContaining({tipo:'EGRESO',categoria:'VENTA',monto:30000,fecha:new Date('2026-10-28T17:00:00Z')})});
 });
 it('exige confirmación administrativa y el total exacto',async()=>{
  const {service,tx}=escenario();
  await expect(service.conciliarCreditoHistorico(1,datos,{...actor,rol:'CAJERO'})).rejects.toThrow('administración');
  await expect(service.conciliarCreditoHistorico(1,{...datos,confirmarSalidaSinPago:false},actor)).rejects.toThrow('Confirma');
  await expect(service.conciliarCreditoHistorico(1,{...datos,totalEsperado:15000},actor)).rejects.toThrow('total');
  expect(tx.pedido.create).not.toHaveBeenCalled();
 });
 it('no importa ingresos ambiguos ni vinculados a otra venta',async()=>{
  const {service,tx}=escenario();tx.movimientoFinanciero.findMany.mockResolvedValue([{tipo:'INGRESO',categoria:'VENTA',monto:30000,pedidoId:88}]);
  await expect(service.conciliarCreditoHistorico(1,datos,actor)).rejects.toThrow('revisión individual');expect(tx.pedido.create).not.toHaveBeenCalled();
 });
});
