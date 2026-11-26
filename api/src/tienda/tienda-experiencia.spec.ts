import { adicionalesDeProducto, validarEntrega, validarLineas } from './tienda-opciones.reglas';
import { firmaMesa, mesaValida, TiendaRegistros } from './tienda-registros';
import { TiendaService } from './tienda.service';
import { TiendaExtrasService } from './tienda-extras.service';
import { TiendaExperienciaService } from './tienda-experiencia.service';
import { tiendaConfig } from './reglas';

process.env.PERSONAL_ENCRYPTION_KEY = 'c'.repeat(64);

const horarios = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abierto: true, apertura: '10:00', cierre: '22:00' }));
const base = { recogerHabilitado: true, programarHabilitado: true, mesasHabilitadas: true, mesasCantidad: 5, horarios };
const ahora = { fecha: '2026-11-25', minutos: 12 * 60 };

describe('Reglas de entrega y opciones', () => {
  it('valida mesas con su firma y rechaza mesas inventadas', () => {
    const ok = (n: number, t: unknown) => mesaValida(7, n, t);
    expect(validarEntrega({ entrega: 'MESA', mesa: { numero: 3, token: firmaMesa(7, 3) } }, base, ahora, ok)).toEqual({ tipo: 'MESA', mesa: 3, programado: null });
    expect(() => validarEntrega({ entrega: 'MESA', mesa: { numero: 3, token: firmaMesa(8, 3) } }, base, ahora, ok)).toThrow('QR');
    expect(() => validarEntrega({ entrega: 'MESA', mesa: { numero: 9, token: firmaMesa(7, 9) } }, base, ahora, ok)).toThrow('QR');
  });
  it('programa pedidos dentro del horario con anticipación', () => {
    expect(validarEntrega({ entrega: 'RECOGER', programadoPara: '2026-11-25T13:00' }, base, ahora, () => false)).toMatchObject({ tipo: 'RECOGER', programado: { fecha: '2026-11-25', hora: '13:00' } });
    expect(() => validarEntrega({ programadoPara: '2026-11-25T12:20' }, base, ahora, () => false)).toThrow('45 minutos');
    expect(() => validarEntrega({ programadoPara: '2026-11-26T23:00' }, base, ahora, () => false)).toThrow('horario');
    expect(() => validarEntrega({ programadoPara: '2026-12-09T13:00' }, base, ahora, () => false)).toThrow('7 días');
    expect(() => validarEntrega({ entrega: 'RECOGER' }, { ...base, recogerHabilitado: false }, ahora, () => false)).toThrow('recoger');
  });
  it('acepta el mismo producto con opciones distintas pero no líneas idénticas', () => {
    expect(validarLineas([{ productoId: 1, cantidad: 1 }, { productoId: 1, cantidad: 1, adicionales: [{ adicionalId: 4, cantidad: 1 }] }])).toHaveLength(2);
    expect(() => validarLineas([{ productoId: 1, cantidad: 1 }, { productoId: 1, cantidad: 2 }])).toThrow('Carrito');
    expect(() => validarLineas([{ productoId: 1, cantidad: 1, adicionales: [{ adicionalId: 4, cantidad: 1 }, { adicionalId: 4, cantidad: 2 }] }])).toThrow('Adicionales');
  });
  it('ofrece los adicionales con las mismas reglas que la caja y nunca empaques', () => {
    const globales = [{ id: 1, nombre: 'Queso', precio: 2000, activo: true, disponible: true }, { id: 2, nombre: 'Caja', precio: 500, activo: true, disponible: true, empaqueParaLlevar: true }];
    const hamburguesa = { nombre: 'Hamburguesa', categoria: { nombre: 'Comidas' }, adicionales: [], aceptaAdicionales: true };
    expect(adicionalesDeProducto(hamburguesa, globales, 1, true).map((a) => a.id)).toEqual([1]);
    expect(adicionalesDeProducto({ ...hamburguesa, nombre: 'Gaseosa', categoria: { nombre: 'Bebidas' } }, globales, 1, true)).toEqual([]);
    expect(adicionalesDeProducto(hamburguesa, globales, 9, false)).toEqual([]);
    expect(adicionalesDeProducto({ ...hamburguesa, adicionales: [{ adicional: { id: 5, nombre: 'Tocineta', precio: 3000, activo: true, disponible: true } }] }, globales, 9, true).map((a) => a.id)).toEqual([5]);
  });
});

function tienda(config: any = {}, tipoNegocio = 'RESTAURANTE') {
  const creados: any[] = [];
  const prisma: any = {
    empresa: { findUnique: jest.fn().mockResolvedValue({ id: 7, nombre: 'Trailer', activo: true, tipoNegocio, fidelizacionConfig: {}, tiendaConfig: { publicada: true, pedidosHabilitados: true, sucursalId: 2, zonas: [{ id: 'z1', nombre: 'Centro', costo: 4000 }], minimo: 30000, recogerHabilitado: true, mesasHabilitadas: true, mesasCantidad: 5, ...config } }) },
    pedidoWeb: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), create: jest.fn(({ data }) => { const p = { id: 'w1', estado: 'RECIBIDO', ...data }; creados.push(p); return p; }) },
    sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
    producto: { findMany: jest.fn().mockResolvedValue([{ id: 10, nombre: 'Hamburguesa', precio: 15000, stockActual: 20, aceptaAdicionales: true, categoria: { nombre: 'Comidas' }, presentaciones: [{ id: 3, nombre: 'Doble', precio: 22000, factorUnidades: 1 }], adicionales: [] }]) },
    adicional: { findMany: jest.fn().mockResolvedValue([{ id: 1, nombre: 'Queso', precio: 2000, activo: true, disponible: true, empaqueParaLlevar: false }]) },
  };
  const s = new TiendaService(prisma, {} as any, { disponible: async () => false } as any);
  return { s, prisma, creados };
}
const pedido = (x: any) => ({ clave: 'k'.repeat(24), nombre: 'Ana', telefono: '3106843264', metodoPago: 'EFECTIVO', ...x });

describe('Pedido web con opciones y entregas', () => {
  it('cobra presentación y adicionales y los conserva para la venta en caja', async () => {
    const { s, creados } = tienda();
    const r: any = await s.solicitar('trailer', pedido({ entrega: 'RECOGER', totalEsperado: 48000, items: [{ productoId: 10, cantidad: 2, presentacionId: 3, adicionales: [{ adicionalId: 1, cantidad: 1 }], observacion: 'Sin cebolla' }] }));
    expect(r.subtotal).toBe(48000);
    expect(creados[0]).toMatchObject({ zona: 'Recoger en tienda', costoDomicilio: 0, observacion: '[RECOGER EN TIENDA]' });
    expect(creados[0].items[0]).toMatchObject({ precio: 22000, precioUnitario: 24000, presentacionId: 3, adicionales: [{ adicionalId: 1, cantidad: 1 }], observacion: 'Sin cebolla' });
  });
  it('el pedido de mesa no paga domicilio ni exige mínimo y requiere el QR firmado', async () => {
    const { s, creados } = tienda({ pedidosHabilitados: false });
    await s.solicitar('trailer', pedido({ entrega: 'MESA', mesa: { numero: 2, token: firmaMesa(7, 2) }, totalEsperado: 15000, items: [{ productoId: 10, cantidad: 1 }] }));
    expect(creados[0]).toMatchObject({ zona: 'Mesa 2', direccion: 'Mesa 2', costoDomicilio: 0 });
    await expect(s.solicitar('trailer', pedido({ entrega: 'MESA', mesa: { numero: 2, token: 'x'.repeat(16) }, totalEsperado: 15000, items: [{ productoId: 10, cantidad: 1 }] }))).rejects.toThrow('QR');
  });
  it('rechaza adicionales en comercios y precios que cambiaron', async () => {
    const { s } = tienda({}, 'COMERCIO');
    await expect(s.solicitar('trailer', pedido({ entrega: 'RECOGER', totalEsperado: 17000, items: [{ productoId: 10, cantidad: 1, adicionales: [{ adicionalId: 1, cantidad: 1 }] }] }))).rejects.toThrow('adicional');
    const { s: r } = tienda();
    await expect(r.solicitar('trailer', pedido({ direccion: 'Calle 1', zona: 'z1', totalEsperado: 33000, items: [{ productoId: 10, cantidad: 2 }] }))).rejects.toThrow('cambiaron');
  });
  it('una entrega en tienda se marca entregada sin domiciliario', async () => {
    const p = { id: 'w1', empresaId: 7, estado: 'ACEPTADO', zona: 'Recoger en tienda', pedidoId: 5, items: [] };
    const tx: any = { $queryRaw: jest.fn(), pedidoWeb: { findFirst: jest.fn().mockResolvedValue(p), update: jest.fn(({ data }) => ({ ...p, ...data })) }, pedido: { update: jest.fn() } };
    const s = new TiendaService({ $transaction: (fn: any) => fn(tx) } as any, {} as any, {} as any);
    expect((await s.gestionar('w1', { accion: 'ENTREGADO' }, { id: 1, empresaId: 7, rol: 'CAJERO', sucursalId: undefined }) as any).estado).toBe('ENTREGADO');
    tx.pedidoWeb.findFirst.mockResolvedValue({ ...p, zona: 'Centro' });
    await expect(s.gestionar('w1', { accion: 'ENTREGADO' }, { id: 1, empresaId: 7, rol: 'ADMIN_EMPRESA' })).rejects.toThrow('no está en camino');
  });
});

describe('Puntos, favoritos y reseñas en la cuenta del cliente', () => {
  function cuentas() {
    const filas: any[] = [];
    const coincide = (f: any, w: any) => Object.entries(w).every(([k, v]) => f[k] === v);
    const db: any = {
      $executeRawUnsafe: jest.fn(),
      empresa: { findUnique: jest.fn().mockResolvedValue({ id: 7, nombre: 'Trailer', activo: true, fidelizacionConfig: { habilitado: true, compraPorPunto: 1000, valorPunto: 100 }, tiendaConfig: { publicada: true, cuentasHabilitadas: true, resenasHabilitadas: true } }) },
      cliente: { findFirst: jest.fn().mockResolvedValue({ id: 33, puntos: 120 }) },
      producto: { count: jest.fn().mockResolvedValue(1) },
      pedidoWeb: { findMany: jest.fn().mockResolvedValue([{ items: [{ productoId: 10 }] }]) },
      tiendaRegistro: {
        findUnique: async ({ where }: any) => filas.find((f) => coincide(f, where.empresaId_tipo_clave)) || null,
        findFirst: async ({ where }: any) => filas.find((f) => coincide(f, where)) || null,
        findMany: async ({ where }: any) => filas.filter((f) => coincide(f, where)),
        create: async ({ data }: any) => { const f = { version: 1, creadoEn: new Date(), ...data }; filas.push(f); return f; },
        updateMany: async ({ where, data }: any) => { const f = filas.find((x) => coincide(x, where)); if (!f) return { count: 0 }; Object.assign(f, data); return { count: 1 }; },
        deleteMany: async ({ where }: any) => { const i = filas.findIndex((x) => coincide(x, where)); if (i >= 0) filas.splice(i, 1); return {}; },
      },
    };
    const registros = new TiendaRegistros(db);
    const extras = new TiendaExtrasService(db, registros, {} as any);
    return { db, filas, extras, exp: new TiendaExperienciaService(db, registros, extras) };
  }
  it('vincula puntos con un código de un solo uso y valida el canje contra el saldo', async () => {
    const { exp, extras } = cuentas();
    const { token } = await extras.registrar('trailer', { nombre: 'Ana Pérez', correo: 'ana@correo.co', telefono: '3106843264', contrasena: 'Clave segura 2026', consentimiento: true });
    const { codigo } = await exp.codigoVinculo({ id: 1, empresaId: 7, rol: 'CAJERO' }, 33);
    await expect(exp.vincular('trailer', token, { codigo: 'ZZZZZZZZ' })).rejects.toThrow('Código');
    expect((await exp.vincular('trailer', token, { codigo })).puntos).toMatchObject({ vinculado: true, saldo: 120 });
    await expect(exp.vincular('trailer', token, { codigo })).rejects.toThrow('Código');
    const empresa = await (extras as any).tienda('trailer');
    expect(await exp.calcularCanje('trailer', empresa.e, token, 50, 20000)).toEqual({ puntos: 50, valor: 5000, clientePosId: 33 });
    await expect(exp.calcularCanje('trailer', empresa.e, token, 500, 20000)).rejects.toThrow('suficientes');
  }, 30000);
  it('guarda favoritos y solo permite reseñar productos recibidos; la reseña queda en moderación', async () => {
    const { exp, extras, db } = cuentas();
    const { token } = await extras.registrar('trailer', { nombre: 'Ana Pérez', correo: 'ana@correo.co', telefono: '3106843264', contrasena: 'Clave segura 2026', consentimiento: true });
    expect((await exp.favorito('trailer', token, { productoId: 10, favorito: true })).favoritos).toEqual([10]);
    await expect(exp.crearResena('trailer', token, { productoId: 10, estrellas: 5, texto: 'Excelente' })).rejects.toThrow('entregado');
    await extras.vincularPedido(7, (await extras.clienteOpcional('trailer', 7, token))!.r.id, 'w1');
    expect(await exp.crearResena('trailer', token, { productoId: 10, estrellas: 5, texto: 'Excelente' })).toEqual({ ok: true, estado: 'PENDIENTE' });
    expect(await exp.resenasPublicas(7)).toEqual([]);
    const [r] = await exp.resenasAdmin({ id: 1, empresaId: 7, rol: 'ADMIN_EMPRESA' });
    expect(r.nombre).toBe('Ana');
    await exp.moderarResena({ id: 1, empresaId: 7, rol: 'ADMIN_EMPRESA' }, r.id, { accion: 'PUBLICAR' });
    expect(await exp.resenasPublicas(7)).toEqual([expect.objectContaining({ productoId: 10, promedio: 5, total: 1 })]);
    db.pedidoWeb.findMany.mockResolvedValue([{ items: [{ productoId: 99 }] }]);
    await expect(exp.crearResena('trailer', token, { productoId: 10, estrellas: 1 })).rejects.toThrow('entregado');
  }, 30000);
  it('nuevas funciones quedan apagadas por defecto', () => {
    expect(tiendaConfig({})).toMatchObject({ avisosClientes: false, recogerHabilitado: false, programarHabilitado: false, mesasHabilitadas: false, resenasHabilitadas: false });
  });
});
