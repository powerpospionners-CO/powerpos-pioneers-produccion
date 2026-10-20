import { estadisticasCalendario, fechaBogota } from './estadisticas-calendario';
import { PedidosService } from './pedidos.service';

describe('Dashboard con calendario de Colombia', () => {
  const venta = (creadoEn: string, total: number) => ({ creadoEn: new Date(creadoEn), total, detalles: [], metodoPago: 'EFECTIVO' });

  afterEach(() => jest.useRealTimers());

  it('después de las 7 p.m. conserva las ventas del 19 en el 19, sin inventar un punto del 20', () => {
    const ventas = [venta('2026-10-19T18:00:00Z', 350000), venta('2026-10-20T02:00:00Z', 280000)];
    const resumen = estadisticasCalendario(ventas, new Date('2026-10-20T03:00:00Z'));
    expect(resumen.ventasPorDia.map(d => d.dia.match(/\d+/)?.[0])).toEqual(['13', '14', '15', '16', '17', '18', '19']);
    expect(resumen.ventasPorDia[6].total).toBe(630000);
    expect(resumen.pedidosHoy).toHaveLength(2);
    expect(fechaBogota('2026-10-20T03:00:00Z')).toBe('2026-10-19');
  });

  it('cambia de día a medianoche de Colombia, no a medianoche UTC', () => {
    const ventas = [venta('2026-10-20T04:59:59.999Z', 100), venta('2026-10-20T05:00:00Z', 200)];
    const antes = estadisticasCalendario(ventas, new Date('2026-10-20T04:59:59.999Z'));
    expect(antes.ventasPorDia[6].total).toBe(100);
    expect(antes.pedidosHoy.map(p => p.total)).toEqual([100]);
    const despues = estadisticasCalendario(ventas, new Date('2026-10-20T05:00:00Z'));
    expect(despues.ventasPorDia[5].total).toBe(100);
    expect(despues.ventasPorDia[6].total).toBe(200);
    expect(despues.pedidosHoy.map(p => p.total)).toEqual([200]);
  });

  it('no adelanta el mes o el año por la zona del servidor', () => {
    const ventas = [venta('2027-01-01T02:00:00Z', 100), venta('2027-01-01T05:00:00Z', 200)];
    const resumen = estadisticasCalendario(ventas, new Date('2027-01-01T04:00:00Z'));
    expect(resumen.ventasPorMes).toHaveLength(12);
    expect(resumen.ventasPorMes[11].mes).toMatch(/dic.*2026/);
    expect(resumen.ventasPorMes[11].total).toBe(100);
    expect(resumen.ventasPorDia[6].dia).toMatch(/31/);
  });

  it('maneja febrero bisiesto y deja ceros en días sin ventas', () => {
    const resumen = estadisticasCalendario([venta('2024-03-01T02:00:00Z', 500)], new Date('2024-03-01T04:00:00Z'));
    expect(resumen.ventasPorDia[6].dia).toMatch(/29/);
    expect(resumen.ventasPorDia[6].total).toBe(500);
    expect(resumen.ventasPorDia.slice(0, 6).every(d => d.total === 0)).toBe(true);
    expect(resumen.ventasPorMes[11].mes).toMatch(/feb.*2024/);
  });

  it('agrupa por fecha completa y no mezcla días con la misma etiqueta en otros meses', () => {
    const resumen = estadisticasCalendario([venta('2026-10-19T18:00:00Z', 100), venta('2026-01-19T18:00:00Z', 900)], new Date('2026-10-20T02:00:00Z'));
    expect(resumen.ventasPorDia[6].total).toBe(100);
    expect(resumen.pedidosHoy).toHaveLength(1);
  });

  it('el servicio calcula hoy en Colombia, conserva el histórico y filtra la empresa autenticada', async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-20T03:00:00Z'));
    const pedidos = [venta('2026-10-19T04:00:00Z', 50), venta('2026-10-19T18:00:00Z', 100), venta('2026-10-20T02:00:00Z', 200)];
    const originales = pedidos.map(p => p.creadoEn.toISOString());
    const db: any = { pedido: { findMany: jest.fn().mockResolvedValue(pedidos) } };
    const service = new PedidosService(db, {} as any, {} as any);
    const resultado = await service.obtenerEstadisticas(1);
    expect(resultado.totalHoy).toBe(300); expect(resultado.pedidosHoy).toBe(2);
    expect(resultado.totalHistorico).toBe(350); expect(resultado.pedidosHistoricos).toBe(3);
    expect(resultado.ventasPorDia[6].total).toBe(300);
    expect(pedidos.map(p => p.creadoEn.toISOString())).toEqual(originales);
    expect(db.pedido.findMany.mock.calls[0][0].where).toEqual({ sucursal: { empresaId: 1 }, estado: { not: 'ANULADO' } });
  });
});
