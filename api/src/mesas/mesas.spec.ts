import { MesasService } from './mesas.service';
import { validarPlano } from './mesas.reglas';
import { rutaBloqueadaMesero, esMesero, moduloRuta } from '../auth/permisos';

// Tabla en memoria con la semántica mínima de mesa_registros (clave única por sede, tipo y clave).
function baseFalsa() {
  const filas: any[] = [];
  const coincide = (f: any, w: any) => Object.entries(w || {}).every(([k, v]) => f[k] === v);
  const unica = (f: any) => filas.some((x) => x.id !== f.id && x.empresaId === f.empresaId && x.sucursalId === f.sucursalId && x.tipo === f.tipo && x.clave === f.clave);
  const p2002 = () => Object.assign(new Error('duplicado'), { code: 'P2002' });
  const mesaRegistro = {
    findUnique: async ({ where }: any) => filas.find((f) => coincide(f, where.empresaId_sucursalId_tipo_clave)) || null,
    findFirst: async ({ where }: any) => structuredClone(filas.find((f) => coincide(f, where)) || null),
    findMany: async ({ where }: any) => structuredClone(filas.filter((f) => coincide(f, where))),
    create: async ({ data }: any) => { const f = { version: 1, creadoEn: new Date(), ...structuredClone(data) }; if (unica(f)) throw p2002(); filas.push(f); return structuredClone(f); },
    upsert: async ({ where, create, update }: any) => { const f = filas.find((x) => coincide(x, where.empresaId_sucursalId_tipo_clave)); if (f) Object.assign(f, structuredClone(update)); else filas.push({ version: 1, creadoEn: new Date(), ...structuredClone(create) }); },
    updateMany: async ({ where, data }: any) => {
      const f = filas.find((x) => coincide(x, where));
      if (!f) return { count: 0 };
      const nuevo = { ...f, ...structuredClone(data) };
      if (unica(nuevo)) throw p2002();
      Object.assign(f, nuevo);
      return { count: 1 };
    },
  };
  const producto = {
    findMany: async ({ where }: any) => [
      { id: 1, nombre: 'Bandeja', precio: 25000, categoria: { nombre: 'Platos' } },
      { id: 2, nombre: 'Limonada', precio: 6000, categoria: { nombre: 'Bebidas' } },
    ].filter((p) => where.id.in.includes(p.id)),
  };
  return { filas, mesaRegistro, producto, $executeRawUnsafe: jest.fn() };
}

const admin = { id: 1, nombre: 'Admin', rol: 'ADMIN_EMPRESA', empresaId: 4, sucursalId: 2 };
const mesero = { id: 5, nombre: 'Ana', rol: 'CAJERO', empresaId: 4, sucursalId: 2, permisosUsuario: { perfil: 'MESERO', pos: { ver: true, editar: true } } };
const cajero = { id: 6, nombre: 'Caja', rol: 'CAJERO', empresaId: 4, sucursalId: 2 };

function escenario() {
  const db = baseFalsa();
  let n = 0;
  const pedidos = { crearPedido: jest.fn(async (datos: any) => ({ id: 100 + ++n, numero: `P-${n}`, total: datos.items.reduce((s: number, i: any) => s + i.cantidad * (i.productoId === 1 ? 25000 : 6000), 0) })) };
  const s = new MesasService(db as any, pedidos as any);
  return { db, s, pedidos };
}

describe('Reglas y permisos de mesas', () => {
  it('valida el plano', () => {
    expect(validarPlano({ mesas: [{ numero: 1 }, { numero: 2, zona: 'Terraza', capacidad: 6 }] })).toEqual([
      { numero: 1, nombre: 'Mesa 1', zona: 'Salón', capacidad: 4 },
      { numero: 2, nombre: 'Mesa 2', zona: 'Terraza', capacidad: 6 },
    ]);
    expect(() => validarPlano({ mesas: [{ numero: 1 }, { numero: 1 }] })).toThrow('repetida');
  });
  it('el mesero no maneja la caja ni cobra', () => {
    expect(esMesero(mesero.permisosUsuario)).toBe(true);
    expect(esMesero({ pos: true })).toBe(false);
    expect(rutaBloqueadaMesero('/caja/abierta', 'GET')).toBe(true);
    expect(rutaBloqueadaMesero('/pedidos', 'POST')).toBe(true);
    expect(rutaBloqueadaMesero('/mesas/cuentas/abc/cobrar', 'POST')).toBe(true);
    expect(rutaBloqueadaMesero('/mesas/cuentas/abc/enviar', 'POST')).toBe(false);
    expect(rutaBloqueadaMesero('/productos', 'GET')).toBe(false);
    // La cocina usa el mismo permiso que la pantalla de preparación (/pedidos).
    expect(moduloRuta('/mesas/cocina')).toBe('pos');
    expect(moduloRuta('/mesas/3/abrir')).toBe('pos');
  });
});

describe('Cuentas de mesa', () => {
  it('abre, envía rondas a cocina, cobra por partes y cierra la mesa', async () => {
    const { s, pedidos } = escenario();
    await expect(s.guardarPlano(mesero, { mesas: [{ numero: 1 }] })).rejects.toThrow('administrador');
    await s.guardarPlano(admin, { mesas: [{ numero: 1 }, { numero: 2 }] });
    await expect(s.abrir(mesero, 9, 2)).rejects.toThrow('plano');
    let c: any = await s.abrir(mesero, 1, 2);
    await expect(s.abrir(cajero, 1, 1)).rejects.toThrow('ya tiene');
    c = await s.agregar(mesero, c.id, [{ productoId: 1, cantidad: 2, observacion: 'sin cebolla' }, { productoId: 2, cantidad: 2 }]);
    expect(c.total).toBe(62000);
    const { comanda } = await s.enviar(mesero, c.id);
    expect(comanda).toMatchObject({ numero: 'Mesa 1 · R1', detalles: [{ cantidad: 2, observacion: 'sin cebolla', producto: { nombre: 'Bandeja' } }, { producto: { nombre: 'Limonada' } }] });
    await expect(s.enviar(mesero, c.id)).rejects.toThrow('No hay productos nuevos');
    expect(await s.cocina(admin)).toMatchObject([{ mesa: 1, n: 1, estado: 'PENDIENTE', lineas: [{ nombre: 'Bandeja' }, { nombre: 'Limonada' }] }]);
    await s.estadoRonda({ ...cajero, rol: 'COCINERO' }, c.id, 1, 'LISTA');
    c = await s.ver(mesero, c.id);
    expect(c.listas).toBe(1);
    // Lo enviado solo lo anula un supervisor con motivo.
    await expect(s.quitar(mesero, c.id, c.lineas[1].id, 'se equivocó')).rejects.toThrow('administrador');
    await expect(s.cobrar(mesero, c.id, { claveIdempotencia: 'clave-123456' })).rejects.toThrow('caja');
    const bandeja = c.lineas[0].id;
    const r1: any = await s.cobrar(cajero, c.id, { claveIdempotencia: 'clave-parte-1', lineas: [bandeja], metodoPago: 'EFECTIVO', propina: { monto: 5000, metodoPago: 'EFECTIVO' } });
    expect(pedidos.crearPedido).toHaveBeenCalledWith(expect.objectContaining({ observacion: 'Mesa 1', items: [{ productoId: 1, cantidad: 2, observacion: 'sin cebolla' }], propina: { monto: 5000, metodoPago: 'EFECTIVO' } }), 6, 4, { entregado: true });
    expect(r1.cuenta).toMatchObject({ estado: 'ABIERTA', total: 12000, cobrado: 50000 });
    // Reintento con la misma clave: no crea otra venta.
    await s.cobrar(cajero, c.id, { claveIdempotencia: 'clave-parte-1', lineas: [bandeja] });
    expect(pedidos.crearPedido).toHaveBeenCalledTimes(1);
    await expect(s.cobrar(cajero, c.id, { claveIdempotencia: 'clave-parte-x', lineas: [bandeja] })).rejects.toThrow('ya se cobró');
    const r2: any = await s.cobrar(cajero, c.id, { claveIdempotencia: 'clave-parte-2', metodoPago: 'TARJETA' });
    expect(r2.cuenta.estado).toBe('COBRADA');
    expect((await s.estado(admin)).mesas[0].cuenta).toBeNull();
    await s.abrir(mesero, 1, 1);
  });

  it('traslada a una mesa libre, une con una ocupada y pasa productos entre mesas', async () => {
    const { s } = escenario();
    await s.guardarPlano(admin, { mesas: [{ numero: 1 }, { numero: 2 }, { numero: 3 }] });
    let a: any = await s.abrir(mesero, 1, 2);
    a = await s.agregar(mesero, a.id, [{ productoId: 1, cantidad: 1 }]);
    await s.enviar(mesero, a.id);
    a = await s.trasladar(mesero, a.id, 2);
    expect(a.mesa).toBe(2);
    let b: any = await s.abrir(mesero, 1, 1);
    b = await s.agregar(mesero, b.id, [{ productoId: 2, cantidad: 3 }]);
    await s.enviar(mesero, b.id);
    const unida: any = await s.trasladar(mesero, b.id, 2);
    expect(unida).toMatchObject({ mesa: 2, personas: 3, total: 43000 });
    expect(unida.rondas.map((r: any) => r.n)).toEqual([1, 2]);
    expect((await s.estado(admin)).mesas.filter((m: any) => m.cuenta).map((m: any) => m.numero)).toEqual([2]);
    const limonada = unida.lineas.find((l: any) => l.nombre === 'Limonada').id;
    const destino: any = await s.moverLineas(mesero, unida.id, [limonada], 3);
    expect(destino).toMatchObject({ mesa: 3, total: 18000 });
    expect((await s.ver(mesero, unida.id)).total).toBe(25000);
    await expect(s.anular(mesero, unida.id, 'cliente se fue')).rejects.toThrow('administrador');
    expect((await s.anular(admin, unida.id, 'cliente se fue')).estado).toBe('ANULADA');
  });
});
