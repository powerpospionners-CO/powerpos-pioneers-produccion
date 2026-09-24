import { CajaService } from './caja.service';

function escenario() {
  const caja = {
    id: 1,
    sucursalId: 2,
    usuarioId: 3,
    estado: 'ABIERTA',
    montoInicial: 100,
    sucursal: { empresaId: 4, nombre: 'Principal' },
    usuario: { nombre: 'Cajero' },
    pedidos: [
      { estado: 'ENTREGADO', metodoPago: 'EFECTIVO', total: 200 },
      { estado: 'ENTREGADO', metodoPago: 'TARJETA', total: 500 },
      { estado: 'ENTREGADO', metodoPago: 'NEQUI', total: 300 },
      { estado: 'ANULADO', metodoPago: 'EFECTIVO', total: 700 },
    ],
  };
  const db: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    sucursal: { findFirst: jest.fn().mockResolvedValue(caja.sucursal) },
    usuario: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
    caja: {
      findUnique: jest.fn().mockResolvedValue(caja),
      findFirst: jest.fn().mockResolvedValue(caja),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ ...caja, ...data })),
    },
    eventoCaja: { create: jest.fn().mockResolvedValue({}) },
  };
  db.$transaction = jest.fn(async (fn) => fn(db));
  const notificaciones = { enviarAlerta: jest.fn().mockResolvedValue({}) };
  return {
    caja,
    db,
    notificaciones,
    service: new CajaService(db, notificaciones as any),
  };
}

describe('Conciliación de caja', () => {
  it('cuenta solo efectivo, conserva el total comercial y excluye anulaciones', async () => {
    const { service } = escenario();
    const resultado = await service.cerrarCaja(
      1,
      { montoFinal: 300 },
      3,
      false,
      4,
    );
    expect(resultado).toMatchObject({
      totalVentas: 1000,
      montoEsperado: 300,
      diferencia: 0,
    });
    expect(await service.obtenerCajaAbierta(2, 4)).toMatchObject({
      totalEsperado: 300,
    });
  });
  it('rechaza un conteo inválido sin cerrar ni registrar eventos', async () => {
    const { service, db } = escenario();
    await expect(
      service.cerrarCaja(1, { montoFinal: 'no es dinero' }, 3, false, 4),
    ).rejects.toThrow('inválido');
    expect(db.caja.update).not.toHaveBeenCalled();
    expect(db.eventoCaja.create).not.toHaveBeenCalled();
  });
  it('no permite cerrar cajas de otra empresa', async () => {
    const { service, db } = escenario();
    await expect(service.cerrarCaja(1, {}, 3, false, 9)).rejects.toThrow(
      'no encontrada',
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rechaza una segunda apertura después de adquirir el bloqueo', async () => {
    const { service, db } = escenario();
    await expect(service.abrirCaja({}, 3, 2, 4)).rejects.toThrow('Ya existe');
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(db.caja.create).not.toHaveBeenCalled();
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.caja.findFirst.mock.invocationCallOrder[0],
    );
  });
  it('no cierra automáticamente sin configuración explícita', async () => {
    const previo = process.env.CIERRES_CAJA_POR_EMPRESA;
    delete process.env.CIERRES_CAJA_POR_EMPRESA;
    try {
      const { service, db } = escenario();
      await service.cerrarCajaAutomaticaPorHorario();
      expect(db.caja.findMany).not.toHaveBeenCalled();
    } finally {
      if (previo !== undefined) process.env.CIERRES_CAJA_POR_EMPRESA = previo;
    }
  });
  it('respeta Bogotá y no cierra una caja abierta después del horario de corte', async () => {
    const previo = process.env.CIERRES_CAJA_POR_EMPRESA;
    process.env.CIERRES_CAJA_POR_EMPRESA = JSON.stringify({
      4: { hora: '22:00', zonaHoraria: 'America/Bogota' },
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T03:05:00Z'));
    try {
      const { service, db, caja } = escenario();
      db.caja.findMany.mockResolvedValue([
        {
          ...caja,
          abiertaEn: new Date('2026-09-24T20:00:00Z'),
          sucursal: {
            ...caja.sucursal,
            empresa: { tipoNegocio: 'RESTAURANTE' },
          },
        },
        {
          ...caja,
          id: 2,
          abiertaEn: new Date('2026-09-25T03:01:00Z'),
          sucursal: {
            ...caja.sucursal,
            empresa: { tipoNegocio: 'RESTAURANTE' },
          },
        },
      ]);
      const cerrar = jest
        .spyOn(service, 'cerrarCaja')
        .mockResolvedValue({} as any);
      await service.cerrarCajaAutomaticaPorHorario();
      expect(cerrar).toHaveBeenCalledTimes(1);
      expect(cerrar).toHaveBeenCalledWith(1, {}, 3, true, 4);
    } finally {
      jest.useRealTimers();
      if (previo === undefined) delete process.env.CIERRES_CAJA_POR_EMPRESA;
      else process.env.CIERRES_CAJA_POR_EMPRESA = previo;
    }
  });
});
