import { PlanesService } from './planes.service';
import { estadoCobro, sumarMeses } from './fechas';

describe('Pagos manuales de suscripción', () => {
  const clave = '11111111-1111-4111-8111-111111111111';
  let empresa: any, pagos: any[], tx: any, service: PlanesService;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-31T15:00:00Z'));
    empresa = { id: 2, plan: 'PREMIUM', pagoExonerado: false, suscripcionVenceEn: new Date('2026-01-01T15:00:00Z') };
    pagos = [];
    tx = {
      empresa: { findUnique: jest.fn(async () => ({ ...empresa })), updateMany: jest.fn(async ({ data }: any) => { Object.assign(empresa, data); return { count: 1 }; }) },
      pagoPlan: {
        findUnique: jest.fn(async ({ where }: any) => pagos.find((p) => p.referencia === where.referencia) || null),
        create: jest.fn(async ({ data }: any) => { const p = { id: pagos.length + 1, ...data }; pagos.push(p); return p; }),
        updateMany: jest.fn(async ({ where, data }: any) => { const p = pagos.find((p) => p.id === where.id && p.estado === where.estado); if (!p) return { count: 0 }; Object.assign(p, data); return { count: 1 }; }),
      }, auditoria: { create: jest.fn(async () => ({})) },
    };
    service = new PlanesService({ ...tx, $transaction: (f: any) => f(tx) } as any);
    jest.spyOn(service, 'obtenerPrecios').mockResolvedValue({ soporteMensual: 0, descuentoAnualMeses: 1, planes: [{ plan: 'PREMIUM', nombre: 'Premium', mensual: 89900, anual: 988900 }] });
  });
  afterEach(() => jest.useRealTimers());
  it('un pago recibido renueva un mes sin pedir fecha y ajusta el último día del mes', async () => {
    const pago = await service.registrarPagoManual(2, { clave, periodicidad: 'MENSUAL', estado: 'APROBADO' }, 1);
    expect(pago.monto).toBe(89900);
    expect(empresa.suscripcionVenceEn.toISOString()).toBe('2026-02-28T15:00:00.000Z');
    expect(estadoCobro(empresa)).toBe('AL_DIA');
    expect(tx.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ usuarioId: 1, accion: 'PAGAR' }) }));
  });
  it('un pendiente no cambia el vencimiento ni acredita dinero recibido', async () => {
    const previo = empresa.suscripcionVenceEn;
    const pago = await service.registrarPagoManual(2, { clave, periodicidad: 'MENSUAL', estado: 'PENDIENTE' }, 1);
    expect(pago.pagadoEn).toBeNull();
    expect(empresa.suscripcionVenceEn).toBe(previo);
    expect(tx.empresa.updateMany).not.toHaveBeenCalled();
  });
  it('confirmar un pendiente renueva desde la fecha de confirmación una sola vez', async () => {
    const p = await service.registrarPagoManual(2, { clave, periodicidad: 'ANUAL', estado: 'PENDIENTE' }, 1);
    jest.setSystemTime(new Date('2026-02-03T15:00:00Z'));
    await service.confirmarPagoManual(2, p.referencia, 1);
    await service.confirmarPagoManual(2, p.referencia, 1);
    expect(empresa.suscripcionVenceEn.toISOString()).toBe('2027-02-03T15:00:00.000Z');
    expect(tx.empresa.updateMany).toHaveBeenCalledTimes(1);
  });
  it('reintentar la misma referencia no agrega otro mes', async () => {
    const datos = { clave, periodicidad: 'MENSUAL' as const, estado: 'APROBADO' as const };
    await service.registrarPagoManual(2, datos, 1);
    await service.registrarPagoManual(2, datos, 1);
    expect(pagos).toHaveLength(1);
    expect(tx.empresa.updateMany).toHaveBeenCalledTimes(1);
  });
  it('no acepta otro cobro del mismo período cuando está al día', async () => {
    empresa.suscripcionVenceEn = sumarMeses(new Date(), 1);
    await expect(service.registrarPagoManual(2, { clave, periodicidad: 'MENSUAL', estado: 'APROBADO' }, 1)).rejects.toThrow('al día');
    expect(tx.pagoPlan.create).not.toHaveBeenCalled();
  });
  it('no permite confirmar pagos de otra empresa ni referencias Wompi', async () => {
    const p = await service.registrarPagoManual(2, { clave, periodicidad: 'MENSUAL', estado: 'PENDIENTE' }, 1);
    await expect(service.confirmarPagoManual(3, p.referencia, 1)).rejects.toThrow('no encontrado');
    await expect(service.confirmarPagoManual(2, 'PP-2-wompi', 1)).rejects.toThrow('no válida');
  });
  it('si otro proceso renovó el período no sobrescribe la fecha', async () => {
    tx.empresa.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.registrarPagoManual(2, { clave, periodicidad: 'MENSUAL', estado: 'APROBADO' }, 1)).rejects.toThrow('cambió');
  });
  it('al vencer pasa de al día a pendiente aunque conserve los cinco días de gracia', () => {
    expect(estadoCobro(empresa, empresa.suscripcionVenceEn.getTime() - 1)).toBe('AL_DIA');
    expect(estadoCobro(empresa, empresa.suscripcionVenceEn.getTime())).toBe('PENDIENTE');
    expect(estadoCobro({ pagoExonerado: true })).toBe('EXONERADO');
    expect(estadoCobro({ suscripcionVenceEn: null })).toBe('SIN_CONFIGURAR');
  });
  it('no crea un cobro Wompi del plan si el mes ya está cubierto', async () => {
    empresa.suscripcionVenceEn = sumarMeses(new Date(), 1);
    (service as any).configuracion = async () => ({ inicialMensual: 29900, mediumMensual: 49900, premiumMensual: 89900, soporteMensual: 19900, descuentoAnualMeses: 1 });
    const publicKey = process.env.WOMPI_PUBLIC_KEY, secret = process.env.WOMPI_INTEGRITY_SECRET;
    process.env.WOMPI_PUBLIC_KEY = 'pub_test_no_real'; process.env.WOMPI_INTEGRITY_SECRET = 'test_no_real';
    try {
      await expect(service.crearCheckout(2, 'prueba@example.com', 'MENSUAL', false)).rejects.toThrow('No tienes pagos pendientes');
      expect(tx.pagoPlan.create).not.toHaveBeenCalled();
      const soporte = await service.crearCheckout(2, 'prueba@example.com', 'MENSUAL', true);
      expect(soporte.monto).toBe(19900);
      expect(pagos[0].incluyePlan).toBe(false);
    } finally {
      if (publicKey === undefined) delete process.env.WOMPI_PUBLIC_KEY; else process.env.WOMPI_PUBLIC_KEY = publicKey;
      if (secret === undefined) delete process.env.WOMPI_INTEGRITY_SECRET; else process.env.WOMPI_INTEGRITY_SECRET = secret;
    }
  });
});
