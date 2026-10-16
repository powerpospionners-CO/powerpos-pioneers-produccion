import { RentabilidadHistoricaService } from './rentabilidad-historica.service';
describe('Historical margin coverage', () => {
  it('excludes unknown historical costs and delivery fees rather than inventing profit', async () => {
    const db: any = { pedido: { count: jest.fn().mockResolvedValue(2), findMany: jest.fn().mockResolvedValue([
      { subtotal: 100, descuento: 10, costoVentaHistorico: 40, detalles: [{ productoId: 1, cantidad: 2, subtotal: 100, costoVentaHistorico: 40, producto: { nombre: 'A' } }] },
      { subtotal: 200, descuento: 0, costoVentaHistorico: null, detalles: [] },
    ]) } };
    const d = await new RentabilidadHistoricaService(db).consultar(7, '2026-10-15', '2026-10-15');
    expect(d).toMatchObject({ ventasCubiertas: 90, costo: 40, margenBruto: 50, pedidosConCosto: 1, pedidosSinCosto: 1, ventasSinCosto: 200 });
    expect(d.productos[0]).toMatchObject({ ventas: 90, costo: 40, margenBruto: 50 });
    expect(db.pedido.findMany.mock.calls[0][0].where).toMatchObject({ sucursal: { empresaId: 7 }, estado: { not: 'ANULADO' } });
  });
  it('rejects an inaccessible branch before querying sales', async () => {
    const db: any = { sucursal: { findFirst: jest.fn().mockResolvedValue(null) }, pedido: { count: jest.fn() } };
    await expect(new RentabilidadHistoricaService(db).consultar(7, '2026-10-15', '2026-10-15', '99')).rejects.toThrow('Sucursal');
    expect(db.pedido.count).not.toHaveBeenCalled();
  });
});
