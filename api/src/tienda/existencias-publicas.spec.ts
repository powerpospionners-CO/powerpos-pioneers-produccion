import { TiendaService } from './tienda.service';

describe('Existencias de pedidos web', () => {
  const datos = { clave: 'pedido-existencias-123456789', nombre: 'Cliente', telefono: '3101234567', direccion: 'Centro', zona: 'Centro', metodoPago: 'EFECTIVO', totalEsperado: 2000, items: [{ productoId: 7, cantidad: 2 }] };
  function caso(stockActual: number) {
    const db: any = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ id: 1, activo: true, tiendaConfig: { publicada: true, pedidosHabilitados: true, sucursalId: 1, zonas: [{ nombre: 'Centro', costo: 0 }] } }) },
      pedidoWeb: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'pedido', estado: 'PENDIENTE', total: 2000 }) },
      sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      producto: { findMany: jest.fn().mockResolvedValue([{ id: 7, nombre: 'Chile', precio: 1000, stockActual }]) },
    };
    return { db, service: new TiendaService(db, {} as any, { disponible: async () => false } as any) };
  }
  it.each([0,1])('impide pedir dos unidades cuando quedan %s', async stock => {
    const { db, service } = caso(stock);
    await expect(service.solicitar('mercado', datos)).rejects.toThrow('Existencias insuficientes');
    expect(db.pedidoWeb.create).not.toHaveBeenCalled();
  });
  it('permite solicitar hasta el stock actual sin inventar existencias', async () => {
    const { db, service } = caso(2);
    await expect(service.solicitar('mercado', datos)).resolves.toMatchObject({ id: 'pedido', total: 2000 });
    expect(db.pedidoWeb.create).toHaveBeenCalledTimes(1);
  });
});
