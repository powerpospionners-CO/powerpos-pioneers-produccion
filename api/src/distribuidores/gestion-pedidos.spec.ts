import { gestionPedidos } from './gestion-pedidos';
describe('Gestión de retiro y pago de distribuidores',()=>{
  it('distingue pendiente de retiro, deuda, pagado y registros históricos sin duplicarlos',async()=>{
    const db:any={auditoria:{findMany:jest.fn().mockResolvedValue([{entidadId:1,detalle:{modalidad:'PAGO_ANTES',pedidoCajaId:null}},{entidadId:2,detalle:{modalidad:'COBRO_POSTERIOR',pedidoCajaId:20}},{entidadId:3,detalle:{modalidad:'PAGO_ANTES',pedidoCajaId:30}}])},pedido:{findMany:jest.fn().mockResolvedValue([{id:20,numero:'POS20',cuentaCredito:{saldo:15000},operacionesCaja:[]},{id:30,numero:'POS30',cuentaCredito:null,operacionesCaja:[]}])}};
    const r=await gestionPedidos(db,2,[1,2,3,4].map(id=>({id,total:30000,estado:'ENTREGADO'})));
    expect(r.map(p=>p.estadoGestion)).toEqual(['PENDIENTE_RETIRO','PENDIENTE_PAGO','PAGADO','HISTORICO']);
    expect(r.map(p=>p.comisionDisponible)).toEqual([false,false,true,false]);
    expect(r[1].saldoPendiente).toBe(15000);expect(r[3].saldoPendiente).toBeNull();
    expect(db.pedido.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({sucursal:{empresaId:2}})}));
  });
  it('excluye de comisión los pedidos devueltos o con una venta vinculada que falta',async()=>{
    const db:any={auditoria:{findMany:jest.fn().mockResolvedValue([{entidadId:1,detalle:{pedidoCajaId:10}},{entidadId:2,detalle:{pedidoCajaId:20}}])},pedido:{findMany:jest.fn().mockResolvedValue([{id:10,operacionesCaja:[{id:1}],cuentaCredito:{saldo:0}}])}};
    const r=await gestionPedidos(db,2,[{id:1,total:100,estado:'ENTREGADO'},{id:2,total:100,estado:'ENTREGADO'}]);
    expect(r.every(p=>p.estadoGestion==='EN_REVISION'&&!p.comisionDisponible)).toBe(true);
  });
});
