import { armarKardex, costoReceta, leerConsumos, margen, periodo, sugerirCompra } from './costos.reglas';
import { CostosService } from './costos.service';
import { moduloRuta } from '../auth/permisos';

const f = (iso: string) => new Date(iso);

describe('Reglas de costos', () => {
  it('reconstruye el kardex hacia atrás desde el stock actual', () => {
    const eventos = [
      { fecha: f('2026-11-02T15:00:00Z'), concepto: 'Venta', referencia: 'P-2', entrada: 0, salida: 3 },
      { fecha: f('2026-11-01T15:00:00Z'), concepto: 'Entrada', referencia: 'Compra', entrada: 10, salida: 0 },
      { fecha: f('2026-11-05T15:00:00Z'), concepto: 'Venta', referencia: 'P-9', entrada: 0, salida: 2 },
    ];
    const { inicio, fin } = periodo('2026-11-01', '2026-11-03');
    const k = armarKardex(eventos, 15, inicio, fin);
    expect(k).toMatchObject({ saldoInicial: 10, entradas: 10, salidas: 3, saldoFinal: 17 });
    expect(k.filas.map((x) => x.saldo)).toEqual([20, 17]);
    const vacio = armarKardex(eventos, 15, ...Object.values(periodo('2026-11-03', '2026-11-04')) as [Date, Date]);
    expect(vacio).toMatchObject({ saldoInicial: 17, saldoFinal: 17, filas: [] });
  });
  it('valida el periodo y lee consumos válidos', () => {
    expect(() => periodo('2026-01-01', '2026-12-31')).toThrow('92 días');
    expect(() => periodo('2026-11-05', '2026-11-01')).toThrow();
    expect(leerConsumos([{ tipo: 'PRODUCTO', id: 1, cantidad: 2 }, { tipo: 'X', id: 2, cantidad: 1 }, null])).toEqual([{ tipo: 'PRODUCTO', id: 1, cantidad: 2 }]);
  });
  it('calcula el costo de receta, el margen y la compra sugerida', () => {
    expect(costoReceta({ ingredientes: [{ cantidad: 0.2, ingrediente: { nombre: 'Carne', costoUnitario: 30000 } }, { cantidad: 1, ingrediente: { nombre: 'Pan', costoUnitario: 800 } }] })).toMatchObject({ costo: 6800, incompleto: false });
    expect(costoReceta({ ingredientes: [{ cantidad: 1, ingrediente: { nombre: 'Salsa', costoUnitario: null } }] }).incompleto).toBe(true);
    expect(costoReceta({ costo: null })).toMatchObject({ costo: null, incompleto: true });
    expect(margen(20000, 6800)).toBe(66);
    expect(margen(0, 10)).toBeNull();
    expect(sugerirCompra(5, 2, 28, 28, 7)).toEqual({ consumoDiario: 1, diasCobertura: 5, sugerido: 4 });
    expect(sugerirCompra(50, 0, 0, 28, 7)).toEqual({ consumoDiario: 0, diasCobertura: null, sugerido: 0 });
  });
  it('los costos usan el permiso de inventario', () => {
    expect(moduloRuta('/costos/platos')).toBe('inventario');
  });
});

describe('Servicio de costos', () => {
  const ahora = Date.now();
  const prisma: any = {
    producto: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, nombre: 'Hamburguesa', stockActual: 8, costo: 6000, controlaStock: true }),
      findMany: jest.fn(async ({ where }: any) => where.controlaStock
        ? [{ id: 1, nombre: 'Gaseosa', stockActual: 3, stockMinimo: 2, costo: 1500 }]
        : [
            { id: 1, nombre: 'Hamburguesa', precio: 20000, costo: null, categoria: { nombre: 'Platos' }, ingredientes: [{ cantidad: 1, ingrediente: { nombre: 'Carne', costoUnitario: 9000 } }] },
            { id: 2, nombre: 'Jugo', precio: 6000, costo: 5000, categoria: { nombre: 'Bebidas' }, ingredientes: [] },
          ]),
    },
    ingrediente: { findMany: jest.fn().mockResolvedValue([{ id: 7, nombre: 'Carne', unidad: 'g', unidadCompra: 'kg', factorConversion: 1000, stock: 500, stockMinimo: 200, costoUnitario: 30 }]) },
    movimientoInventario: { findMany: jest.fn().mockResolvedValue([{ creadoEn: new Date(ahora - 3 * 86400000), stockAnterior: 0, stockNuevo: 10, tipo: 'ENTRADA', descripcion: 'Compra', usuario: { nombre: 'Admin' } }]) },
    pedido: { findMany: jest.fn().mockResolvedValue([{ numero: 'P-1', creadoEn: new Date(ahora - 86400000), consumoInventario: [{ tipo: 'PRODUCTO', id: 1, cantidad: 2 }, { tipo: 'INGREDIENTE', id: 7, cantidad: 2800 }] }]) },
    detallePedido: { findMany: jest.fn().mockResolvedValue([{ productoId: 1, cantidad: 10, subtotal: 200000, costoVentaHistorico: 90000 }, { productoId: 2, cantidad: 4, subtotal: 24000, costoVentaHistorico: null }]) },
  };
  const s = new CostosService(prisma);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const hace = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(ahora - 10 * 86400000));
  it('incluye ventas y movimientos en el kardex', async () => {
    const k: any = await s.kardex(4, 'PRODUCTO', 1, hace, hoy);
    expect(k.filas.map((x: any) => [x.concepto, x.entrada, x.salida, x.saldo])).toEqual([['Entrada', 10, 0, 10], ['Venta', 0, 2, 8]]);
    expect(k).toMatchObject({ saldoInicial: 0, saldoFinal: 8, valorSaldoFinal: 48000 });
    await expect(s.kardex(4, 'OTRO', 1, hace, hoy)).rejects.toThrow('Elige');
  });
  it('marca margen bajo y productos sin costo, y separa el margen real', async () => {
    const r: any = await s.platos(4, 30, 30);
    const hamb = r.productos.find((p: any) => p.id === 1), jugo = r.productos.find((p: any) => p.id === 2);
    expect(hamb).toMatchObject({ costo: 9000, margen: 55, margenReal: 55, utilidad: 110000, alerta: null });
    expect(jugo).toMatchObject({ margen: 16.7, alerta: 'MARGEN_BAJO', margenReal: null });
  });
  it('excluye del margen histórico las ventas del mismo producto sin costo registrado', async () => {
    prisma.detallePedido.findMany.mockResolvedValueOnce([
      { productoId: 1, cantidad: 1, subtotal: 20000, costoVentaHistorico: 9000 },
      { productoId: 1, cantidad: 1, subtotal: 20000, costoVentaHistorico: null },
    ]);
    const r = await s.platos(4, 30, 30);
    expect(r.productos.find((p) => p.id === 1)).toMatchObject({ ventas: 40000, margenReal: 55, utilidad: 11000 });
  });
  it('sugiere comprar lo que no alcanza para la cobertura pedida', async () => {
    const r: any = await s.sugerencia(4, 28, 7);
    const carne = r.items.find((x: any) => x.tipo === 'INGREDIENTE');
    expect(carne).toMatchObject({ consumoDiario: 100, diasCobertura: 5, sugerido: 400, enUnidadCompra: 1, unidadCompra: 'kg', costoEstimado: 12000 });
    // La gaseosa alcanza para 42 días: no se sugiere.
    expect(r.items.find((x: any) => x.tipo === 'PRODUCTO')).toBeUndefined();
    expect(r.total).toBe(12000);
  });
});
