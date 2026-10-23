/* Solo bases efímeras locales, nunca DATABASE_URL ni .env del proyecto. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = process.env.POS_TEST_DATABASE_URL;
if (!url) throw Error('Falta POS_TEST_DATABASE_URL para la base aislada');
const destino = new URL(url), mysql = destino.protocol === 'mysql:';
if (destino.hostname !== '127.0.0.1' || destino.pathname !== '/powerpos_pos_test' || destino.port !== (mysql ? '55440' : '55439') || (!mysql && !['postgres:', 'postgresql:'].includes(destino.protocol))) throw Error('Solo se permite powerpos_pos_test en 127.0.0.1:55439 (PostgreSQL) o :55440 (MariaDB)');
Object.assign(process.env, { DATABASE_URL: url, DATABASE_ENGINE: mysql ? 'mysql' : 'postgresql', JWT_SECRET: 'solo-para-pruebas-locales-powerpos-2026', EVENTOS_COMPARTIDOS: 'true', BACKGROUND_JOBS_ENABLED: 'false', ESC_POS_ENABLED: 'false' });
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const bcrypt = require('bcrypt'), request = require('supertest');
const { AppModule } = require('../dist/src/app.module');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { EventosService } = require('../dist/src/eventos/eventos.service');
const { NotificacionesService } = require('../dist/src/notificaciones/notificaciones.service');
const { ImpresionService } = require('../dist/src/impresion/impresion.service');
const { ImpresionEventosService } = require('../dist/src/impresion/impresion-eventos.service');

(async () => {
  let app, otra;
  const subscriptions = [];
  try {
    async function crear() {
      const modulo = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(NotificacionesService).useValue({ enviarAlerta: async () => ({ enviado: false }) })
        .overrideProvider(ImpresionService).useValue({ imprimirCierreCaja: async () => ({ impreso: false }) }).compile();
      const instancia = modulo.createNestApplication();
      await instancia.init();
      return instancia;
    }
    app = await crear(); otra = await crear();
    const db = app.get(PrismaService), http = request(app.getHttpServer()), sufijo = randomUUID();
    const empresa = await db.empresa.create({ data: { nombre: 'POS integración', nit: sufijo, email: `empresa-${sufijo}@example.com`, tipoNegocio: 'TIENDA', plan: 'PREMIUM', pagoExonerado: true } });
    const sede = await db.sucursal.create({ data: { empresaId: empresa.id, nombre: 'Sede de prueba' } });
    const password = 'ClaveLocal123*';
    const usuario = await db.usuario.create({ data: { empresaId: empresa.id, sucursalId: sede.id, nombre: 'Caja prueba', email: `caja-${sufijo}@example.com`, password: await bcrypt.hash(password, 4), rol: 'ADMIN_EMPRESA', permisos: { pos: { ver: true, editar: true }, productos: { ver: true, editar: false } } } });
    const categoria = await db.categoria.create({ data: { empresaId: empresa.id, nombre: 'Prueba' } });
    const producto = await db.producto.create({ data: { empresaId: empresa.id, categoriaId: categoria.id, nombre: 'Producto prueba', precio: 10000, costo: 4000, controlaStock: true, stockActual: 10 } });
    const cliente = await db.cliente.create({ data: { empresaId: empresa.id, nombre: 'Cliente prueba', documento: sufijo } });
    const login = await http.post('/auth/login').send({ email: usuario.email, password }).expect(201);
    const token = 'Bearer ' + login.body.access_token;
    assert.equal(login.body.usuario.permisosUsuario.productos.editar, false);
    await http.get('/health/ready').expect(200);
    await http.get('/productos').set('Authorization', token).expect(200);
    await http.patch('/productos/' + producto.id).set('Authorization', token).send({ nombre: 'Cambio no permitido' }).expect(403);
    const caja = (await http.post('/caja/abrir').set('Authorization', token).send({ montoInicial: 50000 }).expect(201)).body;
    const venta = { sucursalId: sede.id, claveIdempotencia: randomUUID(), metodoPago: 'EFECTIVO', items: [{ productoId: producto.id, cantidad: 2 }] };
    const cobrada = (await http.post('/pedidos').set('Authorization', token).send(venta).expect(201)).body;
    assert.equal(Number(cobrada.total), 20000);
    const repetida = (await http.post('/pedidos').set('Authorization', token).send(venta).expect(201)).body;
    assert.equal(repetida.id, cobrada.id);
    assert.equal((await db.producto.findUnique({ where: { id: producto.id } })).stockActual, 8);
    const credito = (await http.post('/pedidos').set('Authorization', token).send({ ...venta, claveIdempotencia: randomUUID(), clienteId: cliente.id, condicionPago: 'CREDITO', vencimientoCredito: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()), items: [{ productoId: producto.id, cantidad: 1 }] }).expect(201)).body;
    const abono = { clave: randomUUID(), monto: 10000, metodoPago: 'EFECTIVO', referencia: 'Cobro prueba' };
    const pago = (await http.post(`/pedidos/${credito.id}/cobros-credito`).set('Authorization', token).send(abono).expect(201)).body;
    const pagoRepetido = (await http.post(`/pedidos/${credito.id}/cobros-credito`).set('Authorization', token).send(abono).expect(201)).body;
    assert.equal(pago.id, pagoRepetido.id);
    const devolucion = { clave: randomUUID(), metodoPago: 'EFECTIVO', motivo: 'Prueba de devolución', reponer: true, items: [{ detalleId: cobrada.detalles[0].id, cantidad: 1 }] };
    const devuelta = (await http.post(`/pedidos/${cobrada.id}/devoluciones`).set('Authorization', token).send(devolucion).expect(201)).body;
    const devueltaRepetida = (await http.post(`/pedidos/${cobrada.id}/devoluciones`).set('Authorization', token).send(devolucion).expect(201)).body;
    assert.equal(devuelta.id, devueltaRepetida.id);
    assert.equal((await db.producto.findUnique({ where: { id: producto.id } })).stockActual, 8);
    const cierre = (await http.post(`/caja/${caja.id}/cerrar`).set('Authorization', token).send({ montoFinal: 70000 }).expect(201)).body;
    assert.equal(cierre.estado, 'CERRADA'); assert.equal(Number(cierre.totalEfectivo), 20000); assert.equal(Number(cierre.diferencia), 0);
    console.log('PASS apertura → venta → reintento → crédito → cobro → devolución → cierre sin diferencias');

    const canalA = app.get(EventosService), canalB = otra.get(EventosService), pedidos = [];
    subscriptions.push(canalB.escuchar(empresa.id, 'PRUEBA').subscribe(e => pedidos.push(e)));
    await canalA.publicar(empresa.id, 'PRUEBA', { pedidoId: cobrada.id }, 10000);
    await esperar(() => pedidos.length === 1);
    assert.equal(pedidos[0].pedidoId, cobrada.id);
    const emisor = app.get(ImpresionEventosService), agente = otra.get(ImpresionEventosService), errores = [];
    let trabajos = 0;
    const consumir = trabajo => { trabajos++; void agente.confirmar(trabajo.id, true, undefined, empresa.id).catch(e => errores.push(e)); };
    subscriptions.push(emisor.paraEmpresa(empresa.id).subscribe({ next: consumir, error: e => errores.push(e) }));
    subscriptions.push(agente.paraEmpresa(empresa.id).subscribe({ next: consumir, error: e => errores.push(e) }));
    const resultado = await emisor.enviarYEsperar(empresa.id, 'TICKET', Buffer.from('prueba sin impresora física'), 5000);
    assert.equal(resultado.ok, true); assert.equal(trabajos, 1); assert.deepEqual(errores, []);
    console.log('PASS eventos y confirmación entre dos instancias; dos agentes reclaman un solo trabajo');
  } finally {
    subscriptions.forEach(s => s.unsubscribe());
    if (otra) await otra.close();
    if (app) await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

async function esperar(condicion) {
  const limite = Date.now() + 5000;
  while (!condicion()) {
    if (Date.now() > limite) throw Error('Se agotó la espera del evento compartido');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
