import { cuadra, libroDiario } from './contabilidad.reglas';
import { ContabilidadService } from './contabilidad.service';

const vacio = { restaurante: true, ventas: [], devoluciones: [], cobrosCredito: [], propinas: [], movimientos: [], obligaciones: [] };

describe('Libro diario', () => {
  it('arma asientos que cuadran para ventas, costo, crédito, devoluciones y propinas', () => {
    const c = libroDiario({
      ...vacio,
      ventas: [
        { fecha: '2026-11-20', total: 50000, costo: 20000, pagos: [{ metodo: 'EFECTIVO', monto: 30000 }, { metodo: 'NEQUI', monto: 20000 }] },
        { fecha: '2026-11-20', total: 40000, costo: null, pagos: [] },
      ],
      devoluciones: [{ fecha: '2026-11-21', metodo: 'EFECTIVO', monto: 5000 }],
      cobrosCredito: [{ fecha: '2026-11-21', metodo: 'TRANSFERENCIA', monto: 10000 }],
      propinas: [{ fecha: '2026-11-20', metodo: 'TARJETA', monto: 4000 }],
    });
    expect(c.map((x) => x.numero)).toEqual(['VT-00001', 'CV-00002', 'PR-00003', 'DV-00004', 'RC-00005']);
    expect(c.every(cuadra)).toBe(true);
    expect(c[0].lineas.map((l) => [l.cuenta, l.debito, l.credito])).toEqual([['110505', 30000, 0], ['111005', 20000, 0], ['130505', 40000, 0], ['414005', 0, 90000]]);
    expect(c[1]).toMatchObject({ verificar: '1 ventas sin costo registrado' });
    expect(c[2].lineas[1]).toMatchObject({ cuenta: '238095', credito: 4000 });
  });
  it('separa gastos pagados, compras por pagar y sus pagos, con la cuenta asignada si existe', () => {
    const c = libroDiario({
      ...vacio,
      restaurante: false,
      movimientos: [
        { id: 1, fecha: '2026-11-20', tipo: 'EGRESO', categoria: 'ARRIENDO', descripcion: 'Arriendo', monto: 1000000 },
        { id: 2, fecha: '2026-11-22', tipo: 'EGRESO', categoria: 'COMPRA_MERCANCIA', descripcion: 'Pago factura 12', monto: 300000, abono: true },
        { id: 3, fecha: '2026-11-22', tipo: 'INGRESO', categoria: 'OTROS', descripcion: 'Reciclaje', monto: 20000, cuenta: '425050' },
      ],
      obligaciones: [{ id: 9, fecha: '2026-11-21', categoria: 'COMPRA_MERCANCIA', descripcion: 'Factura 12', monto: 300000, cuenta: '143505' }],
      nombres: { '425050': 'Aprovechamientos' },
    });
    expect(c.every(cuadra)).toBe(true);
    expect(c.map((x) => [x.numero, x.lineas[0].cuenta, x.lineas[1].cuenta])).toEqual([
      ['EG-00001', '512010', '110505'],
      ['CP-00002', '143505', '220505'],
      ['PG-00003', '220505', '110505'],
      ['IN-00004', '110505', '425050'],
    ]);
    expect(c[3].lineas[1].nombre).toBe('Aprovechamientos');
  });
});

describe('Servicio de contabilidad', () => {
  it('lee la sede, excluye propinas de ventas anuladas y reporta si todo cuadra', async () => {
    const prisma: any = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Mi Restaurante', nit: '900', tipoNegocio: 'RESTAURANTE' }) },
      pedido: { findMany: jest.fn().mockResolvedValue([
        { id: 1, creadoEn: new Date('2026-11-20T20:00:00Z'), total: 30000, metodoPago: 'EFECTIVO', pagos: [], detalles: [{ costoVentaHistorico: 9000 }] },
        { id: 2, creadoEn: new Date('2026-11-21T03:00:00Z'), total: 10000, metodoPago: 'TARJETA', pagos: [{ metodoPago: 'TARJETA', monto: 10000 }], detalles: [{ costoVentaHistorico: null }] },
      ]) },
      operacionVentaCaja: { findMany: jest.fn().mockResolvedValue([]) },
      movimientoFinanciero: { findMany: jest.fn().mockResolvedValue([]) },
      cuentaAdministrativa: { findMany: jest.fn().mockResolvedValue([]) },
      asignacionPuc: { findMany: jest.fn().mockResolvedValue([]) },
      cuentaPuc: { findMany: jest.fn().mockResolvedValue([]) },
      propinaRegistro: { findMany: jest.fn().mockResolvedValue([{ pedidoId: 1, metodoPago: 'EFECTIVO', monto: 3000, creadoEn: new Date('2026-11-20T20:00:00Z') }, { pedidoId: 77, metodoPago: 'EFECTIVO', monto: 9000, creadoEn: new Date('2026-11-20T20:00:00Z') }]) },
    };
    const r: any = await new ContabilidadService(prisma).libroDiario(4, '2026-11-20', '2026-11-20');
    // La venta de las 10 p. m. del 20 en Bogotá cae el 20 aunque en UTC sea el 21.
    expect(r.comprobantes[0]).toMatchObject({ fecha: '2026-11-20', tipo: 'Ventas del día' });
    expect(r.comprobantes[0].lineas.find((l: any) => l.cuenta === '414005').credito).toBe(40000);
    expect(r.comprobantes.find((c: any) => c.tipo === 'Propinas recibidas').lineas[0].debito).toBe(3000);
    expect(r).toMatchObject({ descuadrados: [], porVerificar: 1 });
    expect(r.totales.debitos).toBe(r.totales.creditos);
    await expect(new ContabilidadService(prisma).libroDiario(4, '2026-01-01', '2026-12-31')).rejects.toThrow('92');
  });
});
