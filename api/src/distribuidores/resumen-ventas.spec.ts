import { Prisma } from '@prisma/client';
import { resumirVentasDistribuidores } from './resumen-ventas';
import { DistribuidoresService } from './distribuidores.service';

describe('Ventas y comisiones visibles para el administrador', () => {
  const fecha = new Date('2026-10-01T15:00:00Z');
  const pedido = { distribuidorId: 7, estado: 'ENTREGADO', estadoGestion: 'PAGADO', total: 100, comisionMonto: 10, liquidacionId: null, comisionDisponible: true, creadoEn: fecha };
  it('separa ventas entregadas, pedidos por retirar y comisiones sin liquidar', () => {
    const resumen = resumirVentasDistribuidores([
      pedido,
      { ...pedido, total: 200, comisionMonto: 20, liquidacionId: 4 },
      { ...pedido, total: 300, estadoGestion: 'PENDIENTE_PAGO', comisionDisponible: false },
      { ...pedido, total: 400, estadoGestion: 'PENDIENTE_RETIRO', comisionDisponible: false },
      { ...pedido, total: 500, estadoGestion: 'EN_REVISION', comisionDisponible: false },
      { ...pedido, total: 600, estado: 'ANULADO', estadoGestion: 'ANULADO', comisionDisponible: false },
      { ...pedido, total: 700, estadoGestion: 'HISTORICO', comisionDisponible: false },
    ]);
    expect(resumen[0]).toMatchObject({ ventasEntregadas: 1300, cantidadVentas: 4, pendienteRetiro: 400, cantidadRetiro: 1, comisionPendiente: 10, ventasPorLiquidar: 100, cantidadLiquidable: 1, cantidadRevision: 2, primeraVentaLiquidable: fecha.toISOString() });
  });
  it('suma la comisión histórica registrada, conserva centavos y separa distribuidores', () => {
    const resumen = resumirVentasDistribuidores([{ ...pedido, total: new Prisma.Decimal('0.10'), comisionMonto: '0.01' }, { ...pedido, total: '0.20', comisionMonto: '0.02' }, { ...pedido, distribuidorId: 8, comisionMonto: 3 }]);
    expect(resumen[0]).toMatchObject({ ventasEntregadas: 0.3, comisionPendiente: 0.03 });
    expect(resumen[1]).toMatchObject({ distribuidorId: 8, ventasEntregadas: 100, comisionPendiente: 3 });
  });
  it('no pierde pedidos por el antiguo límite de 200 y consulta solo la empresa autenticada', async () => {
    const pedidos = Array.from({ length: 205 }, (_, i) => ({ ...pedido, id: i + 1 }));
    const db: any = {
      pedidoDistribuidor: { findMany: jest.fn().mockResolvedValue(pedidos) },
      auditoria: { findMany: jest.fn().mockResolvedValue(pedidos.map(p => ({ entidadId: p.id, detalle: { pedidoCajaId: p.id + 1000 } }))) },
      pedido: { findMany: jest.fn().mockResolvedValue(pedidos.map(p => ({ id: p.id + 1000, estado: 'ENTREGADO', cuentaCredito: null, operacionesCaja: [] }))) },
    };
    const resultado = await new DistribuidoresService(db).resumenVentas(2);
    expect(resultado[0]).toMatchObject({ cantidadVentas: 205, ventasEntregadas: 20500, comisionPendiente: 2050 });
    expect(db.pedidoDistribuidor.findMany.mock.calls[0][0].where).toEqual({ empresaId: 2, estado: { not: 'ANULADO' } });
    expect(db.pedidoDistribuidor.findMany.mock.calls[0][0].take).toBeUndefined();
    expect(db.pedido.findMany.mock.calls[0][0].where.sucursal).toEqual({ empresaId: 2 });
  });
  it('pagina el historial por distribuidor y comprueba pertenencia antes de consultar', async () => {
    const db: any = { distribuidor: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) }, pedidoDistribuidor: { count: jest.fn().mockResolvedValue(75), findMany: jest.fn().mockResolvedValue([]) } };
    const servicio = new DistribuidoresService(db);
    expect(await servicio.ventasDistribuidor(7, 2, 2)).toMatchObject({ total: 75, pagina: 2, paginas: 2 });
    expect(db.pedidoDistribuidor.findMany.mock.calls[0][0]).toMatchObject({ where: { empresaId: 2, distribuidorId: 7 }, take: 50, skip: 50 });
    db.distribuidor.findFirst.mockResolvedValue(null);
    await expect(servicio.ventasDistribuidor(8, 2)).rejects.toThrow('no encontrado');
    expect(db.pedidoDistribuidor.findMany).toHaveBeenCalledTimes(1);
    await expect(servicio.ventasDistribuidor(7, 2, 0)).rejects.toThrow('Página');
  });
});
