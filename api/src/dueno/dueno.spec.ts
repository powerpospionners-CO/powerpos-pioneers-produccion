import { alertasControl, diaBogota, horaBogota, nuevoControl, rango, variacion } from './dueno.reglas';
import { DuenoService } from './dueno.service';

describe('Reglas del dueño', () => {
  it('calcula el día de Bogotá, la hora local y la variación', () => {
    const d = diaBogota('2026-11-26');
    expect(d.inicio.toISOString()).toBe('2026-11-26T05:00:00.000Z');
    expect(horaBogota(new Date('2026-11-26T05:30:00Z'))).toBe(0);
    expect(variacion(120, 100)).toBe(20);
    expect(variacion(50, 0)).toBeNull();
    expect(() => rango('2026-01-01', '2026-12-31')).toThrow('92');
  });
  it('señala anulaciones, descuentos y faltantes altos', () => {
    const u = { ...nuevoControl('a', 'Ana', 'CAJERO'), totalVendido: 1000000, anulaciones: 4, montoAnulado: 80000, descuentos: 150000, faltanteCaja: -30000 };
    expect(alertasControl(u)).toEqual(['Anula más del 5 % de lo que vende', 'Descuentos mayores al 10 %', 'Faltantes de caja acumulados']);
    expect(alertasControl({ ...nuevoControl('b', 'Beto', 'CAJERO'), totalVendido: 1000000, anulaciones: 1, montoAnulado: 90000 })).toEqual([]);
  });
});

describe('Servicio del dueño', () => {
  const dbFalsa = (ventas: number[], diferencia: number | null) => ({
    pedido: {
      findMany: jest.fn(async ({ where }: any) => (where.estado?.not ? ventas.map((t, i) => ({ total: t, descuento: 0, creadoEn: new Date('2026-11-26T15:00:00Z'), usuarioId: i % 2 ? 2 : 1 })) : [])),
      aggregate: jest.fn(async ({ where }: any) => (where.estado === 'ANULADO' ? { _sum: { total: 5000 }, _count: { _all: 1 } } : { _sum: { total: 100 }, _count: { _all: 1 } })),
    },
    caja: { findMany: jest.fn(async ({ where }: any) => (where.estado === 'ABIERTA' ? [{ id: 1, abiertaEn: new Date(), montoInicial: 100000, usuario: { nombre: 'Caja' } }] : [{ id: 2, usuarioId: 1, diferencia, cerradaEn: new Date(), usuario: { nombre: 'Ana' } }])) },
    producto: { findMany: jest.fn().mockResolvedValue([{ stockActual: 1, stockMinimo: 2 }]) },
    ingrediente: { findMany: jest.fn().mockResolvedValue([]) },
    usuario: { findMany: jest.fn().mockResolvedValue([{ id: 1, nombre: 'Ana', email: 'ANA@x.co', rol: 'CAJERO' }, { id: 2, nombre: 'Beto', email: 'beto@x.co', rol: 'CAJERO' }]) },
    movimientoFinanciero: { findMany: jest.fn().mockResolvedValue([{ usuarioId: 1, monto: 5000 }]) },
    operacionVentaCaja: { findMany: jest.fn().mockResolvedValue([]) },
    eventoCaja: { findMany: jest.fn().mockResolvedValue([{ usuarioId: 2, tipo: 'APERTURA_IRREGULAR' }]) },
  });
  const sede1 = dbFalsa([100, 200], -5000), sede2 = dbFalsa([300], 0);
  const prisma: any = {
    aislamientoActivo: true,
    control: {
      sucursal: { findMany: jest.fn(async ({ where }: any) => [{ id: 1, nombre: 'Centro' }, { id: 2, nombre: 'Norte' }, { id: 3, nombre: 'Sur' }].filter((s) => !where.id || s.id === where.id)) },
      baseSede: { findMany: jest.fn().mockResolvedValue([{ sucursalId: 1 }, { sucursalId: 2 }, { sucursalId: 3 }]) },
    },
    contexto: jest.fn(async (_e: number, s: number) => (s === 3 ? Promise.reject(new Error('sin conexión')) : { cliente: s === 1 ? sede1 : sede2 })),
  };
  const s = new DuenoService(prisma);
  const admin = { id: 9, rol: 'ADMIN_EMPRESA', empresaId: 4, sucursalId: 1 };
  it('suma las sedes, compara con la semana anterior y arma alertas', async () => {
    const r: any = await s.resumen(admin, '2026-11-26');
    expect(r.totales).toMatchObject({ ventas: 600, cantidad: 3, ticketPromedio: 200, semanaAnterior: 200, variacion: 200, cajasAbiertas: 2 });
    expect(r.sedes.find((x: any) => x.nombre === 'Centro').porHora[10]).toBe(300);
    expect(r.alertas.map((x: any) => x.tipo)).toEqual(['DIFERENCIA_CAJA', 'ANULACIONES', 'ANULACIONES', 'STOCK_BAJO', 'STOCK_BAJO', 'SEDE_SIN_DATOS']);
  });
  it('el gerente solo ve su sede', async () => {
    const r: any = await s.resumen({ ...admin, rol: 'GERENTE' }, '2026-11-26');
    expect(r.sedes.map((x: any) => x.nombre)).toEqual(['Centro']);
    await expect(s.resumen({ ...admin, rol: 'CAJERO' })).rejects.toThrow('permisos');
  });
  it('agrupa el control por persona entre sedes', async () => {
    const r: any = await s.control(admin, '2026-11-01', '2026-11-26');
    const ana = r.personas.find((p: any) => p.nombre === 'Ana');
    expect(ana).toMatchObject({ sedes: ['Centro', 'Norte'], ventas: 2, totalVendido: 400, anulaciones: 2, montoAnulado: 10000, diferenciasCaja: 1, faltanteCaja: -5000 });
    expect(r.personas.find((p: any) => p.nombre === 'Beto').alertas).toContain('Aperturas irregulares de caja');
    expect(r.sedesSinDatos).toEqual(['Sur']);
  });
});
