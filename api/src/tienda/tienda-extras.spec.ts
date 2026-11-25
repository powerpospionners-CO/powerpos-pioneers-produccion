import {
  descuentoCupon,
  validarContrasena,
  validarCuponAdmin,
  validarReserva,
} from './tienda-extras.reglas';
import {
  abrirTienda,
  cifrarTienda,
  firmarCliente,
  leerCliente,
  TiendaRegistros,
} from './tienda-registros';
import { TiendaExtrasService } from './tienda-extras.service';
import { TiendaService } from './tienda.service';

process.env.PERSONAL_ENCRYPTION_KEY = 'a'.repeat(64);

// Tabla en memoria con la misma semántica de versión que usa el almacén real.
function baseFalsa(tiendaConfig: any = {}) {
  const filas: any[] = [];
  const coincide = (f: any, w: any) =>
    Object.entries(w).every(([k, v]) => f[k] === v);
  const db: any = {
    filas,
    $executeRawUnsafe: jest.fn(),
    empresa: {
      findUnique: jest.fn().mockResolvedValue({
        id: 7,
        nombre: 'Tienda Azul',
        activo: true,
        tiendaConfig: { publicada: true, ...tiendaConfig },
      }),
    },
    pedidoWeb: { findMany: jest.fn().mockResolvedValue([]) },
    tiendaRegistro: {
      findUnique: async ({ where }: any) =>
        filas.find((f) => coincide(f, where.empresaId_tipo_clave)) || null,
      findFirst: async ({ where }: any) => filas.find((f) => coincide(f, where)) || null,
      findMany: async ({ where, take }: any) =>
        filas.filter((f) => coincide(f, where)).slice(0, take),
      create: async ({ data }: any) => {
        if (filas.some((f) => f.empresaId === data.empresaId && f.tipo === data.tipo && f.clave === data.clave))
          throw Object.assign(new Error('duplicado'), { code: 'P2002' });
        const f = { version: 1, creadoEn: new Date(), actualizadoEn: new Date(), ...data };
        filas.push(f);
        return f;
      },
      updateMany: async ({ where, data }: any) => {
        const f = filas.find((x) => coincide(x, where));
        if (!f) return { count: 0 };
        Object.assign(f, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }: any) => {
        const i = filas.findIndex((x) => coincide(x, where));
        if (i >= 0) filas.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
    },
  };
  const correo = { enviarCodigoCuenta: jest.fn().mockResolvedValue(true) };
  const servicio = new TiendaExtrasService(db, new TiendaRegistros(db), correo as any);
  return { db, servicio, correo };
}

const cupon = (x: any = {}) =>
  validarCuponAdmin({
    codigo: 'bienvenida',
    tipo: 'PORCENTAJE',
    valor: 10,
    desde: '2026-11-01',
    hasta: '2026-11-30',
    minimo: 20000,
    maxUsos: 2,
    activo: true,
    ...x,
  });

describe('Reglas de cupones', () => {
  it('descuenta porcentaje o valor fijo solo sobre productos y nunca más que el subtotal', () => {
    expect(cupon().codigo).toBe('BIENVENIDA');
    expect(descuentoCupon(cupon(), 50000, '2026-11-25')).toBe(5000);
    expect(descuentoCupon(cupon({ tipo: 'VALOR', valor: 90000 }), 50000, '2026-11-25')).toBe(50000);
  });
  it.each([
    [{ activo: false }, 'vigente'],
    [{ hasta: '2026-11-24' }, 'vigente'],
    [{ maxUsos: 1, }, 'límite'],
  ] as [any, string][])('rechaza cupones inactivos, vencidos o agotados', (x, mensaje) => {
    const c = { ...cupon(x), usos: x.maxUsos ? 1 : 0 };
    expect(() => descuentoCupon(c, 50000, '2026-11-25')).toThrow(mensaje);
  });
  it('exige la compra mínima y valida la configuración', () => {
    expect(() => descuentoCupon(cupon(), 10000, '2026-11-25')).toThrow('compras desde');
    expect(() => cupon({ valor: 95 })).toThrow();
    expect(() => cupon({ codigo: 'a b' })).toThrow();
    expect(() => cupon({ desde: '2026-12-01' })).toThrow('terminar después');
    expect(() => validarCuponAdmin({ ...cupon(), maxUsos: 1 }, { ...cupon(), usos: 2 })).toThrow('no puede ser menor');
  });
});

describe('Reglas de reservas y contraseñas', () => {
  const config = {
    reservaMaxPersonas: 8,
    reservaDiasMax: 30,
    horarios: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      dia,
      abierto: dia !== 6,
      apertura: '10:00',
      cierre: '22:00',
    })),
  };
  const ahora = { fecha: '2026-11-25', minutos: 12 * 60 };
  const base = { nombre: 'Ana', telefono: '310 684 3264', fecha: '2026-11-27', hora: '19:00', personas: 4, consentimiento: true };
  it('acepta reservas dentro del horario y convierte el día con lunes como primero', () => {
    expect(validarReserva(base, config, ahora)).toMatchObject({ telefono: '3106843264', personas: 4 });
    // 2026-11-29 es domingo (6), configurado como cerrado.
    expect(() => validarReserva({ ...base, fecha: '2026-11-29' }, config, ahora)).toThrow('no atiende');
  });
  it.each([
    [{ hora: '23:00' }, 'horario'],
    [{ fecha: '2026-11-25', hora: '12:10' }, 'anticipación'],
    [{ fecha: '2027-02-01' }, 'días adelante'],
    [{ personas: 9 }, 'personas'],
    [{ consentimiento: false }, 'autorizar'],
    [{ sitio: 'http://spam' }, 'procesar'],
  ])('rechaza reservas fuera de las reglas (%o)', (x, mensaje) => {
    expect(() => validarReserva({ ...base, ...x }, config, ahora)).toThrow(mensaje);
  });
  it('exige contraseñas largas y no triviales', () => {
    expect(validarContrasena('Clave segura 2026')).toBe('Clave segura 2026');
    for (const v of ['corta1', 'sinnumerossss', '1234567890', 'password123'])
      expect(() => validarContrasena(v)).toThrow();
  });
});

describe('Cifrado y sesiones de clientes', () => {
  it('cifra datos personales ligados a su registro', () => {
    const c = cifrarTienda({ correo: 'ana@correo.co' }, '7:CLIENTE:1');
    expect(JSON.stringify(c)).not.toContain('ana@');
    expect(abrirTienda(c, '7:CLIENTE:1')).toEqual({ correo: 'ana@correo.co' });
    expect(() => abrirTienda(c, '8:CLIENTE:1')).toThrow();
  });
  it('rechaza fichas alteradas, vencidas o con formato del personal', () => {
    const t = firmarCliente({ e: 7, s: 'azul', c: 'x', v: 1, exp: Date.now() + 1000 });
    expect(leerCliente(t)?.c).toBe('x');
    const [p, cuerpo, firma] = t.split('.');
    const otro = Buffer.from(JSON.stringify({ e: 8, s: 'azul', c: 'x', v: 1, exp: Date.now() + 1000 })).toString('base64url');
    expect(leerCliente(`${p}.${otro}.${firma}`)).toBeNull();
    expect(leerCliente(`${p}.${cuerpo}.${firma}`, Date.now() + 5000)).toBeNull();
    expect(leerCliente('eyJhbGciOiJIUzI1NiJ9.e30.firma')).toBeNull();
  });
});

describe('Cuentas de cliente', () => {
  const registro = { nombre: 'Ana', correo: 'Ana@Correo.co', telefono: '3106843264', contrasena: 'Clave segura 2026', consentimiento: true };
  it('no guarda el correo en claro y bloquea tras cinco intentos fallidos', async () => {
    const { db, servicio } = baseFalsa({ cuentasHabilitadas: true });
    const { token } = await servicio.registrar('azul', registro);
    expect(JSON.stringify(db.filas)).not.toContain('ana@correo.co');
    expect((await servicio.perfil('azul', `Bearer ${token}`)).cliente.correo).toBe('ana@correo.co');
    for (let i = 0; i < 5; i++)
      await expect(servicio.ingresar('azul', { correo: 'ana@correo.co', contrasena: 'incorrecta 1' })).rejects.toThrow('incorrectos');
    await expect(servicio.ingresar('azul', { correo: 'ana@correo.co', contrasena: registro.contrasena })).rejects.toThrow('Demasiados intentos');
    // Los intentos fallidos de terceros no cierran la sesión abierta del cliente.
    expect((await servicio.perfil('azul', token)).cliente.nombre).toBe('Ana');
  }, 30000);
  it('cambiar la contraseña invalida las sesiones anteriores y la cuenta se puede eliminar', async () => {
    const { db, servicio } = baseFalsa({ cuentasHabilitadas: true });
    const { token } = await servicio.registrar('azul', registro);
    const nueva = await servicio.cambiarContrasena('azul', token, { actual: registro.contrasena, nueva: 'Otra clave 2027' });
    await expect(servicio.perfil('azul', token)).rejects.toThrow('sesión');
    await expect(servicio.perfil('otra-tienda', nueva.token)).rejects.toThrow('sesión');
    await servicio.eliminarCuenta('azul', nueva.token, { contrasena: 'Otra clave 2027' });
    expect(db.filas).toHaveLength(0);
  }, 30000);
  it('restablece con código de un solo uso sin revelar si la cuenta existe', async () => {
    const { servicio, correo } = baseFalsa({ cuentasHabilitadas: true });
    await servicio.registrar('azul', registro);
    expect(await servicio.solicitarCodigo('azul', { correo: 'nadie@correo.co' })).toEqual({ ok: true });
    expect(correo.enviarCodigoCuenta).not.toHaveBeenCalled();
    await servicio.solicitarCodigo('azul', { correo: 'ana@correo.co' });
    const codigo = correo.enviarCodigoCuenta.mock.calls[0][2];
    await expect(servicio.restablecer('azul', { correo: 'ana@correo.co', codigo: codigo === '000000' ? '000001' : '000000', nueva: 'Nueva clave 2028' })).rejects.toThrow('Código');
    const s = await servicio.restablecer('azul', { correo: 'ana@correo.co', codigo, nueva: 'Nueva clave 2028' });
    expect(s.token).toMatch(/^cli\./);
    await expect(servicio.restablecer('azul', { correo: 'ana@correo.co', codigo, nueva: 'Otra clave 2029' })).rejects.toThrow('Código');
  }, 30000);
  it('no permite cuentas cuando la tienda no las activó', async () => {
    const { servicio } = baseFalsa();
    await expect(servicio.registrar('azul', registro)).rejects.toThrow('no tiene cuentas');
  });
});

describe('Boletín, reservas y cupones en la tienda', () => {
  it('la suscripción repetida no duplica ni revela datos y la baja los elimina', async () => {
    const { db, servicio } = baseFalsa({ boletinHabilitado: true });
    const datos = { correo: 'ana@correo.co', consentimiento: true };
    expect(await servicio.suscribir('azul', datos)).toEqual({ ok: true });
    expect(await servicio.suscribir('azul', datos)).toEqual({ ok: true });
    expect(db.filas).toHaveLength(1);
    await servicio.bajaBoletin('azul', { correo: 'ANA@correo.co' });
    expect(db.filas).toHaveLength(0);
  });
  it('las reservas son idempotentes y el seguimiento público no expone datos personales', async () => {
    const { servicio } = baseFalsa({ reservasHabilitadas: true, reservaMaxPersonas: 10, reservaDiasMax: 400 });
    const body = { clave: 'c'.repeat(24), nombre: 'Ana', telefono: '3106843264', fecha: '2027-06-10', hora: '19:00', personas: 2, consentimiento: true };
    const a = await servicio.reservar('azul', body);
    const b = await servicio.reservar('azul', body);
    expect(b.id).toBe(a.id);
    const publica = await servicio.reserva('azul', a.id);
    expect(JSON.stringify(publica)).not.toContain('3106843264');
    const usuario = { id: 1, empresaId: 7, rol: 'CAJERO' };
    await servicio.gestionarReserva(usuario, a.id, { accion: 'CONFIRMAR' });
    await expect(servicio.gestionarReserva(usuario, a.id, { accion: 'CONFIRMAR' })).rejects.toThrow('cambió');
    await expect(servicio.gestionarReserva(usuario, a.id, { accion: 'CANCELAR' })).rejects.toThrow('Motivo');
  });
  it('aplicar y liberar un cupón ajusta sus usos', async () => {
    const { db, servicio } = baseFalsa();
    const usuario = { id: 1, empresaId: 7, rol: 'ADMIN_EMPRESA' };
    await servicio.guardarCupon(usuario, { codigo: 'AHORRA', tipo: 'VALOR', valor: 3000, desde: '2020-01-01', hasta: '2099-12-31', minimo: 0, maxUsos: 1, activo: true });
    const { r, descuento } = await servicio.calcularCupon(7, 'ahorra', 10000);
    await servicio.aplicarCupon(r, 'pedido-1', descuento, db);
    await expect(servicio.calcularCupon(7, 'AHORRA', 10000)).rejects.toThrow('límite');
    expect(await servicio.usoCupon(7, 'pedido-1')).toMatchObject({ codigo: 'AHORRA', descuento: 3000 });
    await servicio.liberarCupon(7, 'pedido-1', db);
    expect((await servicio.calcularCupon(7, 'AHORRA', 10000)).descuento).toBe(3000);
    await expect(servicio.eliminarCupon(usuario, r.id)).resolves.toEqual({ ok: true });
  });
});

describe('Pedido web con cupón al aceptarse en caja', () => {
  it('pasa el descuento verificado a la venta y anota el código', async () => {
    const p = { id: 'w1', empresaId: 7, sucursalId: 2, estado: 'RECIBIDO', metodoPago: 'EFECTIVO', nombre: 'Ana', telefono: '310', direccion: 'Calle 1', observacion: '', items: [{ productoId: 5, nombre: 'Café', cantidad: 2, precio: 10000 }], subtotal: 20000, costoDomicilio: 3000, total: 21000 };
    const tx: any = {
      $queryRaw: jest.fn(),
      pedidoWeb: { findFirst: jest.fn().mockResolvedValue(p), update: jest.fn().mockResolvedValue({ ...p, estado: 'ACEPTADO' }) },
      producto: { findMany: jest.fn().mockResolvedValue([{ id: 5, precio: 10000 }]) },
    };
    const db: any = { $transaction: (fn: any) => fn(tx) };
    const pedidos = { crearEnTransaccion: jest.fn().mockResolvedValue({ id: 99, total: 21000 }) };
    const extras = { usoCupon: jest.fn().mockResolvedValue({ codigo: 'AHORRA', descuento: 2000 }) };
    const s = new TiendaService(db, pedidos as any, {} as any, undefined, extras as any);
    await s.gestionar('w1', { accion: 'ACEPTAR' }, { id: 1, empresaId: 7, rol: 'ADMIN_EMPRESA' });
    expect(pedidos.crearEnTransaccion.mock.calls[0][0]).toMatchObject({ descuento: 2000 });
    expect(pedidos.crearEnTransaccion.mock.calls[0][0].observacion).toContain('CUPÓN AHORRA');
  });
  it('no acepta un pedido con descuento que no corresponde a un cupón registrado', async () => {
    const p = { id: 'w1', empresaId: 7, sucursalId: 2, estado: 'RECIBIDO', metodoPago: 'EFECTIVO', items: [], subtotal: 20000, costoDomicilio: 0, total: 15000 };
    const tx: any = { $queryRaw: jest.fn(), pedidoWeb: { findFirst: jest.fn().mockResolvedValue(p) }, producto: { findMany: jest.fn().mockResolvedValue([]) } };
    const s = new TiendaService({ $transaction: (fn: any) => fn(tx) } as any, {} as any, {} as any, undefined, { usoCupon: jest.fn().mockResolvedValue(null) } as any);
    await expect(s.gestionar('w1', { accion: 'ACEPTAR' }, { id: 1, empresaId: 7, rol: 'ADMIN_EMPRESA' })).rejects.toThrow('cupón');
  });
});
