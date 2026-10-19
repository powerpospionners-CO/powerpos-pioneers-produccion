import { ProductosService } from './productos.service';

describe('Distribución de comandas', () => {
  const montar = () => {
    const tx: any = { $executeRaw: jest.fn().mockResolvedValue(1), producto: { count: jest.fn().mockResolvedValue(2) }, auditoria: { findFirst: jest.fn().mockResolvedValue({ detalle: { asignaciones: { '9': 'VAPORERA', '10': 'SIN_COMANDA' } } }), create: jest.fn().mockResolvedValue({}) } };
    const db: any = { ...tx, $transaction: jest.fn(fn => fn(tx)) };
    return { tx, db, service: new ProductosService(db, {} as any) };
  };
  it('guarda los lados sin alterar productos y conserva las decisiones de otros administradores', async () => {
    const {tx,service}=montar();
    const r=await service.guardarComandas([{productoId:516,estacion:'PLANCHA'},{productoId:507,estacion:'VAPORERA'}],1,44);
    expect(r.asignaciones).toEqual({'9':'VAPORERA','10':'SIN_COMANDA','516':'PLANCHA','507':'VAPORERA'});
    expect(tx.producto.count).toHaveBeenCalledWith({where:{empresaId:1,activo:true,id:{in:[516,507]}}});
    expect(tx.auditoria.create).toHaveBeenCalledWith({data:expect.objectContaining({empresaId:1,usuarioId:44,entidad:'ConfiguracionComandas'})});
  });
  it('rechaza productos de otra empresa antes de guardar', async () => {
    const {tx,service}=montar();tx.producto.count.mockResolvedValue(0);
    await expect(service.guardarComandas([{productoId:516,estacion:'PLANCHA'}],1,44)).rejects.toThrow();
    expect(tx.auditoria.create).not.toHaveBeenCalled();
  });
  it('rechaza empresas, estaciones e identificadores inválidos', async () => {
    const {db,service}=montar();
    await expect(service.guardarComandas([{productoId:1,estacion:'PLANCHA'}],2,44)).rejects.toThrow();
    for(const cambios of [[],[{productoId:1,estacion:'OTRA'}],[{productoId:-1,estacion:'PLANCHA'}],[{productoId:1,estacion:'PLANCHA'},{productoId:1,estacion:'VAPORERA'}]]) await expect(service.guardarComandas(cambios,1,44)).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('Automático elimina solo la asignación del producto elegido', async () => {
    const {tx,service}=montar();tx.producto.count.mockResolvedValue(1);
    expect((await service.guardarComandas([{productoId:9,estacion:'AUTO'}],1,44)).asignaciones).toEqual({'10':'SIN_COMANDA'});
  });
});
