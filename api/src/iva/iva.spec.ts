import { aplicarCambios, configInicial, desglosar, desglosarVenta, normalizarConfig, tarifaDe, validarCambios } from './iva.reglas';
import { IvaService } from './iva.service';
import { libroDiario, cuadra } from '../contabilidad/contabilidad.reglas';

describe('Reglas de IVA', () => {
  it('el Trailer no es responsable; las demás empresas sí, al 19 % sin confirmar', () => {
    expect(configInicial(1).responsable).toBe(false);
    const c = configInicial(4);
    expect(c.responsable).toBe(true);
    expect(tarifaDe(c, 10)).toEqual({ tarifa: 'IVA19', confirmada: false });
  });
  it('separa base e IVA de un precio con IVA incluido sin perder centavos', () => {
    expect(desglosar(11900, 'IVA19')).toEqual({ base: 10000, iva: 1900 });
    expect(desglosar(10500, 'IVA5')).toEqual({ base: 10000, iva: 500 });
    expect(desglosar(3000, 'EXCLUIDO')).toEqual({ base: 3000, iva: 0 });
    const x = desglosar(9999, 'IVA19');
    expect(x.base + x.iva).toBeCloseTo(9999, 2);
  });
  it('reparte una venta con descuento entre tarifas y suma exactamente el total', () => {
    const c = aplicarCambios(configInicial(4), validarCambios({ productos: { '1': 'IVA19', '2': 'IVA5', '3': 'EXCLUIDO' } }));
    const d = desglosarVenta([{ productoId: 1, subtotal: 11900 }, { productoId: 2, subtotal: 10500 }, { productoId: 3, subtotal: 2000 }], 21960, c);
    const suma = ['IVA19', 'IVA5', 'EXENTO', 'EXCLUIDO'].reduce((s, t) => s + (d as any)[t].base + (d as any)[t].iva, 0);
    expect(Math.round(suma * 100) / 100).toBe(21960);
    expect(d.IVA19.iva).toBeGreaterThan(0);
    expect(d.EXCLUIDO.iva).toBe(0);
    expect(desglosarVenta([{ productoId: 1, subtotal: 11900 }], 11900, configInicial(1))).toMatchObject({ EXCLUIDO: { base: 11900, iva: 0 }, IVA19: { base: 0, iva: 0 } });
  });
  it('valida los cambios y permite volver un producto a sin confirmar', () => {
    expect(() => validarCambios({ productos: { '1': 'IVA16' } })).toThrow('Tarifa');
    expect(() => validarCambios({ responsable: 'si' })).toThrow('responsable');
    const c = aplicarCambios(normalizarConfig({ productos: { '1': 'IVA5' } }, 4), validarCambios({ productos: { '1': null } }));
    expect(c.productos).toEqual({});
  });
});

describe('Libro diario con IVA', () => {
  it('lleva la base a ventas y el IVA a la cuenta por pagar; las compras separan el IVA descontable', () => {
    const c = aplicarCambios(configInicial(4), validarCambios({ productos: { '1': 'IVA19' } }));
    const libro = libroDiario({
      restaurante: false,
      ventas: [{ fecha: '2026-11-20', total: 11900, costo: 5000, pagos: [{ metodo: 'EFECTIVO', monto: 11900 }], desglose: desglosarVenta([{ productoId: 1, subtotal: 11900 }], 11900, c) }],
      devoluciones: [{ fecha: '2026-11-21', metodo: 'EFECTIVO', monto: 5950, desglose: desglosarVenta([{ productoId: 1, subtotal: 11900 }], 5950, c) }],
      cobrosCredito: [], propinas: [],
      movimientos: [{ id: 1, fecha: '2026-11-20', tipo: 'EGRESO', categoria: 'COMPRA_MERCANCIA', descripcion: 'Compra', monto: 59500, ivaDescontable: 9500 }],
      obligaciones: [],
    });
    expect(libro.every(cuadra)).toBe(true);
    expect(libro[0].lineas.map((l) => [l.cuenta, l.debito, l.credito])).toEqual([['110505', 11900, 0], ['413505', 0, 10000], ['240805', 0, 1900]]);
    expect(libro.find((x) => x.tipo === 'Gasto o compra')!.lineas.map((l) => [l.cuenta, l.debito, l.credito])).toEqual([['143505', 50000, 0], ['240810', 9500, 0], ['110505', 0, 59500]]);
    expect(libro.find((x) => x.tipo === 'Devoluciones')!.lineas.map((l) => [l.cuenta, l.debito, l.credito])).toEqual([['417505', 5000, 0], ['240805', 950, 0], ['110505', 0, 5950]]);
  });
});

describe('Servicio de IVA', () => {
  it('reporta IVA generado menos devoluciones y descontable de compras', async () => {
    const guardado: any = { productos: { '1': 'IVA19', '2': 'IVA5' } };
    const ajustes: any = { leer: jest.fn(async () => guardado), guardar: jest.fn() };
    const prisma: any = {
      pedido: { findMany: jest.fn().mockResolvedValue([{ id: 1, total: 22400, detalles: [{ productoId: 1, subtotal: 11900 }, { productoId: 2, subtotal: 10500 }] }]) },
      operacionVentaCaja: { findMany: jest.fn().mockResolvedValue([{ monto: 11900, pedido: { total: 11900, detalles: [{ productoId: 1, subtotal: 11900 }] } }]) },
      compraGasto: { findMany: jest.fn().mockResolvedValue([{ monto: 23800, detalles: [{ productoId: 1, subtotal: 23800 }] }]) },
      producto: { findMany: jest.fn().mockResolvedValue([{ id: 1, nombre: 'A', precio: 11900, categoria: null }, { id: 3, nombre: 'C', precio: 1000, categoria: null }]), count: jest.fn().mockResolvedValue(1) },
    };
    const r: any = await new IvaService(prisma, ajustes).reporte(4, '2026-11-01', '2026-11-30');
    expect(r).toMatchObject({ ivaGenerado: 500, ivaDescontable: 3800, saldo: -3300, sinConfirmar: 1 });
    await expect(new IvaService(prisma, ajustes).guardar(4, 1, { productos: { '1': 'IVA5', '99': 'IVA19' } })).rejects.toThrow('no pertenece');
  });
});
