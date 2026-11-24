import { createHash, createHmac } from 'node:crypto';
import {
  abrirBold,
  cifrarBold,
  integridadBold,
  montoBold,
  validarFirmaBold,
} from './bold.reglas';
import { BoldService } from './bold.service';

describe('Cobros Bold del checkout web', () => {
  const root = process.env.BOLD_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.BOLD_ENCRYPTION_KEY = 'aa'.repeat(32);
  });
  afterAll(() => {
    if (root === undefined) delete process.env.BOLD_ENCRYPTION_KEY;
    else process.env.BOLD_ENCRYPTION_KEY = root;
  });
  const config = {
    habilitado: true,
    merchantId: 'COMERCIO',
    identidad: 'identidad-produccion-ficticia',
    secreto: 'secreto-produccion-ficticio',
    webhookRegistrado: true,
  };
  const a = { empresaId: 2, sucursalId: 5 };
  it('mantiene visible el catálogo de tiendas sin sucursal de pedidos configurada', async () => {
    const service = new BoldService({} as any);
    await expect(
      service.disponible({ empresaId: 2, sucursalId: 0 }),
    ).resolves.toBe(false);
  });
  function preparar() {
    const pagoId = '12345678-1234-1234-1234-123456789abc';
    const cfg = {
      id: 'cfg',
      ...a,
      tipo: 'CONFIG',
      datos: cifrarBold(config, '2:5:cfg'),
    };
    const pago = {
      id: pagoId,
      ...a,
      tipo: 'PAGO',
      clave: 'pedido-web',
      estado: 'PENDIENTE',
      datos: {
        configId: 'cfg',
        total: 12000,
        referencia: `PP-${pagoId}`,
        pedidoWebId: 'pedido-web',
        expires: String(BigInt(Date.now() + 600000) * 1000000n),
      },
    };
    const pedido = {
      id: 'pedido-web',
      ...a,
      clave: 'clave-privada',
      metodoPago: 'TARJETA',
      estado: 'RECIBIDO',
      total: 12000,
    };
    const rows: any[] = [cfg, pago];
    const find = ({ where }: any) =>
      rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ||
      null;
    const db: any = {
      boldRegistro: {
        findFirst: jest.fn(async (args) => find(args)),
        create: jest.fn(async ({ data }) => {
          rows.push(data);
          return data;
        }),
        update: jest.fn(async ({ where, data }) => {
          const r = find({ where });
          Object.assign(r, data);
          return r;
        }),
      },
      pedidoWeb: { findFirst: jest.fn(async () => pedido) },
      $queryRaw: jest.fn(async () => []),
      $transaction: jest.fn(async (fn) => fn(db)),
    };
    const service = new BoldService(db);
    function evento(
      type = 'SALE_APPROVED',
      overrides: any = {},
      eventId = 'evento-1',
    ) {
      const event = {
        id: eventId,
        type,
        data: {
          payment_id: 'TRANSACCION1',
          merchant_id: config.merchantId,
          amount: { total: 12000, currency: 'COP' },
          metadata: { reference: pago.datos.referencia },
          payment_method: 'CARD_WEB',
          ...overrides,
        },
      };
      const raw = Buffer.from(JSON.stringify(event));
      return {
        raw,
        signature: createHmac('sha256', config.secreto)
          .update(raw.toString('base64'))
          .digest('hex'),
      };
    }
    return { service, db, pago, cfg, rows, pedido, evento };
  }
  it('firma el monto del servidor y nunca entrega la llave secreta', async () => {
    const { service, pedido, pago } = preparar();
    const checkout = await service.intento(
      pedido,
      pedido.clave,
      'enchilamarketpereira',
    );
    expect(checkout.integridad).toBe(
      createHash('sha256')
        .update(`${pago.datos.referencia}12000COP${config.secreto}`)
        .digest('hex'),
    );
    expect(checkout.total).toBe(12000);
    expect(JSON.stringify(checkout)).not.toContain(config.secreto);
    expect(checkout.retorno).toBe(
      'https://enchilamarketpereira.powerpospioneers.com/?pedido=pedido-web',
    );
  });
  it('impide crear checkout usando solo el identificador público del pedido', async () => {
    const { service, pedido, db } = preparar();
    await expect(
      service.intento(pedido, 'otra-clave', 'tienda'),
    ).rejects.toThrow('Pago no encontrado');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each([999, 1000.01, NaN, Infinity, 100000000])(
    'rechaza totales incompatibles sin redondearlos: %s',
    (total) => {
      expect(() => montoBold(total)).toThrow();
    },
  );
  it('cifra las credenciales y las vincula a empresa, sede y versión', () => {
    const encrypted = cifrarBold(config, '2:5:cfg');
    expect(JSON.stringify(encrypted)).not.toContain(config.secreto);
    expect(abrirBold(encrypted, '2:5:cfg')).toEqual(config);
    expect(() => abrirBold(encrypted, '3:5:cfg')).toThrow();
  });
  it('verifica los bytes originales en base64 y no acepta firmas vacías de pruebas', () => {
    const raw = Buffer.from('{ "estado": "aprobado" }');
    const firma = createHmac('sha256', config.secreto)
      .update(raw.toString('base64'))
      .digest('hex');
    expect(() => validarFirmaBold(raw, firma, config.secreto)).not.toThrow();
    expect(() =>
      validarFirmaBold(
        Buffer.from('{"estado":"aprobado"}'),
        firma,
        config.secreto,
      ),
    ).toThrow();
    expect(() => validarFirmaBold(raw, firma, '')).toThrow();
  });
  it('una firma falsa no modifica la contabilidad ni el estado del pago', async () => {
    const { service, db, evento } = preparar();
    const e = evento();
    await expect(service.webhook(a, e.raw, '0'.repeat(64))).rejects.toThrow(
      'Firma de Bold inválida',
    );
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.boldRegistro.update).not.toHaveBeenCalled();
  });
  it.each([
    { merchant_id: 'OTRA' },
    { amount: { total: 11999, currency: 'COP' } },
    { amount: { total: 12000, currency: 'USD' } },
    { amount: { total: 12000, currency: 'COP', tip: 1000 } },
  ])(
    'rechaza confirmaciones que no corresponden al pedido %j',
    async (overrides) => {
      const { service, db, evento } = preparar();
      const e = evento('SALE_APPROVED', overrides);
      await expect(service.webhook(a, e.raw, e.signature)).rejects.toThrow(
        'no corresponde',
      );
      expect(db.boldRegistro.update).not.toHaveBeenCalled();
    },
  );
  it('no acredita el mismo evento dos veces ni crea ventas desde el webhook', async () => {
    const { service, db, pago, evento } = preparar();
    const e = evento();
    await service.webhook(a, e.raw, e.signature);
    await service.webhook(a, e.raw, e.signature);
    expect(pago.estado).toBe('APROBADO');
    expect(db.boldRegistro.update).toHaveBeenCalledTimes(1);
    expect(
      await service.verificarParaVenta(
        { id: 'pedido-web', ...a, total: 12000 },
        db,
      ),
    ).toMatchObject({ metodo: 'TARJETA' });
    expect(db.pedidoWeb.findFirst).not.toHaveBeenCalled();
  });
  it('impide aceptar pagos pendientes, aplicados o de otro importe', async () => {
    const { service, db, pago, pedido } = preparar();
    await expect(service.verificarParaVenta(pedido, db)).rejects.toThrow(
      'todavía no confirma',
    );
    pago.estado = 'APROBADO';
    Object.assign(pago.datos, {
      paymentId: 'TRANSACCION1',
      metodo: 'CARD_WEB',
    });
    await expect(
      service.verificarParaVenta({ ...pedido, total: 13000 }, db),
    ).rejects.toThrow();
    await service.aplicar(pago, 42, db);
    expect(pago.estado).toBe('APLICADO');
    await expect(service.verificarParaVenta(pedido, db)).rejects.toThrow();
  });
  it('una respuesta de rechazo tardía no deshace una aprobación', async () => {
    const { service, pago, evento } = preparar();
    for (const e of [evento(), evento('SALE_REJECTED', {}, 'evento-2')])
      await service.webhook(a, e.raw, e.signature);
    expect(pago.estado).toBe('APROBADO');
  });
  it('una anulación posterior a la venta se conserva para revisión, sin reversar inventario', async () => {
    const { service, pago, evento } = preparar();
    pago.estado = 'APLICADO';
    Object.assign(pago.datos, { paymentId: 'TRANSACCION1', pedidoId: 42 });
    const e = evento('VOID_APPROVED');
    await service.webhook(a, e.raw, e.signature);
    expect(pago.estado).toBe('REVISION');
    expect((pago.datos as any).pedidoId).toBe(42);
  });
  it('un segundo cobro distinto genera revisión y no otra venta', async () => {
    const { service, pago, evento } = preparar();
    for (const e of [
      evento(),
      evento('SALE_APPROVED', { payment_id: 'TRANSACCION2' }, 'evento-2'),
    ])
      await service.webhook(a, e.raw, e.signature);
    expect(pago.estado).toBe('REVISION');
  });
  it('no permite rechazar silenciosamente un pedido cuyo cobro está en curso', async () => {
    const { service, pedido, db } = preparar();
    await expect(service.validarRechazo(pedido, db)).rejects.toThrow(
      'Revisa o anula',
    );
  });
  it('otra empresa no puede obtener la configuración ni acreditar el cobro', async () => {
    const { service, evento, pago } = preparar();
    const e = evento();
    await expect(
      service.webhook({ empresaId: 3, sucursalId: 5 }, e.raw, e.signature),
    ).rejects.toThrow('no configurada');
    expect(pago.estado).toBe('PENDIENTE');
  });
});
