/* Exclusivamente bases efímeras. Nunca carga .env ni envía correos reales. */
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const raw = process.env.POS_TEST_DATABASE_URL;
if (!raw) throw Error('Falta POS_TEST_DATABASE_URL');
const url = new URL(raw),
  mysql = url.protocol === 'mysql:';
if (
  url.hostname !== '127.0.0.1' ||
  url.pathname !== '/powerpos_pos_test' ||
  url.port !== (mysql ? '55440' : '55439') ||
  (!mysql && !['postgres:', 'postgresql:'].includes(url.protocol))
)
  throw Error('Solo se permiten las bases efímeras locales de CI');
Object.assign(process.env, {
  DATABASE_URL: raw,
  DATABASE_ENGINE: mysql ? 'mysql' : 'postgresql',
  JWT_SECRET: 'solo-pruebas-locales-personal-no-produccion',
  BACKGROUND_JOBS_ENABLED: 'false',
  EVENTOS_COMPARTIDOS: 'true',
  ESC_POS_ENABLED: 'false',
  PERSONAL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
require('reflect-metadata');
const { Test } = require('@nestjs/testing'),
  request = require('supertest'),
  bcrypt = require('bcrypt');
const { AppModule } = require('../dist/src/app.module'),
  { PrismaService } = require('../dist/src/prisma/prisma.service'),
  { PersonalService } = require('../dist/src/personal/personal.service'),
  {
    NotificacionesService,
  } = require('../dist/src/notificaciones/notificaciones.service'),
  { ImpresionService } = require('../dist/src/impresion/impresion.service');
(async () => {
  let app;
  try {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificacionesService)
      .useValue({ enviarAlerta: async () => ({ enviado: false }) })
      .overrideProvider(ImpresionService)
      .useValue({ imprimirCierreCaja: async () => ({ impreso: false }) })
      .compile();
    app = module.createNestApplication();
    await app.init();
    const db = app.get(PrismaService),
      personal = app.get(PersonalService),
      http = request(app.getHttpServer()),
      sent = [];
    personal.enviar = async (to, subject, text, attachments) => {
      sent.push({ to, subject, text, attachments });
    };
    const suffix = randomUUID(),
      password = 'ClavePruebaPersonal123*';
    async function empresa(nombre) {
      const e = await db.empresa.create({
          data: {
            nombre,
            nit: randomUUID(),
            direccion: 'Dirección ficticia de prueba',
            email: `${randomUUID()}@example.com`,
            tipoNegocio: 'TIENDA',
            plan: 'PREMIUM',
            pagoExonerado: true,
          },
        }),
        s = await db.sucursal.create({
          data: { empresaId: e.id, nombre: 'Sede de prueba' },
        }),
        u = await db.usuario.create({
          data: {
            empresaId: e.id,
            sucursalId: s.id,
            nombre: 'Administrador ficticio',
            email: `${randomUUID()}@example.com`,
            password: await bcrypt.hash(password, 4),
            rol: 'ADMIN_EMPRESA',
          },
        });
      const login = await http
        .post('/auth/login')
        .send({ email: u.email, password })
        .expect(201);
      return { e, s, u, token: 'Bearer ' + login.body.access_token };
    }
    const a = await empresa('Personal pruebas ' + suffix),
      b = await empresa('Otra empresa ' + suffix);
    const auth = (r, t = a.token) => r.set('Authorization', t);
    const cajero = await db.usuario.create({
      data: {
        empresaId: a.e.id,
        sucursalId: a.s.id,
        nombre: 'Cajero ficticio',
        email: randomUUID() + '@example.com',
        password: await bcrypt.hash(password, 4),
        rol: 'CAJERO',
      },
    });
    const ct = (
      await http
        .post('/auth/login')
        .send({ email: cajero.email, password })
        .expect(201)
    ).body.access_token;
    await auth(http.get('/personal'), 'Bearer ' + ct).expect(403);
    // Simular una sede recién desplegada, exclusivamente en la base efímera.
    assert.equal(
      await db.personalRegistro.count(),
      0,
      'La tabla de prueba debe estar vacía antes del ensayo de primer uso',
    );
    await db.$executeRawUnsafe('DROP TABLE personal_registros');
    await http
      .post(`/personal-firma/${a.e.id}/${a.s.id}/vista`)
      .send({ token: '0'.repeat(64) })
      .expect(403);
    await auth(http.get('/personal')).expect(200);
    await auth(http.post('/personal/configuracion'))
      .send({
        responsable: 'Empresa de prueba',
        correo: 'responsable@example.com',
        politica:
          'Aviso de privacidad de prueba: atención, finalidades laborales, copias y conservación.',
        acepta: true,
      })
      .expect(201);
    const empleado = (
      await auth(http.post('/personal/empleados'))
        .send({
          nombre: 'Empleado de prueba privado',
          identificacion: suffix,
          cargo: 'Auxiliar',
          email: 'empleado@example.com',
          ingreso: '2026-01-01',
          salario: '2000000',
          frecuencia: 'QUINCENAL',
          activo: true,
        })
        .expect(201)
    ).body;
    const cifrado = await db.personalRegistro.findUnique({
      where: { id: empleado.id },
    });
    assert(!JSON.stringify(cifrado).includes('Empleado de prueba privado'));
    await auth(http.patch('/personal/empleados/' + empleado.id), b.token)
      .send({ ...empleado.datos, salario: '2000000' })
      .expect(404);
    const periodo = (
      await auth(http.post('/personal/periodos'))
        .send({
          empleadoId: empleado.id,
          desde: '2026-11-01',
          hasta: '2026-11-15',
          fechaProgramada: '2026-11-16',
          revisado: true,
          conceptos: [
            {
              tipo: 'DEVENGADO',
              nombre: 'Salario quincenal revisado',
              monto: '1000000',
            },
          ],
        })
        .expect(201)
    ).body;
    await auth(http.post('/personal/periodos'))
      .send({
        empleadoId: empleado.id,
        desde: '2026-11-14',
        hasta: '2026-11-20',
        fechaProgramada: '2026-11-21',
        revisado: true,
        conceptos: [{ tipo: 'DEVENGADO', nombre: 'Duplicado', monto: '1000' }],
      })
      .expect(400);
    const body = {
      periodoId: periodo.id,
      idempotencia: randomUUID(),
      monto: '400000',
      fechaPago: '2026-11-16',
      medio: 'EFECTIVO',
    };
    const [p1, p2] = await Promise.all([
      auth(http.post('/personal/pagos')).send(body).expect(201),
      auth(http.post('/personal/pagos')).send(body).expect(201),
    ]);
    assert.equal(p1.body.id, p2.body.id);
    const pago = p1.body;
    assert.equal(
      await db.movimientoFinanciero.count({
        where: { empresaId: a.e.id, categoria: 'NOMINA' },
      }),
      1,
    );
    await auth(http.patch('/financiero/movimiento/' + pago.datos.movimientoId))
      .send({ monto: 1 })
      .expect(403);
    await auth(
      http.delete('/financiero/movimiento/' + pago.datos.movimientoId),
    ).expect(403);
    await auth(http.post('/personal/pagos'))
      .send({ ...body, monto: '400001' })
      .expect(400);
    const excesos = await Promise.all([
      auth(http.post('/personal/pagos')).send({
        ...body,
        idempotencia: randomUUID(),
        monto: '500000',
      }),
      auth(http.post('/personal/pagos')).send({
        ...body,
        idempotencia: randomUUID(),
        monto: '500000',
      }),
    ]);
    assert.deepEqual(excesos.map((r) => r.status).sort(), [201, 400]);
    await auth(http.get(`/personal/${pago.id}/documento`), b.token).expect(404);
    await auth(http.post(`/personal/${pago.id}/invitar`)).expect(201);
    const invitation = sent
      .at(-1)
      .text.match(/#empresa=(\d+)&sede=(\d+)&token=([a-f0-9]{64})/);
    assert(invitation);
    const token = invitation[3],
      ruta = `/personal-firma/${a.e.id}/${a.s.id}`;
    await http
      .post(`/personal-firma/${b.e.id}/${b.s.id}/codigo`)
      .send({ token })
      .expect(403);
    await http
      .post(ruta + '/vista')
      .send({ token })
      .expect(403);
    await http
      .post(ruta + '/codigo')
      .send({ token })
      .expect(201);
    const codigo = sent.at(-1).text.match(/código es (\d{8})/)[1];
    await http
      .post(ruta + '/codigo')
      .send({ token })
      .expect(400);
    for (let n = 0; n < 5; n++)
      await http
        .post(ruta + '/verificar')
        .send({
          token,
          codigo: codigo === '00000000' ? '11111111' : '00000000',
        })
        .expect(403);
    await http
      .post(ruta + '/verificar')
      .send({ token, codigo })
      .expect(403);
    // Otra invitación, no se cambia el documento ni se salta el bloqueo del código anterior.
    await auth(http.post(`/personal/${pago.id}/invitar`)).expect(201);
    const nuevoToken = sent.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
    await http
      .post(ruta + '/codigo')
      .send({ token: nuevoToken })
      .expect(201);
    const codigo2 = sent.at(-1).text.match(/código es (\d{8})/)[1],
      verificado = (
        await http
          .post(ruta + '/verificar')
          .send({ token: nuevoToken, codigo: codigo2 })
          .expect(201)
      ).body;
    await http
      .post(ruta + '/verificar')
      .send({ token: nuevoToken, codigo: codigo2 })
      .expect(403);
    const cred = { token: nuevoToken, sesion: verificado.sesion };
    const vista = (
      await http
        .post(ruta + '/vista')
        .send(cred)
        .expect(201)
    ).body;
    assert.equal(vista.documento.id, pago.id);
    assert(!JSON.stringify(vista).includes('codigoHash'));
    const actor = { id: a.u.id, empresaId: a.e.id, sucursalId: a.s.id };
    let invitacionActual = await personal.acceso(actor, nuevoToken);
    await personal.store.actualizar(
      actor,
      invitacionActual,
      { ...invitacionActual.datos, sesionVence: Date.now() - 1000 },
      invitacionActual.estado,
    );
    await http
      .post(ruta + '/vista')
      .send(cred)
      .expect(403);
    invitacionActual = await personal.acceso(actor, nuevoToken);
    await personal.store.actualizar(
      actor,
      invitacionActual,
      { ...invitacionActual.datos, sesionVence: Date.now() + 300000 },
      invitacionActual.estado,
    );
    const confirmar = {
      ...cred,
      acepta: true,
      politica: true,
      copiaCorreo: true,
    };
    personal.enviar = async (to, subject, text, attachments) => {
      if (attachments) throw Error('Fallo SMTP simulado');
      sent.push({ to, subject, text, attachments });
    };
    const resultadoFirma = (
      await http
        .post(ruta + '/resolver')
        .send(confirmar)
        .expect(201)
    ).body;
    assert.equal(resultadoFirma.copiaEntregada, false);
    personal.enviar = async (to, subject, text, attachments) => {
      sent.push({ to, subject, text, attachments });
    };
    await auth(http.post(`/personal/${pago.id}/copia`)).expect(201);
    await http
      .post(ruta + '/resolver')
      .send(confirmar)
      .expect(400);
    const final = (await auth(http.get('/personal')).expect(200)).body;
    assert.equal(
      final.pagos.find((p) => p.id === pago.id).estado,
      'RECIBIDO_FIRMADO',
    );
    assert(sent.at(-1).attachments[0].content.length > 100);
    await http
      .post(ruta + '/paquete')
      .send(cred)
      .expect(201);
    const otroPago = excesos.find((r) => r.status === 201).body;
    await auth(http.post(`/personal/${otroPago.id}/invitar`)).expect(201);
    const tokenReclamo = sent.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
    await http
      .post(ruta + '/codigo')
      .send({ token: tokenReclamo })
      .expect(201);
    const codigoReclamo = sent.at(-1).text.match(/código es (\d{8})/)[1];
    const sesionReclamo = (
      await http
        .post(ruta + '/verificar')
        .send({ token: tokenReclamo, codigo: codigoReclamo })
        .expect(201)
    ).body.sesion;
    await http
      .post(ruta + '/vista')
      .send({ token: tokenReclamo, sesion: sesionReclamo })
      .expect(201);
    await http
      .post(ruta + '/resolver')
      .send({
        token: tokenReclamo,
        sesion: sesionReclamo,
        acepta: true,
        politica: true,
        copiaCorreo: true,
        reclamo: 'No recibí el abono registrado',
      })
      .expect(201);
    const reclamoGuardado = (
      await auth(http.get(`/personal/${otroPago.id}/historial`)).expect(200)
    ).body;
    assert.equal(reclamoGuardado.reclamos.length, 1);
    assert.equal(reclamoGuardado.firmas.length, 0);
    assert.equal(
      (await personal.store.obtener(actor, otroPago.id)).estado,
      'EN_REVISION',
    );
    const plantillaPdf = Buffer.from(
      '%PDF-1.4\nPDF ficticio solo para pruebas de integridad\n%%EOF',
    );
    const file = (
      await auth(http.post('/personal/archivos'))
        .attach('archivo', plantillaPdf, 'plantilla.pdf')
        .expect(201)
    ).body;
    assert(!Object.hasOwn(file, 'contenido'));
    await auth(http.post('/personal/plantillas'))
      .send({
        nombre: 'Sin revisión',
        archivoId: file.id,
        revisada: false,
        revisadaEn: '2026-11-01',
      })
      .expect(400);
    const plantilla = (
      await auth(http.post('/personal/plantillas'))
        .send({
          nombre: 'Revisada',
          archivoId: file.id,
          revisada: true,
          revisadaPor: 'Asesor ficticio',
          revisadaEn: '2026-11-01',
          alcance: 'Solo prueba',
        })
        .expect(201)
    ).body;
    const datosContrato = {
      empleadoId: empleado.id,
      plantillaId: plantilla.id,
      archivoId: file.id,
      tipo: 'FIJO',
      inicio: '2026-01-01',
      fin: '2031-01-02',
      funciones: 'Funciones ficticias',
      lugar: 'Sede de prueba',
      salario: '2000000',
      revisadaPor: 'Asesor ficticio',
      revisado: true,
    };
    await auth(http.post('/personal/contratos'))
      .send(datosContrato)
      .expect(400);
    const contrato = (
      await auth(http.post('/personal/contratos'))
        .send({ ...datosContrato, tipo: 'INDEFINIDO', fin: undefined })
        .expect(201)
    ).body;
    await auth(http.post(`/personal/${contrato.id}/invitar`)).expect(400);
    await auth(http.post(`/personal/${contrato.id}/firma-empleador`))
      .send({
        password: 'incorrecta',
        acepta: true,
        nombre: 'Representante',
        identificacion: '123',
        facultad: 'Representante legal',
      })
      .expect(403);
    await auth(http.post(`/personal/${contrato.id}/firma-empleador`))
      .send({
        password,
        acepta: true,
        nombre: 'Representante',
        identificacion: '123',
        facultad: 'Representante legal',
      })
      .expect(201);
    assert.equal(
      (await auth(http.get(`/personal/${contrato.id}/historial`)).expect(200))
        .body.firmas[0].datos.calidad,
      'EMPLEADOR',
    );
    // Creación íntegra del contrato desde el editor, con versión y original inmutable.
    const contenidoEditor = {
      razonSocial: 'Empleador legal ficticio SAS',
      empleadoId: empleado.id,
      tipo: 'INDEFINIDO',
      inicio: '2026-11-23',
      domicilioEmpleado: 'Domicilio ficticio del trabajador',
      domicilioEmpresa: 'Domicilio ficticio del empleador',
      lugarCelebracion: 'Pereira',
      lugarContratacion: 'Pereira',
      lugarServicio: 'Sede de prueba',
      cargo: 'Auxiliar',
      funciones: 'Funciones de prueba',
      salario: '2000000',
      frecuencia: 'QUINCENAL',
      formaPago: 'Transferencia autorizada',
      jornada: 'Jornada revisada por el asesor',
      descansos: 'Descansos y turnos revisados',
      especieMonto: '0',
      terminacion: 'Causales y procedimientos legales aplicables',
      clausulas: [
        { titulo: 'Partes', contenido: '{{empresa}} y {{empleado}}' },
      ],
      anexos: [{ titulo: 'Funciones', contenido: 'Anexo de texto de prueba' }],
    };
    await auth(http.get('/personal/editor'), 'Bearer ' + ct).expect(403);
    let borrador = (
      await auth(http.post('/personal/editor/borradores'))
        .send(contenidoEditor)
        .expect(201)
    ).body;
    await auth(
      http.get(`/personal/editor/borradores/${borrador.id}/pdf`),
      b.token,
    ).expect(404);
    await auth(http.post(`/personal/editor/borradores/${borrador.id}/emitir`))
      .send({ versionEsperada: borrador.version, acepta: true })
      .expect(409);
    const revisionEditor = {
      revisadaPor: 'Asesor ficticio',
      revisadaEn: '2026-11-23',
      alcance:
        'Datos, modalidad, jornada, salario, cláusulas y anexos revisados.',
      acepta: true,
    };
    borrador = (
      await auth(
        http.post(`/personal/editor/borradores/${borrador.id}/revisar`),
      )
        .send({ ...revisionEditor, versionEsperada: borrador.version })
        .expect(201)
    ).body;
    const versionRevisada = borrador.version;
    borrador = (
      await auth(http.patch(`/personal/editor/borradores/${borrador.id}`))
        .send({
          ...contenidoEditor,
          funciones: 'Funciones corregidas',
          versionEsperada: versionRevisada,
        })
        .expect(200)
    ).body;
    assert.equal(borrador.estado, 'BORRADOR');
    assert(!borrador.datos.revision);
    await auth(http.post(`/personal/editor/borradores/${borrador.id}/emitir`))
      .send({ versionEsperada: versionRevisada, acepta: true })
      .expect(409);
    await auth(http.patch(`/personal/editor/borradores/${borrador.id}`))
      .send({ ...contenidoEditor, versionEsperada: versionRevisada })
      .expect(409);
    borrador = (
      await auth(
        http.post(`/personal/editor/borradores/${borrador.id}/revisar`),
      )
        .send({ ...revisionEditor, versionEsperada: borrador.version })
        .expect(201)
    ).body;
    await auth(http.patch(`/personal/empleados/${empleado.id}`))
      .send({
        ...empleado.datos,
        salario: '2000000',
        cargo: 'Auxiliar actualizado',
      })
      .expect(200);
    await auth(http.post(`/personal/editor/borradores/${borrador.id}/emitir`))
      .send({ versionEsperada: borrador.version, acepta: true })
      .expect(409);
    borrador = (
      await auth(http.patch(`/personal/editor/borradores/${borrador.id}`))
        .send({ ...contenidoEditor, versionEsperada: borrador.version })
        .expect(200)
    ).body;
    borrador = (
      await auth(
        http.post(`/personal/editor/borradores/${borrador.id}/revisar`),
      )
        .send({ ...revisionEditor, versionEsperada: borrador.version })
        .expect(201)
    ).body;
    await auth(
      http.get(`/personal/editor/borradores/${borrador.id}/versiones/1/pdf`),
    ).expect(200);
    const bytesRevisados = await app
      .get(
        require('../dist/src/personal/contrato-editor.service')
          .ContratoEditorService,
      )
      .originalRevisado(actor, borrador.id);
    const [emitido1, emitido2] = await Promise.all([
      auth(http.post(`/personal/editor/borradores/${borrador.id}/emitir`))
        .send({ versionEsperada: borrador.version, acepta: true })
        .expect(201),
      auth(http.post(`/personal/editor/borradores/${borrador.id}/emitir`))
        .send({ versionEsperada: borrador.version, acepta: true })
        .expect(201),
    ]);
    assert.equal(emitido1.body.id, emitido2.body.id);
    assert.equal(emitido1.body.estado, 'PENDIENTE_EMPLEADOR');
    assert.equal(
      emitido1.body.datos.empresa.nombreLegal,
      'Empleador legal ficticio SAS',
    );
    assert.notEqual(
      emitido1.body.datos.empresa.nombre,
      emitido1.body.datos.empresa.nombreLegal,
    );
    assert.deepEqual(
      await personal.original(actor, emitido1.body.id),
      bytesRevisados,
    );
    await auth(http.patch(`/personal/editor/borradores/${borrador.id}`))
      .send({ ...contenidoEditor, versionEsperada: borrador.version })
      .expect(400);
    assert(
      (
        await auth(
          http.get(`/personal/editor/borradores/${borrador.id}/historial`),
        ).expect(200)
      ).body.length >= 3,
    );
    console.log(
      `Personal: aislamiento, cifrado, pagos concurrentes e idempotentes, evidencia financiera protegida, OTP, copias y contratos revisados OK (${mysql ? 'MariaDB' : 'PostgreSQL'}).`,
    );
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
