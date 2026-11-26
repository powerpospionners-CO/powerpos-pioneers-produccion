import { leerPropina, normalizarConfig, propinaSugerida, repartirIgual, validarConfig } from './propinas.reglas';
import { PropinasService } from './propinas.service';
import { CajaService } from '../caja/caja.service';

// Tabla en memoria con la semántica mínima de propina_registros.
function tablaFalsa() {
  const filas: any[] = [];
  const coincide = (f: any, w: any) =>
    Object.entries(w || {}).every(([k, v]: any) =>
      v && typeof v === 'object' && !(v instanceof Date)
        ? 'in' in v ? v.in.includes(f[k]) : 'gte' in v ? f[k] >= v.gte && (!v.lte || f[k] <= v.lte) : false
        : f[k] === v,
    );
  return {
    filas,
    findUnique: async ({ where }: any) => filas.find((f) => coincide(f, where.empresaId_tipo_clave)) || null,
    findMany: async ({ where }: any) => filas.filter((f) => coincide(f, where)),
    create: async ({ data }: any) => { const f = { creadoEn: new Date(), ...data }; filas.push(f); return f; },
    upsert: async ({ where, create, update }: any) => { const f = filas.find((x) => coincide(x, where.empresaId_tipo_clave)); if (f) Object.assign(f, update); else filas.push({ creadoEn: new Date(), ...create }); },
  };
}

describe('Reglas de propinas', () => {
  it('valida la propina voluntaria y la ignora en cero', () => {
    expect(leerPropina(undefined, 1000)).toBeNull();
    expect(leerPropina({ monto: 0, metodoPago: 'EFECTIVO' }, 1000)).toBeNull();
    expect(leerPropina({ monto: 100, metodoPago: 'TARJETA' }, 1000)).toEqual({ monto: 100, metodoPago: 'TARJETA' });
    expect(() => leerPropina({ monto: -1, metodoPago: 'EFECTIVO' }, 1000)).toThrow('no es válido');
    expect(() => leerPropina({ monto: 1.001, metodoPago: 'EFECTIVO' }, 1000)).toThrow('no es válido');
    expect(() => leerPropina({ monto: 1001, metodoPago: 'EFECTIVO' }, 1000)).toThrow('superar');
    expect(() => leerPropina({ monto: 10, metodoPago: 'CREDITO' }, 1000)).toThrow('Medio');
  });
  it('sugiere como máximo el 10 % legal', () => {
    expect(propinaSugerida(45900, 10)).toBe(4590);
    expect(() => validarConfig({ habilitado: true, porcentaje: 12 })).toThrow('10 %');
    expect(validarConfig({ habilitado: true, porcentaje: 8 })).toEqual({ habilitado: true, porcentaje: 8 });
    expect(normalizarConfig({ porcentaje: 50 })).toEqual({ habilitado: false, porcentaje: 10 });
  });
  it('reparte en partes iguales sin perder pesos', () => {
    expect(repartirIgual(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(repartirIgual(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
    expect(repartirIgual(500, 0)).toEqual([]);
  });
});

describe('Servicio de propinas', () => {
  const pedido = (id: number, total = 50000) => ({ id, sucursalId: 2, cajaId: 1, total });
  it('registra una sola vez por venta, excluye anuladas y reparte entre quienes vendieron', async () => {
    const tabla = tablaFalsa();
    const db: any = { propinaRegistro: tabla, usuario: { findMany: jest.fn(async ({ where }: any) => where.id.in.filter((i: number) => [3, 5].includes(i)).map((id: number) => ({ id, nombre: `U${id}` }))) } };
    const s = new PropinasService(db);
    await s.registrar(db, pedido(10), { monto: 5000, metodoPago: 'EFECTIVO' }, 4, 3);
    await s.registrar(db, pedido(10), { monto: 5000, metodoPago: 'EFECTIVO' }, 4, 3);
    await s.registrar(db, pedido(11), { monto: 3001, metodoPago: 'TARJETA' }, 4, 5);
    await s.registrar(db, pedido(12), { monto: 9000, metodoPago: 'EFECTIVO' }, 4, 5);
    await expect(s.registrar(db, { ...pedido(13), cajaId: null }, { monto: 1, metodoPago: 'EFECTIVO' }, 4, 3)).rejects.toThrow('caja');
    await expect(s.registrar(db, pedido(14, 100), { monto: 101, metodoPago: 'EFECTIVO' }, 4, 3)).rejects.toThrow('superar');
    const resumen = await s.deCaja(4, 1, new Set([10, 11]));
    expect(resumen).toMatchObject({ total: 8001, efectivo: 5000, cantidad: 2, reparto: null });
    const caja = { id: 1, sucursalId: 2, usuarioId: 3, pedidos: [{ usuarioId: 3, estado: 'ENTREGADO' }, { usuarioId: 5, estado: 'ENTREGADO' }, { usuarioId: 9, estado: 'ANULADO' }] };
    const reparto = await s.repartir(db, caja, 4, 3, resumen);
    expect(reparto).toEqual([{ usuarioId: 3, nombre: 'U3', monto: 4001 }, { usuarioId: 5, nombre: 'U5', monto: 4000 }]);
    await expect(s.repartir(db, caja, 4, 3, resumen, [3, 99])).rejects.toThrow('no pertenece');
    expect((await s.deCaja(4, 1, new Set([10, 11]))).reparto).toHaveLength(2);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    expect(await s.reporte(4, hoy, hoy)).toMatchObject({ total: 8001, cierres: 1, personas: [{ usuarioId: 3, monto: 4001, turnos: 1 }, { usuarioId: 5, monto: 4000 }] });
  });
  it('sin tabla de propinas las lecturas devuelven vacío', async () => {
    const error = Object.assign(new Error('no existe'), { code: 'P2021' });
    const db: any = { propinaRegistro: { findMany: jest.fn().mockRejectedValue(error), findUnique: jest.fn().mockRejectedValue(error) } };
    const s = new PropinasService(db);
    expect(await s.config(4)).toEqual({ habilitado: false, porcentaje: 10 });
    expect((await s.deCaja(4, 1, new Set([1]))).total).toBe(0);
  });
});

describe('Cierre de caja con propinas', () => {
  it('suma al efectivo esperado solo las propinas en efectivo de ventas válidas y las reparte', async () => {
    const tabla = tablaFalsa();
    const caja: any = {
      id: 1, sucursalId: 2, usuarioId: 3, estado: 'ABIERTA', montoInicial: 100,
      sucursal: { empresaId: 4, nombre: 'Principal', baseEfectivoCaja: null, empresa: { recaudoEfectivoHabilitado: false } },
      usuario: { nombre: 'Cajero' },
      pedidos: [
        { id: 10, usuarioId: 3, estado: 'ENTREGADO', metodoPago: 'EFECTIVO', total: 200 },
        { id: 11, usuarioId: 3, estado: 'ENTREGADO', metodoPago: 'TARJETA', total: 500 },
        { id: 12, usuarioId: 3, estado: 'ANULADO', metodoPago: 'EFECTIVO', total: 700 },
      ],
    };
    const db: any = {
      propinaRegistro: tabla,
      $executeRawUnsafe: jest.fn(),
      $executeRaw: jest.fn(),
      operacionVentaCaja: { findMany: jest.fn().mockResolvedValue([]) },
      caja: { findUnique: jest.fn().mockResolvedValue(caja), update: jest.fn(async ({ data }: any) => ({ ...caja, ...data })) },
      eventoCaja: { create: jest.fn() },
      usuario: { findMany: jest.fn().mockResolvedValue([{ id: 3, nombre: 'Cajero' }]) },
    };
    db.$transaction = jest.fn(async (fn: any) => fn(db));
    const propinas = new PropinasService(db);
    await propinas.registrar(db, { id: 10, sucursalId: 2, cajaId: 1, total: 200 }, { monto: 20, metodoPago: 'EFECTIVO' }, 4, 3);
    await propinas.registrar(db, { id: 11, sucursalId: 2, cajaId: 1, total: 500 }, { monto: 50, metodoPago: 'TARJETA' }, 4, 3);
    await propinas.registrar(db, { id: 12, sucursalId: 2, cajaId: 1, total: 700 }, { monto: 70, metodoPago: 'EFECTIVO' }, 4, 3);
    const impresion = { imprimirCierreCaja: jest.fn().mockResolvedValue({}) };
    const servicio = new CajaService(db, { enviarAlerta: jest.fn().mockResolvedValue({}) } as any, impresion as any, propinas);
    const r: any = await servicio.cerrarCaja(1, { montoFinal: 320 }, 3, false, 4);
    expect(r).toMatchObject({ montoEsperado: 320, diferencia: 0, propinas: { total: 70, efectivo: 20 } });
    expect(r.propinas.reparto).toEqual([{ usuarioId: 3, nombre: 'Cajero', monto: 70 }]);
    expect(impresion.imprimirCierreCaja.mock.calls[0][0].propinas.total).toBe(70);
  });
});
