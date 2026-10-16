import { Prisma } from '@prisma/client';
import {
  GastosRecurrentesService,
  vencimientoMensual,
} from './gastos-recurrentes.service';

const actor = { empresaId: 7, id: 4, sucursalId: 2 };
function escenario() {
  const gasto = {
    id: 8,
    empresaId: 7,
    sucursalId: 2,
    nombre: 'Arriendo',
    tercero: 'Arrendador',
    categoria: 'ARRIENDO',
    monto: new Prisma.Decimal('1200000'),
    diaVencimiento: 31,
    activo: true,
  };
  const db: any = {
    $executeRaw: jest.fn(),
    gastoRecurrente: {
      findFirst: jest.fn().mockResolvedValue(gasto),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(gasto),
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({
          ...gasto,
          ...Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          ),
        })),
    },
    cuentaAdministrativa: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ id: 99, documento: 'REC-8-2026-02' }),
    },
    sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
    auditoria: { create: jest.fn() },
    movimientoFinanciero: { create: jest.fn() },
  };
  db.$transaction = jest.fn((fn) => fn(db));
  return { db, gasto, service: new GastosRecurrentesService(db) };
}

describe('Gastos recurrentes mensuales', () => {
  it('ajusta día 31 a febrero y contempla años bisiestos', () => {
    expect(vencimientoMensual('2026-02', 31).toISOString()).toBe(
      '2026-02-28T05:00:00.000Z',
    );
    expect(vencimientoMensual('2028-02', 31).toISOString()).toBe(
      '2028-02-29T05:00:00.000Z',
    );
    expect(vencimientoMensual('2026-04', 31).toISOString()).toBe(
      '2026-04-30T05:00:00.000Z',
    );
  });
  it.each([0, 32, 1.5, NaN])('rechaza día inválido %s', (dia) =>
    expect(() => vencimientoMensual('2026-02', dia)).toThrow(),
  );
  it('rechaza un mes inexistente', () =>
    expect(() => vencimientoMensual('2026-13', 1)).toThrow());
  it('genera una obligación con el valor actual sin registrar un pago', async () => {
    const { db, service } = escenario();
    expect((await service.generar(8, '2026-02', actor)).creada).toBe(true);
    expect(db.cuentaAdministrativa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        empresaId: 7,
        monto: new Prisma.Decimal('1200000'),
        saldo: new Prisma.Decimal('1200000'),
        categoria: 'ARRIENDO',
        gastoRecurrenteId: 8,
        periodoRecurrente: '2026-02',
      }),
    });
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
  });
  it('repetir el mes devuelve la obligación existente incluso si la plantilla cambió', async () => {
    const { db, gasto, service } = escenario();
    gasto.monto = new Prisma.Decimal('1500000');
    const existente = { id: 99, monto: new Prisma.Decimal('1200000') };
    db.cuentaAdministrativa.findUnique.mockResolvedValue(existente);
    expect(await service.generar(8, '2026-02', actor)).toEqual({
      cuenta: existente,
      creada: false,
    });
    expect(db.cuentaAdministrativa.create).not.toHaveBeenCalled();
  });
  it('bloquea plantillas de otra empresa antes de buscar obligaciones', async () => {
    const { db, service } = escenario();
    db.gastoRecurrente.findFirst.mockResolvedValue(null);
    await expect(service.generar(8, '2026-02', actor)).rejects.toThrow(
      'no encontrada',
    );
    expect(db.gastoRecurrente.findFirst).toHaveBeenCalledWith({
      where: { id: 8, empresaId: 7 },
    });
    expect(db.cuentaAdministrativa.findUnique).not.toHaveBeenCalled();
  });
  it('no genera meses nuevos desde plantillas inactivas', async () => {
    const { gasto, service, db } = escenario();
    gasto.activo = false;
    await expect(service.generar(8, '2026-02', actor)).rejects.toThrow(
      'inactiva',
    );
    expect(db.cuentaAdministrativa.create).not.toHaveBeenCalled();
  });
  it('editar el valor no modifica las cuentas ya generadas', async () => {
    const { db, service } = escenario();
    await service.editar(8, { monto: 1500000 }, actor);
    expect(db.gastoRecurrente.update).toHaveBeenCalled();
    expect(db.cuentaAdministrativa.create).not.toHaveBeenCalled();
    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detalle: expect.objectContaining({
          anterior: expect.objectContaining({ monto: '1200000' }),
          nuevo: expect.objectContaining({ monto: '1500000' }),
        }),
      }),
    });
  });
  it('si falla la auditoría, no confirma la transacción', async () => {
    const { db, service } = escenario();
    db.auditoria.create.mockRejectedValue(new Error('auditoría falló'));
    await expect(service.generar(8, '2026-02', actor)).rejects.toThrow(
      'auditoría falló',
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
