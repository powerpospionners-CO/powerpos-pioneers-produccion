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
    // El acceso de códigos nunca concede edición general del catálogo.
    const paula = await db.usuario.create({ data: { empresaId: empresa.id, sucursalId: sede.id, nombre: 'Cajera códigos prueba', email: `barras-${sufijo}@example.com`, password: await bcrypt.hash(password, 4), rol: 'CAJERO', permisos: { productos: false, pos: true } } });
    const ingresoPaula = (await http.post('/auth/login').send({ email: paula.email, password }).expect(201)).body;
    const sesionPaula = 'Bearer ' + ingresoPaula.access_token;
    await http.get('/acceso-barras/productos').set('Authorization', sesionPaula).expect(403);
    await http.post(`/acceso-barras/usuarios/${paula.id}`).set('Authorization', sesionPaula).send({ habilitado: true }).expect(403);
    const autorizacion = (await http.post(`/acceso-barras/usuarios/${paula.id}`).set('Authorization', token).send({ habilitado: true }).expect(201)).body;
    await http.post('/acceso-barras/desbloquear').set('Authorization', sesionPaula).send({ codigo: '00000000' }).expect(403);
    const acceso = (await http.post('/acceso-barras/desbloquear').set('Authorization', sesionPaula).send({ codigo: autorizacion.codigo }).expect(201)).body;
    const listadoBarras = (await http.get('/acceso-barras/productos').set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).expect(200)).body;
    assert(listadoBarras.productos.some(p => p.id === producto.id));
    assert(listadoBarras.productos.every(p => Object.keys(p).sort().join(',') === 'codigoBarras,codigosBarras,id,nombre,presentaciones'));
    await http.patch(`/acceso-barras/productos/${producto.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ codigoBarras: '7700000000001', anterior: null, precio: 1 }).expect(400);
    await http.patch(`/acceso-barras/productos/${producto.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ codigoBarras: '7700000000001', anterior: null }).expect(200);
    await http.patch(`/acceso-barras/productos/${producto.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ codigoBarras: '7700000000002', anterior: null }).expect(409);
    const otraEmpresa = await db.empresa.create({ data: { nombre: 'Otra empresa aislada', nit: 'otra-' + sufijo, email: `otra-${sufijo}@example.com` } });
    const categoriaAjena = await db.categoria.create({ data: { empresaId: otraEmpresa.id, nombre: 'Ajena' } });
    const productoAjeno = await db.producto.create({ data: { empresaId: otraEmpresa.id, categoriaId: categoriaAjena.id, nombre: 'Producto ajeno', precio: 5000 } });
    await http.patch(`/acceso-barras/productos/${productoAjeno.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ codigoBarras: '7700000000002', anterior: null }).expect(404);
    await db.auditoria.create({ data: { empresaId: otraEmpresa.id, entidad: 'ActividadSistema', accion: 'OPERACION', detalle: { marca: 'NO_DEBE_VERSE' } } });
    await http.patch(`/productos/${producto.id}`).set('Authorization', sesionPaula).send({ precio: 1 }).expect(403);
    assert.equal(Number((await db.producto.findUnique({ where: { id: producto.id } })).precio), 10000);
    const auditoria = (await http.get('/auditoria').set('Authorization', token).expect(200)).body;
    assert(auditoria.registros.some(r => r.detalle?.cambio?.nuevo === '7700000000001' && r.detalle?.actor?.id === paula.id));
    assert(!JSON.stringify(auditoria).includes(autorizacion.codigo));
    assert(!JSON.stringify(auditoria).includes(acceso.token));
    assert(!JSON.stringify(auditoria).includes('NO_DEBE_VERSE'));
    await http.get('/auditoria').set('Authorization', sesionPaula).expect(403);
    // Códigos por sabor completos no obligan a inventar un código del producto.
    const porSabor = await db.producto.create({ data: { empresaId: empresa.id, categoriaId: categoria.id, nombre: 'Refresco sabores', precio: 12000, stockActual: 19 } });
    const mango = await db.productoCodigoBarras.create({ data: { empresaId: empresa.id, productoId: porSabor.id, sabor: 'MANGO', codigoBarras: '7700000000010' } });
    const pendientesAntes = (await http.get('/acceso-barras/productos?sinCodigo=true').set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).expect(200)).body;
    assert(!pendientesAntes.productos.some(p => p.id === porSabor.id));
    const presentacion = await db.productoPresentacion.create({ data: { productoId: porSabor.id, nombre: 'Paquete', factorUnidades: 6, precio: 65000 } });
    const pendientesDespues = (await http.get('/acceso-barras/productos?sinCodigo=true').set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).expect(200)).body;
    const pendiente = pendientesDespues.productos.find(p => p.id === porSabor.id);
    assert(pendiente.presentaciones.some(p => p.id === presentacion.id && p.codigoBarras === null));
    assert(pendiente.codigosBarras.some(p => p.sabor === 'MANGO'));
    assert(!Object.hasOwn(pendiente.presentaciones[0], 'precio'));
    await http.patch(`/acceso-barras/productos/${producto.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ tipo: 'PRESENTACION', destinoId: presentacion.id, codigoBarras: '7700000000011', anterior: null }).expect(404);
    await http.patch(`/acceso-barras/productos/${porSabor.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ tipo: 'PRESENTACION', destinoId: presentacion.id, codigoBarras: '7700000000011', anterior: null, factorUnidades: 1 }).expect(400);
    await http.patch(`/acceso-barras/productos/${porSabor.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ tipo: 'PRESENTACION', destinoId: presentacion.id, codigoBarras: '7700000000011', anterior: null }).expect(200);
    await http.patch(`/acceso-barras/productos/${porSabor.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ tipo: 'SABOR', destinoId: mango.id, codigoBarras: '7700000000011', anterior: mango.codigoBarras }).expect(409);
    await http.patch(`/acceso-barras/productos/${porSabor.id}`).set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send({ tipo: 'SABOR', destinoId: mango.id, codigoBarras: '7700000000012', anterior: mango.codigoBarras }).expect(200);
    const presentacionGuardada = await db.productoPresentacion.findUnique({ where: { id: presentacion.id } });
    assert.equal(presentacionGuardada.factorUnidades, 6); assert.equal(Number(presentacionGuardada.precio), 65000);
    const productoSaboresGuardado = await db.producto.findUnique({ where: { id: porSabor.id } });
    assert.equal(productoSaboresGuardado.codigoBarras, null); assert.equal(productoSaboresGuardado.stockActual, 19);
    const pendientesFinal = (await http.get('/acceso-barras/productos?sinCodigo=true').set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).expect(200)).body;
    assert(!pendientesFinal.productos.some(p => p.id === porSabor.id));
    await http.post(`/acceso-barras/usuarios/${paula.id}`).set('Authorization', token).send({ habilitado: false }).expect(201);
    await http.get('/acceso-barras/productos').set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).expect(403);
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
    // Recaudo: solo se restan gastos marcados; ni costos contables ni gastos bancarios.
    const { rangoSemana, fechaBogota, sumarDias } = require('../dist/src/caja/calendario-caja');
    const hoy = fechaBogota(new Date());
    const lunesActual = sumarDias(hoy, -((new Date(hoy + 'T12:00:00Z').getUTCDay() + 6) % 7));
    const semana = sumarDias(lunesActual, -7), rango = rangoSemana(semana);
    const fechaGasto = new Date(rango.desde.getTime() + 3600000).toISOString();
    await db.empresa.update({ where: { id: empresa.id }, data: { recaudoEfectivoHabilitado: true } });
    await db.sucursal.update({ where: { id: sede.id }, data: { baseEfectivoCaja: 50000 } });
    await db.retiroEfectivoCaja.create({ data: { empresaId: empresa.id, sucursalId: sede.id, usuarioId: usuario.id, cajaId: caja.id, montoEsperado: 1000, montoRetirado: 1000, creadoEn: new Date(fechaGasto) } });
    const gastoMarcado = (await http.post('/financiero/movimiento').set('Authorization', token).send({ tipo: 'EGRESO', categoria: 'OTROS', descripcion: 'Gasto pagado del recaudo', monto: 200, fecha: fechaGasto, pagadoConRecaudo: true }).expect(201)).body;
    await http.post('/financiero/movimiento').set('Authorization', token).send({ tipo: 'EGRESO', categoria: 'OTROS', descripcion: 'Gasto pagado por banco', monto: 300, fecha: fechaGasto, pagadoConRecaudo: false }).expect(201);
    await http.post('/financiero/movimiento').set('Authorization', token).send({ tipo: 'EGRESO', categoria: 'COSTO_VENTA', descripcion: 'No es una salida de caja nueva', monto: 300, fecha: fechaGasto, pagadoConRecaudo: true }).expect(400);
    let recaudo = (await http.get('/caja/recaudo/semanal').query({ periodoInicio: semana }).set('Authorization', token).expect(200)).body;
    assert.equal(recaudo.gastosDelRecaudo, 200); assert.equal(recaudo.disponibleConsignar, 800);
    await http.patch(`/financiero/movimiento/${gastoMarcado.id}`).set('Authorization', token).send({ pagadoConRecaudo: false }).expect(200);
    recaudo = (await http.get('/caja/recaudo/semanal').query({ periodoInicio: semana }).set('Authorization', token).expect(200)).body;
    assert.equal(recaudo.gastosDelRecaudo, 0);
    await http.patch(`/financiero/movimiento/${gastoMarcado.id}`).set('Authorization', token).send({ pagadoConRecaudo: true }).expect(200);
    await http.post('/compras/saldo-inicial').set('Authorization', token).send({ monto: 10000 }).expect(201);
    await db.saldoInicialCuenta.update({ where: { empresaId: empresa.id }, data: { desde: rango.desde } });
    await http.post('/compras').set('Authorization', token).send({ categoria: 'SERVICIOS', descripcion: 'Servicio pagado del recaudo', monto: 50, fecha: fechaGasto, pagadoConRecaudo: true }).expect(201);
    recaudo = (await http.get('/caja/recaudo/semanal').query({ periodoInicio: semana }).set('Authorization', token).expect(200)).body;
    assert.equal(recaudo.gastosDelRecaudo, 250); assert.equal(recaudo.disponibleConsignar, 750); assert.equal(recaudo.gastos.length, 2);
    const consignacion = (await http.post('/caja/recaudo/consignar').set('Authorization', token).send({ periodoInicio: semana, montoConsignado: 750 }).expect(201)).body;
    assert.equal(consignacion.diferencia, 0); assert.equal(consignacion.efectivoRecaudado, 1000);
    // Cambios posteriores no reescriben el cálculo guardado al consignar.
    await http.patch(`/financiero/movimiento/${gastoMarcado.id}`).set('Authorization', token).send({ monto: 220 }).expect(200);
    recaudo = (await http.get('/caja/recaudo/semanal').query({ periodoInicio: semana }).set('Authorization', token).expect(200)).body;
    assert.equal(recaudo.gastosDelRecaudo, 270); assert.equal(recaudo.consignacion.esperadoAlRegistrar, 750); assert.equal(recaudo.consignacion.diferencia, 0);
    console.log('PASS recaudo menos gastos marcados, cambio de origen y cierre histórico conservado');
    // Acceso de la cajera: solo crear gastos, con código independiente y sin duplicar reintentos.
    const codigoGastos = (await http.post(`/acceso-gastos/usuarios/${paula.id}`).set('Authorization', token).send({ habilitado: true }).expect(201)).body.codigo;
    await http.post(`/acceso-gastos/usuarios/${paula.id}`).set('Authorization', sesionPaula).send({ habilitado: true }).expect(403);
    await http.post('/acceso-gastos/desbloquear').set('Authorization', sesionPaula).send({ codigo: codigoGastos === autorizacion.codigo ? '00000000' : autorizacion.codigo }).expect(403);
    const accesoGastos = (await http.post('/acceso-gastos/desbloquear').set('Authorization', sesionPaula).send({ codigo: codigoGastos }).expect(201)).body;
    const gastoPaula = { categoria: 'OTROS', descripcion: 'Transporte registrado por la cajera', monto: 25, fecha: fechaBogota(new Date(fechaGasto)), pagadoConRecaudo: true, clave: randomUUID() };
    await http.post('/acceso-gastos/registrar').set('Authorization', sesionPaula).set('X-Acceso-Barras', acceso.token).send(gastoPaula).expect(403);
    await http.post('/acceso-gastos/registrar').set('Authorization', sesionPaula).set('X-Acceso-Gastos', accesoGastos.token).send({ ...gastoPaula, empresaId: otraEmpresa.id }).expect(400);
    await http.post('/acceso-gastos/registrar').set('Authorization', sesionPaula).set('X-Acceso-Gastos', accesoGastos.token).send({ ...gastoPaula, categoria: 'COMPRA_MERCANCIA' }).expect(400);
    const [nuevoGasto, reintentoGasto] = await Promise.all([
      http.post('/acceso-gastos/registrar').set('Authorization', sesionPaula).set('X-Acceso-Gastos', accesoGastos.token).send(gastoPaula).expect(201),
      request(otra.getHttpServer()).post('/acceso-gastos/registrar').set('Authorization', sesionPaula).set('X-Acceso-Gastos', accesoGastos.token).send(gastoPaula).expect(201),
    ]);
    assert.equal(nuevoGasto.body.id, reintentoGasto.body.id);
    const gastoDb = await db.movimientoFinanciero.findUnique({ where: { id: nuevoGasto.body.id } });
    assert.equal(gastoDb.usuarioId, paula.id); assert.equal(gastoDb.empresaId, empresa.id); assert.equal(gastoDb.sucursalId, sede.id); assert.equal(gastoDb.tipo, 'EGRESO');
    assert.equal(await db.movimientoFinanciero.count({ where: { empresaId: empresa.id, descripcion: gastoPaula.descripcion } }), 1);
    await http.post('/acceso-gastos/registrar').set('Authorization', sesionPaula).set('X-Acceso-Gastos', accesoGastos.token).send({ ...gastoPaula, monto: 99 }).expect(409);
    await http.get('/financiero/movimientos').set('Authorization', sesionPaula).expect(403);
    await http.patch(`/financiero/movimiento/${gastoDb.id}`).set('Authorization', sesionPaula).send({ monto: 1 }).expect(403);
    const recauPaula = (await http.get('/caja/recaudo/semanal').query({ periodoInicio: semana }).set('Authorization', token).expect(200)).body;
    assert.equal(recauPaula.gastosDelRecaudo, 295);
    const auditGastos = (await http.get('/auditoria').set('Authorization', token).expect(200)).body;
    assert(auditGastos.registros.some(r => r.detalle?.actor?.id === paula.id && r.detalle?.cambio?.gasto?.id === gastoDb.id && r.detalle.cambio.gasto.pagadoConRecaudo === true));
    assert(!JSON.stringify(auditGastos).includes(codigoGastos)); assert(!JSON.stringify(auditGastos).includes(accesoGastos.token));
    await http.post(`/acceso-gastos/usuarios/${paula.id}`).set('Authorization', token).send({ habilitado: false }).expect(201);
    await http.post('/acceso-gastos/registrar').set('Authorization', sesionPaula).set('X-Acceso-Gastos', accesoGastos.token).send({ ...gastoPaula, clave: randomUUID() }).expect(403);
    console.log('PASS cajera registra un gasto, reintento entre instancias no duplica, auditoría y recaudo correctos, revocación inmediata');

    // Conversión histórica de kilos a gramos en ambos motores, sin tocar caja ni stock.
    const maiz = await db.producto.create({ data: { empresaId: empresa.id, categoriaId: categoria.id, nombre: 'Maíz prueba por gramo', precio: 20, costo: 12000, ventaGranel: true, unidadGranel: 'kg', controlaStock: true, stockActual: 1000 } });
    const ventaMaiz = await db.pedido.create({ data: { sucursalId: sede.id, usuarioId: usuario.id, numero: 'COSTO-'+sufijo, subtotal: 13160, total: 13160, costoVentaHistorico: 7896000, detalles: { create: [{ productoId: maiz.id, cantidad: 658, precioUnitario: 20, subtotal: 13160, exclusiones: [], costoVentaHistorico: 7896000 }] } } });
    const costoMaiz = await db.movimientoFinanciero.create({ data: { empresaId: empresa.id, sucursalId: sede.id, usuarioId: usuario.id, pedidoId: ventaMaiz.id, tipo: 'EGRESO', categoria: 'COSTO_VENTA', monto: 7896000, descripcion: 'Costo prueba' } });
    const conversion = { productoId: maiz.id, costoRegistrado: 12000 };
    await http.post('/financiero/corregir-costo-granel').set('Authorization', sesionPaula).send(conversion).expect(403);
    const vistaCosto = (await http.post('/financiero/corregir-costo-granel').set('Authorization', token).send(conversion).expect(201)).body;
    assert.equal(vistaCosto.ajustes[0].costoCorregido, 7896);
    assert.equal(Number((await db.producto.findUnique({where:{id:maiz.id}})).costo),12000);
    await http.post('/financiero/corregir-costo-granel').set('Authorization', token).send({...conversion,aplicar:true}).expect(201);
    const maizCorregido = await db.producto.findUnique({where:{id:maiz.id}});
    assert.equal(Number(maizCorregido.costo),12); assert.equal(Number(maizCorregido.precio),20); assert.equal(maizCorregido.stockActual,1000);
    assert.equal(Number((await db.movimientoFinanciero.findUnique({where:{id:costoMaiz.id}})).monto),7896);
    const repetidaCosto = (await http.post('/financiero/corregir-costo-granel').set('Authorization', token).send({...conversion,aplicar:true}).expect(201)).body;
    assert.equal(repetidaCosto.yaAplicada,true);
    const estados = (await http.get('/financiero/estados').set('Authorization',token).expect(200)).body;
    assert(!estados.flujo.categorias.some(c=>c.categoria==='COSTO_VENTA'));
    assert.equal(typeof estados.resultado.ventasNetas,'number'); assert.equal(typeof estados.balance.inventario,'number');
    console.log('PASS corrección histórica auditada e idempotente, permisos y estados financieros sin duplicar costo en caja');

    const cajaParcial = (await http.post('/caja/abrir').set('Authorization',token).send({montoInicial:50000}).expect(201)).body;
    const mercanciaParcial = await db.producto.create({data:{empresaId:empresa.id,categoriaId:categoria.id,nombre:'Mercancía abono parcial',precio:172000,costo:100000,controlaStock:true,stockActual:5}});
    const solicitudParcial={sucursalId:sede.id,claveIdempotencia:randomUUID(),clienteId:cliente.id,condicionPago:'CREDITO',vencimientoCredito:'2099-01-01',items:[{productoId:mercanciaParcial.id,cantidad:1}],pagos:[{metodoPago:'NEQUI',monto:31400},{metodoPago:'EFECTIVO',monto:90600}]};
    const respuestaParcial=await http.post('/pedidos').set('Authorization',token).send(solicitudParcial);
    assert.equal(respuestaParcial.status,201,JSON.stringify(respuestaParcial.body));
    const parcial=respuestaParcial.body;
    assert.equal(Number(parcial.cuentaCredito.saldo),50000);assert.equal(parcial.abonosCredito.length,2);
    const parcialRepetida=(await http.post('/pedidos').set('Authorization',token).send(solicitudParcial).expect(201)).body;
    assert.equal(parcialRepetida.id,parcial.id);assert.equal(Number(parcialRepetida.cuentaCredito.saldo),50000);
    assert.equal(await db.abonoAdministrativo.count({where:{cuentaId:parcial.cuentaCredito.id}}),2);
    assert.equal(await db.operacionVentaCaja.count({where:{pedidoId:parcial.id,tipo:'COBRO_CREDITO'}}),2);
    assert.equal((await db.producto.findUnique({where:{id:mercanciaParcial.id}})).stockActual,4);
    const movimientosParciales=await db.movimientoFinanciero.findMany({where:{pedidoId:parcial.id,tipo:'INGRESO'}});
    assert.equal(movimientosParciales.reduce((s,m)=>s+Number(m.monto),0),122000);
    const respuestaCierreParcial=await http.post(`/caja/${cajaParcial.id}/cerrar`).set('Authorization',token).send({montoFinal:140600,montoRetirado:0});
    assert.equal(respuestaCierreParcial.status,201,JSON.stringify(respuestaCierreParcial.body));
    const cierreParcial=respuestaCierreParcial.body;
    assert.equal(Number(cierreParcial.totalEfectivo),90600);assert.equal(Number(cierreParcial.diferencia),0);
    console.log('PASS venta 172000 con abonos Nequi 31400 y efectivo 90600, saldo 50000, reintento único y caja sin diferencias');

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
    assert.equal(resultado.ok, true, JSON.stringify({ resultado, trabajos, errores: errores.map(e => String(e.message || e).slice(0, 2000)) })); assert.equal(trabajos, 1); assert.deepEqual(errores, []);
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
