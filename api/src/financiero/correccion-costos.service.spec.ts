import { CorreccionCostosService } from './correccion-costos.service';

describe('Corrección auditada de costo por kilo',()=>{
  function preparar(){
    const tx:any={
      $queryRaw:jest.fn(),
      $executeRaw:jest.fn(),
      sucursal:{findMany:jest.fn().mockResolvedValue([{id:2}])},
      producto:{findFirst:jest.fn().mockResolvedValue({id:454,nombre:'Maíz',ventaGranel:true,unidadGranel:'kg',costo:12000,precio:20}),update:jest.fn()},
      auditoria:{findFirst:jest.fn().mockResolvedValue(null),create:jest.fn()},
      pedido:{findMany:jest.fn().mockResolvedValue([{id:346,numero:'PED-2-20261019-0011',costoVentaHistorico:7897650,operacionesCaja:[],detalles:[{id:834,productoId:454,cantidad:658,factorUnidades:1,costoVentaHistorico:7896000}]}]),update:jest.fn()},
      detallePedido:{update:jest.fn()},
      movimientoFinanciero:{findMany:jest.fn().mockResolvedValue([{id:730,tipo:'EGRESO',monto:7897650}]),update:jest.fn()},
    };
    return {tx,service:new CorreccionCostosService({$transaction:jest.fn(fn=>fn(tx))} as any)};
  }
  it('simula el pedido real sin escribir y conserva precio de venta',async()=>{
    const {tx,service}=preparar();
    const r=await service.corregir(2,7,{productoId:454,costoRegistrado:12000});
    expect(r).toMatchObject({costoBase:12,precioConservado:20,aplicada:false});
    expect(r.ajustes[0]).toMatchObject({costoAnterior:7897650,costoCorregido:9546});
    expect(tx.producto.update).not.toHaveBeenCalled();expect(tx.detallePedido.update).not.toHaveBeenCalled();
  });
  it('corrige costo histórico, movimiento y producto con auditoría, sin cambiar ventas ni existencias',async()=>{
    const {tx,service}=preparar();
    await service.corregir(2,7,{productoId:454,costoRegistrado:12000,aplicar:true});
    expect(tx.producto.update).toHaveBeenCalledWith({where:{id:454},data:{costo:12}});
    expect(tx.detallePedido.update).toHaveBeenCalledWith({where:{id:834},data:{costoVentaHistorico:7896}});
    expect(tx.pedido.update).toHaveBeenCalledWith({where:{id:346},data:{costoVentaHistorico:9546}});
    expect(tx.movimientoFinanciero.update).toHaveBeenCalledWith({where:{id:730},data:{monto:9546}});
    expect(tx.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({empresaId:2,usuarioId:7,entidad:'CORRECCION_COSTO_GRANEL'})}));
  });
  it('no inventa costos faltantes y no vuelve a aplicar una corrección ya auditada',async()=>{
    const {tx,service}=preparar();
    tx.pedido.findMany.mockResolvedValue([{id:430,numero:'V',costoVentaHistorico:null,operacionesCaja:[],detalles:[{id:1,productoId:454,cantidad:456,factorUnidades:1,costoVentaHistorico:5472000}]}]);
    tx.movimientoFinanciero.findMany.mockResolvedValue([{id:1,tipo:'EGRESO',monto:5502790}]);
    const r=await service.corregir(2,7,{productoId:454,costoRegistrado:12000,aplicar:true});
    expect(r.ajustes[0].costoCorregido).toBe(36262);expect(tx.pedido.update).not.toHaveBeenCalled();
    tx.producto.findFirst.mockResolvedValue({id:454,ventaGranel:true,unidadGranel:'kg',costo:12});
    tx.auditoria.findFirst.mockResolvedValue({detalle:r});
    expect(await service.corregir(2,7,{productoId:454,costoRegistrado:12000,aplicar:true})).toMatchObject({yaAplicada:true});
    expect(tx.producto.update).toHaveBeenCalledTimes(1);
  });
});
