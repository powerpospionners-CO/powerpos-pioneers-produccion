import { agruparDias, EstadisticasService, resumirVentas } from './estadisticas.service';

function venta(cambios: Record<string, unknown> = {}) {
  return {
    id: 1,
    total: 100,
    subtotal: 110,
    descuento: 10,
    estado: 'ENTREGADO',
    creadoEn: new Date('2026-10-16T04:30:00Z'),
    sucursalId: 2,
    sucursal: { nombre: 'Centro' },
    metodoPago: 'MIXTO',
    pagos: [
      { metodoPago: 'EFECTIVO', monto: 40 },
      { metodoPago: 'TARJETA', monto: 60 },
    ],
    detalles: [
      {
        productoId: 5,
        cantidad: 2,
        subtotal: 110,
        producto: { nombre: 'Producto' },
      },
    ],
    ...cambios,
  } as any;
}
describe('Estadísticas de negocio', () => {
  it('groups weeks from Monday and preserves year boundaries and daily totals', () => {
    const dias = [{ fecha: '2025-12-31', total: 10, cantidad: 1 }, { fecha: '2026-01-01', total: 20, cantidad: 2 }, { fecha: '2026-01-05', total: 30, cantidad: 3 }];
    expect(agruparDias(dias, 'semana')).toEqual([{ periodo: 'Semana del 2025-12-29', total: 30, cantidad: 3 }, { periodo: 'Semana del 2026-01-05', total: 30, cantidad: 3 }]);
    expect(agruparDias(dias, 'mes')).toEqual([{ periodo: '2025-12', total: 10, cantidad: 1 }, { periodo: '2026-01', total: 50, cantidad: 5 }]);
  });
  const inicio = new Date('2026-10-15T05:00:00Z');
  it('respeta el día colombiano y separa pagos mixtos sin duplicarlos', () => {
    const datos = resumirVentas([venta()], inicio, 1);
    expect(datos.ventas).toBe(100);
    expect(datos.diarias).toEqual([
      { fecha: '2026-10-15', total: 100, cantidad: 1 },
    ]);
    expect(datos.horas[23].total).toBe(100);
    expect(datos.medios).toEqual([
      { medio: 'EFECTIVO', monto: 40 },
      { medio: 'TARJETA', monto: 60 },
    ]);
  });
  it('excluye anuladas de productos, sucursales y medios', () => {
    const datos = resumirVentas(
      [venta(), venta({ estado: 'ANULADO', total: 500 })],
      inicio,
      1,
    );
    expect(datos.ventas).toBe(100);
    expect(datos.cantidad).toBe(1);
    expect(datos.anuladas).toBe(1);
    expect(datos.valorAnulado).toBe(500);
    expect(datos.productos[0].cantidad).toBe(2);
    expect(datos.sucursales[0].total).toBe(100);
  });
  it('incluye días vacíos y no devuelve NaN cuando no hay ventas', () => {
    const datos = resumirVentas([], inicio, 3);
    expect(datos.ticketPromedio).toBe(0);
    expect(datos.diarias).toHaveLength(3);
    expect(datos.horas).toHaveLength(24);
    expect(
      datos.horas.every((h) => h.total === 0 && h.promedioDiario === 0),
    ).toBe(true);
  });
  it('el promedio incluye días con cero ventas y soporta pagos antiguos', () => {
    const datos = resumirVentas(
      [venta({ pagos: [], metodoPago: 'EFECTIVO' })],
      inicio,
      2,
    );
    expect(datos.horas[23].promedioDiario).toBe(50);
    expect(datos.medios).toEqual([{ medio: 'EFECTIVO', monto: 100 }]);
  });
  it('rechaza una sucursal ajena antes de leer sus ventas', async () => {
    const db: any = {
      sucursal: { findFirst: jest.fn().mockResolvedValue(null) },
      pedido: { findMany: jest.fn() },
    };
    await expect(
      new EstadisticasService(db).consultar(
        7,
        '2026-10-15',
        '2026-10-15',
        '22',
      ),
    ).rejects.toThrow('esta empresa');
    expect(db.pedido.findMany).not.toHaveBeenCalled();
  });
  it('rechaza periodos demasiado grandes y fechas invertidas', async () => {
    const service = new EstadisticasService({} as any);
    await expect(
      service.consultar(7, '2025-01-01', '2026-12-31'),
    ).rejects.toThrow('366 días');
    await expect(
      service.consultar(7, '2026-10-16', '2026-10-15'),
    ).rejects.toThrow('366 días');
  });
  it('consulta ambos periodos con aislamiento de empresa y sin solapar límites', async () => {
    const db: any = {
      sucursal: { findMany: jest.fn().mockResolvedValue([]) },
      pedido: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { total: null }, _count: 0 }),
      },
    };
    const resultado = await new EstadisticasService(db).consultar(
      7,
      '2026-10-15',
      '2026-10-15',
    );
    expect(resultado.variacion).toBeNull();
    expect(db.pedido.findMany.mock.calls[0][0].where).toEqual({
      sucursal: { empresaId: 7 },
      creadoEn: { gte: inicio, lt: new Date('2026-10-16T05:00:00Z') },
    });
    expect(db.pedido.aggregate.mock.calls[0][0].where.creadoEn.lt).toEqual(
      inicio,
    );
    expect(resultado.anterior.desde).toBe('2026-10-14');
  });
});
