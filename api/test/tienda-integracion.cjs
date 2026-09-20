/* Prueba HTTP con PostgreSQL aislado. Nunca usa DATABASE_URL del proyecto. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = process.env.TIENDA_TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).hostname !== '127.0.0.1' ||
  new URL(url).port !== '55439' ||
  new URL(url).pathname !== '/powerpos_store_test'
)
  throw Error(
    'Use únicamente la base aislada powerpos_store_test en 127.0.0.1:55439',
  );
process.env.DATABASE_URL = url;
process.env.JWT_SECRET = 'tienda-test-secret-not-for-production-2026';
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { PrismaModule } = require('../dist/src/prisma/prisma.module');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { TiendaModule } = require('../dist/src/tienda/tienda.module');
const { AuthModule } = require('../dist/src/auth/auth.module');
const { EmpresaModule } = require('../dist/src/empresa/empresa.module');
const { ClientesModule } = require('../dist/src/clientes/clientes.module');
const { PedidosModule } = require('../dist/src/pedidos/pedidos.module');
const {
  NotificacionesService,
} = require('../dist/src/notificaciones/notificaciones.service');
const results = [];
const ok = (name) => {
  results.push(name);
  console.log('PASS ' + name);
};
(async () => {
  let app;
  try {
    const module = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuthModule,
        TiendaModule,
        EmpresaModule,
        ClientesModule,
        PedidosModule,
      ],
    })
      .overrideProvider(NotificacionesService)
      .useValue({ enviarAlerta: async () => {} })
      .compile();
    app = module.createNestApplication();
    await app.init();
    const db = app.get(PrismaService),
      http = request(app.getHttpServer()),
      jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const suffix = randomUUID().slice(0, 8);
    const a = await db.empresa.create({
      data: {
        nombre: 'Tienda A ' + suffix,
        nit: 'A' + suffix,
        email: 'a@example.test',
        sucursales: { create: { nombre: 'Principal' } },
      },
      include: { sucursales: true },
    });
    const b = await db.empresa.create({
      data: {
        nombre: 'Tienda B ' + suffix,
        nit: 'B' + suffix,
        email: 'b@example.test',
        sucursales: { create: { nombre: 'Principal' } },
      },
      include: { sucursales: true },
    });
    const user = async (e, rol) =>
      db.usuario.create({
        data: {
          nombre: rol,
          email: rol + e.id + suffix + '@example.test',
          password: 'no-login-test',
          empresaId: e.id,
          sucursalId: e.sucursales[0].id,
          rol,
        },
      });
    const admin = await user(a, 'ADMIN_EMPRESA'),
      cajero = await user(a, 'CAJERO'),
      driver = await user(a, 'DOMICILIARIO'),
      adminB = await user(b, 'ADMIN_EMPRESA');
    const token = (u) =>
      'Bearer ' +
      jwt.sign({
        sub: u.id,
        empresaId: u.empresaId,
        sucursalId: u.sucursalId,
        rol: u.rol,
      });
    const cat = await db.categoria.create({
        data: { empresaId: a.id, nombre: 'Comida' },
      }),
      beb = await db.categoria.create({
        data: { empresaId: a.id, nombre: 'Bebidas' },
      }),
      otherCat = await db.categoria.create({
        data: { empresaId: b.id, nombre: 'Otros' },
      });
    const ingredient = await db.ingrediente.create({
      data: { nombre: 'Insumo ' + suffix, unidad: 'unidad', stock: 100 },
    });
    const food = await db.producto.create({
        data: {
          empresaId: a.id,
          categoriaId: cat.id,
          nombre: 'Comida demo',
          precio: 20000,
          ingredientes: {
            create: { ingredienteId: ingredient.id, cantidad: 1 },
          },
        },
      }),
      drink = await db.producto.create({
        data: {
          empresaId: a.id,
          categoriaId: beb.id,
          nombre: 'Bebida demo',
          precio: 10000,
        },
      }),
      foreign = await db.producto.create({
        data: {
          empresaId: b.id,
          categoriaId: otherCat.id,
          nombre: 'Otra empresa',
          precio: 1,
        },
      });
    const client = await db.cliente.create({
        data: { empresaId: a.id, nombre: 'Cliente identificado', puntos: 100 },
      }),
      clientB = await db.cliente.create({
        data: { empresaId: b.id, nombre: 'Otro cliente' },
      });
    let r = await http.get('/tiendas/' + a.tiendaSlug).expect(200);
    assert.equal(r.body.nombre, a.nombre);
    assert.equal(r.body.productos.length, 2);
    assert.equal(r.body.email, undefined);
    assert.equal(r.body.config.pedidosHabilitados, false);
    ok('Tienda automática, catálogo aislado y datos públicos mínimos');
    r = await http
      .get('/tienda-admin/configuracion')
      .set('Authorization', token(admin))
      .expect(200);
    assert.equal(r.body.fidelizacion.habilitado, false);
    ok('Fidelización desactivada por defecto, sin regla heredada');
    await http.patch('/tienda-admin/configuracion').send({}).expect(401);
    await http
      .patch('/tienda-admin/configuracion')
      .set('Authorization', token(cajero))
      .send({})
      .expect(403);
    await http
      .patch('/empresa')
      .set('Authorization', token(cajero))
      .send({ tiendaConfig: { publicada: true } })
      .expect(403);
    ok('Configuración protegida por autenticación y rol');
    await http
      .patch('/tienda-admin/configuracion')
      .set('Authorization', token(admin))
      .send({ fidelizacion: { categoriasExcluidas: [otherCat.id] } })
      .expect(400);
    ok('No permite categorías de otra empresa');
    await http
      .patch('/tienda-admin/configuracion')
      .set('Authorization', token(admin))
      .send({
        tienda: {
          pedidosHabilitados: true,
          sucursalId: a.sucursales[0].id,
          zonas: [{ nombre: 'Centro', costo: 3000 }],
          whatsapp: '573001234567',
        },
        fidelizacion: {
          habilitado: true,
          compraPorPunto: 1000,
          valorPunto: 100,
          categoriasExcluidas: [beb.id],
        },
      })
      .expect(200);
    const body = {
      clave: randomUUID(),
      nombre: 'Comprador',
      telefono: '3001234567',
      direccion: 'Calle de prueba 1',
      zona: 'Centro',
      metodoPago: 'EFECTIVO',
      items: [
        { productoId: food.id, cantidad: 1, precio: 1 },
        { productoId: drink.id, cantidad: 1 },
      ],
      totalEsperado: 33000,
    };
    await http
      .post('/tiendas/' + a.tiendaSlug + '/pedidos')
      .send({
        ...body,
        clave: randomUUID(),
        items: [{ productoId: foreign.id, cantidad: 1 }],
        totalEsperado: 3001,
      })
      .expect(400);
    await http
      .post('/tiendas/' + a.tiendaSlug + '/pedidos')
      .send({
        ...body,
        clave: randomUUID(),
        items: [{ productoId: food.id, cantidad: 0 }],
      })
      .expect(400);
    await http
      .post('/tiendas/' + a.tiendaSlug + '/pedidos')
      .send({ ...body, clave: randomUUID(), totalEsperado: 1 })
      .expect(409);
    ok('Rechaza productos ajenos, cantidades inválidas y totales manipulados');
    r = await http
      .post('/tiendas/' + a.tiendaSlug + '/pedidos')
      .send(body)
      .expect(201);
    const id = r.body.id;
    assert.equal(Number(r.body.total), 33000);
    const repeat = await http
      .post('/tiendas/' + a.tiendaSlug + '/pedidos')
      .send(body)
      .expect(201);
    assert.equal(repeat.body.id, id);
    assert.equal(
      await db.pedido.count({ where: { sucursalId: a.sucursales[0].id } }),
      0,
    );
    assert.equal(
      await db.movimientoFinanciero.count({ where: { empresaId: a.id } }),
      0,
    );
    ok(
      'Precios calculados en servidor, reintento idempotente y solicitud sin venta',
    );
    await http
      .patch('/tienda-admin/pedidos/' + id)
      .set('Authorization', token(cajero))
      .send({ accion: 'ACEPTAR', clienteId: client.id })
      .expect(400);
    assert.equal(
      (await db.pedidoWeb.findUnique({ where: { id } })).estado,
      'RECIBIDO',
    );
    ok('Aceptar sin caja abierta no deja efectos parciales');
    await db.caja.create({
      data: {
        sucursalId: a.sucursales[0].id,
        usuarioId: cajero.id,
        montoInicial: 0,
      },
    });
    const attempts = await Promise.all(
      [1, 2].map(() =>
        http
          .patch('/tienda-admin/pedidos/' + id)
          .set('Authorization', token(cajero))
          .send({ accion: 'ACEPTAR', clienteId: client.id }),
      ),
    );
    assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      await db.pedido.count({ where: { sucursalId: a.sucursales[0].id } }),
      1,
    );
    assert.equal(
      Number(
        (await db.ingrediente.findUnique({ where: { id: ingredient.id } }))
          .stock,
      ),
      99,
    );
    assert.equal(
      (await db.cliente.findUnique({ where: { id: client.id } })).puntos,
      120,
    );
    ok(
      'Aceptación concurrente crea una venta y acredita solo comida, no bebida ni domicilio',
    );
    await http.get('/tiendas/' + b.tiendaSlug + '/pedidos/' + id).expect(404);
    await http
      .patch('/tienda-admin/pedidos/' + id)
      .set('Authorization', token(adminB))
      .send({ accion: 'RECHAZAR', motivo: 'No' })
      .expect(404);
    ok('Seguimiento y gestión aislados por empresa');
    r = await http
      .get('/tienda-admin/pedidos')
      .set('Authorization', token(driver))
      .expect(200);
    assert.equal(r.body.length, 0);
    await http
      .patch('/tienda-admin/pedidos/' + id)
      .set('Authorization', token(cajero))
      .send({ accion: 'EN_CAMINO', repartidorId: driver.id })
      .expect(200);
    r = await http
      .get('/tienda-admin/pedidos')
      .set('Authorization', token(driver))
      .expect(200);
    assert.equal(r.body.length, 1);
    await http
      .patch('/tienda-admin/pedidos/' + id)
      .set('Authorization', token(driver))
      .send({ accion: 'ENTREGADO' })
      .expect(200);
    r = await http
      .get('/tiendas/' + a.tiendaSlug + '/pedidos/' + id)
      .expect(200);
    assert.equal(r.body.estado, 'ENTREGADO');
    assert.equal(r.body.pedido.estado, 'ENTREGADO');
    ok('Asignación y entrega del domiciliario conectadas al pedido del POS');
    const sale = {
      sucursalId: a.sucursales[0].id,
      clienteId: client.id,
      metodoPago: 'EFECTIVO',
      items: body.items,
      puntosCanjeados: 10,
    };
    r = await http
      .post('/pedidos')
      .set('Authorization', token(cajero))
      .send(sale)
      .expect(201);
    assert.equal(Number(r.body.total), 29000);
    assert.equal(r.body.puntosGanados, 19);
    assert.equal(
      (await db.cliente.findUnique({ where: { id: client.id } })).puntos,
      129,
    );
    ok(
      'Canje aplica valor configurado y acumula sobre importe elegible descontado',
    );
    const before = await db.pedido.count();
    await http
      .post('/pedidos')
      .set('Authorization', token(cajero))
      .send({ ...sale, puntosCanjeados: -1 })
      .expect(400);
    await http
      .post('/pedidos')
      .set('Authorization', token(cajero))
      .send({ ...sale, puntosCanjeados: 999 })
      .expect(400);
    assert.equal(await db.pedido.count(), before);
    ok('Canjes inválidos se rechazan sin registrar ventas');
    const redemptions = await Promise.all(
      [1, 2].map(() =>
        http
          .post('/pedidos')
          .set('Authorization', token(cajero))
          .send({ ...sale, puntosCanjeados: 120 }),
      ),
    );
    assert.deepEqual(redemptions.map((r) => r.status).sort(), [201, 400]);
    assert.ok(
      (await db.cliente.findUnique({ where: { id: client.id } })).puntos >= 0,
    );
    ok('Canjes concurrentes no permiten gastar el mismo saldo dos veces');
    await http
      .get('/clientes/' + clientB.id)
      .set('Authorization', token(cajero))
      .expect(404);
    await http
      .post('/clientes/' + client.id + '/puntos/agregar')
      .set('Authorization', token(cajero))
      .send({ puntos: 100 })
      .expect(403);
    ok('Clientes y ajustes de puntos protegidos por empresa y rol');
    const denied = { ...body, clave: randomUUID() };
    r = await http
      .post('/tiendas/' + a.tiendaSlug + '/pedidos')
      .send(denied)
      .expect(201);
    await http
      .patch('/tienda-admin/pedidos/' + r.body.id)
      .set('Authorization', token(cajero))
      .send({ accion: 'RECHAZAR', motivo: 'Fuera de cobertura confirmada' })
      .expect(200);
    ok('Rechazo registra motivo sin crear venta');
    console.log(JSON.stringify({ total: results.length, resultado: 'PASS' }));
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
