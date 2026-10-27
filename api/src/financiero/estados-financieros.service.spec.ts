import { EstadosFinancierosService, flujoMovimientos } from './estados-financieros.service';

describe('Estados financieros', () => {
  const fecha=new Date('2026-10-20T12:00:00Z');
  const m=(id:number,tipo:string,categoria:string,monto:number)=>({id,tipo,categoria,monto,fecha});
  it('flujo directo excluye costo y su reversión, y conserva reembolsos reales',()=>{
    expect(flujoMovimientos([m(1,'INGRESO','VENTA',100),m(2,'EGRESO','COSTO_VENTA',70),m(3,'INGRESO','COSTO_VENTA',20),m(4,'EGRESO','VENTA',10)])).toMatchObject({entradas:100,salidas:10,neto:90});
  });
  it('separa ventas devengadas, gastos a crédito, cobros, compras e inventario sin duplicarlos',async()=>{
    const periodo=[m(1,'INGRESO','VENTA',70),m(2,'EGRESO','COSTO_VENTA',30),m(3,'EGRESO','COMPRA_MERCANCIA',40),m(4,'EGRESO','SERVICIOS',5),m(5,'EGRESO','SERVICIOS',3),m(6,'INGRESO','OTROS',2)];
    const prisma:any={
      movimientoFinanciero:{findMany:jest.fn().mockResolvedValue(periodo)},
      pedido:{findMany:jest.fn().mockResolvedValue([{numero:'V-1',total:100,detalles:[{costoVentaHistorico:30},{costoVentaHistorico:null}]}])},
      operacionVentaCaja:{findMany:jest.fn().mockResolvedValue([{detalle:{valorTotal:10}}])},
      cuentaAdministrativa:{findMany:jest.fn().mockResolvedValue([{tipo:'PAGAR',categoria:'SERVICIOS',monto:10,saldo:7,creadoEn:fecha,anulada:false,abonos:[{movimientoId:5}]},{tipo:'COBRAR',saldo:20,abonos:[],anulada:false}])},
      producto:{findMany:jest.fn().mockResolvedValue([{id:454,nombre:'Maíz',costo:12,stockActual:10},{id:2,nombre:'Sin costo',costo:null,stockActual:2}])},
      saldoInicialCuenta:{findUnique:jest.fn().mockResolvedValue({monto:1000,desde:new Date('2026-10-01')})},
    };
    const resultado=await new EstadosFinancierosService(prisma).obtener(2,'2026-10-01','2026-10-25');
    expect(resultado.resultado).toMatchObject({ventasNetas:90,costoVentas:30,gastos:15,otrosIngresos:2,resultadoNeto:47,completo:false,ventasSinCosto:['V-1']});
    expect(resultado.flujo).toMatchObject({entradas:72,salidas:48,neto:24,saldoInicial:1000,saldoFinal:1024});
    expect(resultado.balance).toMatchObject({efectivo:1024,inventario:120,cuentasPorCobrar:20,cuentasPorPagar:7,totalActivos:1164,patrimonioRegistrado:1157,completo:false});
    expect(prisma.producto.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({empresaId:2})}));
  });
  it('rechaza fechas inválidas sin consultar datos de otras empresas',async()=>{
    await expect(new EstadosFinancierosService({} as any).obtener(2,'incorrecta')).rejects.toThrow('rango de fechas');
  });
});
