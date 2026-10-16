import { Prisma } from '@prisma/client';
import {
  AdministracionService,
  dinero,
  fechaDia,
} from './administracion.service';
import { AdministracionGuard } from './administracion.guard';

const actor = { empresaId: 7, id: 4, sucursalId: 2 };
function escenario() {
  const cuenta = {
    id: 3,
    empresaId: 7,
    sucursalId: 2,
    tipo: 'PAGAR',
    categoria: 'OTROS',
    documento: '900-FACT1',
    saldo: new Prisma.Decimal(100),
    anulada: false,
  };
  const db: any = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    cuentaAdministrativa: {
      findFirst: jest.fn().mockResolvedValue(cuenta),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 3 }),
      update: jest.fn(),
    },
    abonoAdministrativo: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 8 }),
    },
    movimientoFinanciero: {
      create: jest.fn().mockResolvedValue({ id: 9 }),
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 9,
          categoria: 'OTROS',
          monto: new Prisma.Decimal(100),
        }),
    },
    conciliacionAdministrativa: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 5 }),
    },
    sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
    saldoInicialCuenta: {
      findUnique: jest.fn().mockResolvedValue({ desde: new Date(0) }),
    },
    auditoria: { create: jest.fn() },
  };
  db.$transaction = jest.fn((fn) => fn(db));
  return { db, cuenta, service: new AdministracionService(db) };
}

describe('Controles administrativos', () => {
  it.each([0, -1, 1.001, '1e3', true, '', '100000000'])(
    'rechaza un monto inválido %s',
    (valor) => expect(() => dinero(valor)).toThrow(),
  );
  it('rechaza fechas inexistentes y conserva el día de Colombia', () => {
    expect(() => fechaDia('2026-02-30')).toThrow();
    expect(fechaDia('2026-10-15').toISOString()).toBe(
      '2026-10-15T05:00:00.000Z',
    );
  });
  it('no permite abonar cuentas de otra empresa', async () => {
    const { db, service } = escenario();
    db.cuentaAdministrativa.findFirst.mockResolvedValue(null);
    await expect(
      service.abonar(
        3,
        { monto: 20, referencia: 'Banco1', clave: 'abc' },
        actor,
      ),
    ).rejects.toThrow('Cuenta no encontrada');
    expect(db.cuentaAdministrativa.findFirst).toHaveBeenCalledWith({
      where: { id: 3, empresaId: 7 },
    });
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
  });
  it('rechaza sobrepagos antes de registrar dinero', async () => {
    const { db, service } = escenario();
    await expect(
      service.abonar(
        3,
        { monto: 101, referencia: 'Banco1', clave: 'abc' },
        actor,
      ),
    ).rejects.toThrow('supera el saldo');
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
  });
  it('registra abono, dinero y auditoría en la misma transacción', async () => {
    const { db, service } = escenario();
    await service.abonar(
      3,
      { monto: 20.15, referencia: 'Banco1', clave: 'abc' },
      actor,
    );
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.movimientoFinanciero.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        empresaId: 7,
        tipo: 'EGRESO',
        monto: new Prisma.Decimal('20.15'),
      }),
    });
    expect(db.cuentaAdministrativa.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { saldo: { decrement: new Prisma.Decimal('20.15') } },
    });
    expect(db.auditoria.create).toHaveBeenCalled();
  });
  it('repetir un abono devuelve el mismo sin descontar dos veces', async () => {
    const { db, service } = escenario();
    const abono = {
      id: 8,
      cuentaId: 3,
      cuenta: { empresaId: 7 },
      monto: new Prisma.Decimal(20),
      referencia: 'Banco1',
    };
    db.abonoAdministrativo.findUnique.mockResolvedValue(abono);
    expect(
      await service.abonar(
        3,
        { monto: 20, referencia: 'Banco1', clave: 'abc' },
        actor,
      ),
    ).toBe(abono);
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
  });
  it('una clave ajena no revela el abono', async () => {
    const { db, service } = escenario();
    db.abonoAdministrativo.findUnique.mockResolvedValue({
      cuenta: { empresaId: 8 },
      cuentaId: 3,
      monto: new Prisma.Decimal(20),
      referencia: 'Banco1',
    });
    await expect(
      service.abonar(
        3,
        { monto: 20, referencia: 'Banco1', clave: 'abc' },
        actor,
      ),
    ).rejects.toThrow('ya está en uso');
    expect(db.cuentaAdministrativa.update).not.toHaveBeenCalled();
  });
  it('crear una obligación no modifica dinero ni inventario', async () => {
    const { db, service } = escenario();
    await service.crearCuenta(
      {
        tipo: 'COBRAR',
        tercero: 'Cliente',
        documento: 'CC1-F1',
        descripcion: 'Saldo inicial pendiente',
        monto: 50,
        vencimiento: '2026-11-01',
      },
      actor,
    );
    expect(db.movimientoFinanciero.create).not.toHaveBeenCalled();
    expect(db.cuentaAdministrativa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        empresaId: 7,
        sucursalId: 2,
        tipo: 'COBRAR',
        saldo: new Prisma.Decimal(50),
      }),
    });
  });
  it('no anula una obligación vinculada a mercancía recibida', async () => {
    const { db, cuenta, service } = escenario();
    db.cuentaAdministrativa.findFirst.mockResolvedValue({
      ...cuenta,
      compraGastoId: 42,
      abonos: [],
    });
    await expect(service.anularCuenta(3, 'Error', actor)).rejects.toThrow(
      'requieren conciliación',
    );
    expect(db.cuentaAdministrativa.update).not.toHaveBeenCalled();
  });
  it('conciliar exige pertenencia y bloquea el movimiento contra ediciones simultáneas', async () => {
    const { db, service } = escenario();
    db.movimientoFinanciero.findFirst.mockResolvedValue(null);
    await expect(
      service.conciliar(
        9,
        { referencia: 'Banco1', fechaBanco: '2026-01-01' },
        actor,
      ),
    ).rejects.toThrow('no encontrado');
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.conciliacionAdministrativa.create).not.toHaveBeenCalled();
  });
  it('falla de auditoría impide completar la operación', async () => {
    const { db, service } = escenario();
    db.auditoria.create.mockRejectedValue(new Error('auditoría no disponible'));
    await expect(
      service.abonar(
        3,
        { monto: 20, referencia: 'Banco1', clave: 'abc' },
        actor,
      ),
    ).rejects.toThrow('auditoría no disponible');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('Activación administrativa', () => {
  const original = process.env.ADMINISTRACION_HABILITADA;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMINISTRACION_HABILITADA;
    else process.env.ADMINISTRACION_HABILITADA = original;
  });
  const contexto = (permisos: unknown) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: { empresaId: 7, permisos } }),
      }),
    }) as any;
  it('permanece apagada por defecto aunque la empresa tenga permiso', () => {
    delete process.env.ADMINISTRACION_HABILITADA;
    expect(() =>
      new AdministracionGuard().canActivate(contexto({ administracion: true })),
    ).toThrow();
  });
  it('requiere activación explícita de la empresa y del servidor', () => {
    process.env.ADMINISTRACION_HABILITADA = 'true';
    expect(() => new AdministracionGuard().canActivate(contexto({}))).toThrow();
    expect(
      new AdministracionGuard().canActivate(contexto({ administracion: true })),
    ).toBe(true);
  });
});
