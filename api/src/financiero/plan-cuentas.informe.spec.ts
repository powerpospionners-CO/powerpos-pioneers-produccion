import { agruparCuentas, prepararInformePuc } from './plan-cuentas.informe';
import { codigoSuperior, validarCodigoPuc } from './plan-cuentas.catalogo';
import { PlanCuentasService } from './plan-cuentas.service';
import * as motor from '../prisma/mysql-adapter';

describe('Plan de cuentas', () => {
  afterEach(() => jest.restoreAllMocks());
  it('prepara únicamente las tablas PUC en el control y en las sedes verificadas', async () => {
    jest.spyOn(motor, 'motorBase').mockReturnValue('mysql');
    const control = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn(), baseSede: { findMany: jest.fn().mockResolvedValue([{ empresaId: 2, sucursalId: 2 }]) } };
    const sede = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn() };
    const prisma = { control, estadoAislamiento: jest.fn().mockResolvedValue({ activo: true }), contexto: jest.fn().mockResolvedValue({ cliente: sede }) };
    await new PlanCuentasService(prisma as any).onModuleInit();
    expect(prisma.contexto).toHaveBeenCalledWith(2, 2, true);
    for (const db of [control, sede]) {
      expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      for (const [sql] of db.$executeRawUnsafe.mock.calls as unknown as [string][]) expect(sql).toMatch(/^CREATE TABLE IF NOT EXISTS (cuentas_puc|asignaciones_puc) /);
    }
  });
  it('conserva el total de cada clase sin sumar de nuevo sus grupos y mantiene los pendientes', () => {
    const cuentas = [
      { codigo: '4', nombre: 'Ingresos' }, { codigo: '41', nombre: 'Operacionales' }, { codigo: '4135', nombre: 'Comercio' },
      { codigo: '5', nombre: 'Gastos' }, { codigo: '51', nombre: 'Administración' }, { codigo: '5105', nombre: 'Personal' }, { codigo: '510506', nombre: 'Sueldos' },
      { codigo: '6', nombre: 'Costos' }, { codigo: '61', nombre: 'Costos de ventas' }, { codigo: '6135', nombre: 'Comercio' },
    ];
    const fuente = { origen: 'MOVIMIENTO', id: 10, fecha: new Date(), descripcion: 'Sueldo', categoria: 'NOMINA', monto: 20, clase: '5' };
    const reporte = prepararInformePuc({
      periodo: {}, resultado: { ventasNetas: 100, costoVentas: 40, gastos: 25, otrosIngresos: 0, resultadoNeto: 35, completo: true },
      balance: { fecha: new Date(), efectivo: null, inventario: 50, cuentasPorCobrar: 10, cuentasPorPagar: 5, patrimonioRegistrado: null, completo: false },
      detallePuc: { ingresos: [], gastos: [fuente, { ...fuente, id: 11, monto: 5, categoria: 'OTROS' }], proveedores: 5 },
    }, cuentas, [{ origen: 'MOVIMIENTO', registroId: 10, codigo: '510506' }]);
    expect(reporte.resultadoCuentas.find(c => c.codigo === '5')?.monto).toBe(25);
    expect(reporte.resultadoCuentas.find(c => c.codigo === '51')?.monto).toBe(20);
    expect(reporte.resultadoCuentas.find(c => c.codigo === '510506')?.monto).toBe(20);
    expect(reporte.pendientes).toBe(1);
    expect(reporte.resultado.resultadoNeto).toBe(35);
  });
  it('un saldo desconocido mantiene el total del activo como desconocido', () => {
    expect(agruparCuentas([{ codigo: '11', nombre: 'Caja', monto: null }, { codigo: '14', nombre: 'Inventario', monto: 40 }], [
      { codigo: '1', nombre: 'Activo' }, { codigo: '11', nombre: 'Disponible' }, { codigo: '14', nombre: 'Inventario' },
    ])).toEqual([{ codigo: '1', nombre: 'Activo', monto: null }, { codigo: '11', nombre: 'Disponible', monto: null }, { codigo: '14', nombre: 'Inventario', monto: 40 }]);
  });
  it('los auxiliares conservan la jerarquía y rechaza códigos ambiguos', () => {
    expect(codigoSuperior('11100501')).toBe('111005');
    expect(codigoSuperior('11')).toBe('1');
    expect(codigoSuperior('1')).toBeNull();
    expect(validarCodigoPuc('11100501')).toBe(true);
    expect(validarCodigoPuc('111')).toBe(false);
    expect(validarCodigoPuc('X11005')).toBe(false);
  });
  it('no clasifica movimientos ajenos a la empresa del usuario', async () => {
    const tx = { $queryRaw: jest.fn(), movimientoFinanciero: { findFirst: jest.fn().mockResolvedValue(null) } };
    const prisma = { $transaction: (accion: (db: any) => unknown) => accion(tx) };
    await expect(new PlanCuentasService(prisma as any).asignar(2, 4, { origen: 'MOVIMIENTO', registroId: 10, codigo: '510506' })).rejects.toThrow('no encontrado');
    expect(tx.movimientoFinanciero.findFirst).toHaveBeenCalledWith({ where: { id: 10, empresaId: 2 } });
  });
});
