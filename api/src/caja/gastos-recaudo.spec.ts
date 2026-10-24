import { CajaService } from './caja.service';
import { disponibleRecaudo, idsGastosRecaudo, validarMarcaRecaudo, SNAPSHOT_RECAUDO } from './gastos-recaudo';

describe('Gastos pagados del recaudo', () => {
  it('calcula dinero disponible y muestra el faltante sin consignaciones negativas', () => {
    expect(disponibleRecaudo(780, 230)).toEqual({ saldoDespuesGastos: 550, disponibleConsignar: 550, faltanteParaGastos: 0 });
    expect(disponibleRecaudo(100, 150)).toEqual({ saldoDespuesGastos: -50, disponibleConsignar: 0, faltanteParaGastos: 50 });
    expect(disponibleRecaudo(0.3, 0.1).disponibleConsignar).toBe(0.2);
  });
  it('solo usa la última marca explícita y consulta la empresa correcta', async () => {
    const db: any = { auditoria: { findMany: jest.fn().mockResolvedValue([
      { entidadId: 1, detalle: { pagadoConRecaudo: true } }, { entidadId: 1, detalle: { pagadoConRecaudo: false } }, { entidadId: 2, detalle: { pagadoConRecaudo: true } },
    ]) } };
    expect([...await idsGastosRecaudo(db, 2)]).toEqual([2]);
    expect(db.auditoria.findMany.mock.calls[0][0].where.empresaId).toBe(2);
    expect(() => validarMarcaRecaudo(true, 'INGRESO', 'VENTA')).toThrow();
    expect(() => validarMarcaRecaudo(true, 'EGRESO', 'COSTO_VENTA')).toThrow();
    expect(() => validarMarcaRecaudo(true, 'EGRESO', 'OTROS', 9)).toThrow();
    expect(() => validarMarcaRecaudo('true', 'EGRESO', 'NOMINA')).toThrow();
  });
  it('descuenta una vez, según fecha, sucursal y empresa, y conserva la diferencia de retiros', async () => {
    const db: any = {
      sucursal: { findFirst: jest.fn().mockResolvedValue({ nombre: 'Principal', baseEfectivoCaja: 100, empresa: { recaudoEfectivoHabilitado: true } }) },
      retiroEfectivoCaja: { findMany: jest.fn().mockResolvedValue([{ id: 1, cajaId: 1, montoEsperado: 800, montoRetirado: 780, creadoEn: new Date('2026-10-06T12:00:00Z'), usuario: { nombre: 'Admin' }, caja: { cerradaEn: new Date(), usuario: { nombre: 'Cajero' } } }]) },
      consignacionEfectivo: { findUnique: jest.fn().mockResolvedValue(null) },
      auditoria: { findMany: jest.fn().mockResolvedValue([{ entidadId: 5, detalle: { pagadoConRecaudo: true } }]) },
      movimientoFinanciero: { findMany: jest.fn().mockResolvedValue([{ id: 5, descripcion: 'Gasto de la semana', categoria: 'OTROS', monto: 230, fecha: new Date(), usuario: { nombre: 'Admin' } }]) },
    };
    const resumen = await new CajaService(db, {} as any, {} as any).obtenerRecaudoSemanal('2026-10-05', 2, 4);
    expect(resumen).toMatchObject({ efectivoRecaudado: 780, gastosDelRecaudo: 230, disponibleConsignar: 550, diferenciaRecaudo: -20 });
    expect(db.movimientoFinanciero.findMany.mock.calls[0][0].where).toEqual({ empresaId: 4, sucursalId: 2, id: { in: [5] }, tipo: 'EGRESO', categoria: { notIn: ['COSTO_VENTA','VENTA'] }, pedidoId: null, fecha: { gte: new Date('2026-10-05T05:00:00Z'), lt: new Date('2026-10-12T05:00:00Z') } });
  });
  it('guarda el bruto y una copia del neto al consignar, sin crear otro egreso', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13T15:00:00Z'));
    try {
      const db: any = { consignacionEfectivo: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 12, ...data })) }, auditoria: { create: jest.fn().mockResolvedValue({}) } };
      db.$transaction = jest.fn(fn => fn(db));
      const service = new CajaService(db, {} as any, {} as any);
      jest.spyOn(service as any, 'obtenerResumenRecaudoSemana').mockResolvedValue({ periodoInicio: '2026-10-05', periodoFin: '2026-10-11', semanaCompleta: true, ventasEfectivo: 800, efectivoRecaudado: 780, gastosDelRecaudo: 230, disponibleConsignar: 550, gastos: [{ id: 5, monto: 230 }] });
      const resultado = await service.registrarConsignacionEfectivo({ periodoInicio: '2026-10-05', montoConsignado: 550, fechaConsignacion: '2026-10-12' }, 2, 4, 3);
      expect(resultado.diferencia).toBe(0);
      expect(db.consignacionEfectivo.create.mock.calls[0][0].data.efectivoRecaudado).toBe(780);
      expect(db.auditoria.create.mock.calls[0][0].data).toMatchObject({ empresaId: 4, entidad: SNAPSHOT_RECAUDO, entidadId: 12, detalle: { gastosDelRecaudo: 230, disponibleConsignar: 550 } });
    } finally { jest.useRealTimers(); }
  });
});
