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
    const plantillaEmpresa = {
      tipo: 'POLITICA',
      nombre: 'Política laboral ficticia',
      versionEtiqueta: '1.0',
      responsable: 'Empresa de prueba',
      nit: '123-prueba',
      correo: 'responsable@example.com',
      telefono: '000-prueba',
      direccion: 'Dirección ficticia',
      domicilio: 'Pereira de prueba',
      contenido:
        'Contenido completo de política ficticia de prueba. Canales y procedimientos revisados.',
    };
    await http.get('/personal/documentos-empresa').expect(401);
    await auth(http.get('/personal/documentos-empresa'), 'Bearer ' + ct).expect(
      403,
    );
    const politicaEmpresa = (
      await auth(http.post('/personal/documentos-empresa'))
        .send(plantillaEmpresa)
        .expect(201)
    ).body;
    const enlacePublico = `/personal-politicas/${a.e.id}/${a.s.id}/${politicaEmpresa.id}`;
    await http.get(enlacePublico).expect(404);
    await auth(
      http.get(`/personal/documentos-empresa/${politicaEmpresa.id}/pdf`),
      b.token,
    ).expect(404);
    await auth(
      http.post(`/personal/documentos-empresa/${politicaEmpresa.id}/adoptar`),
    )
      .send({
        vigencia: '2026-01-01',
        revisadaPor: 'Revisor ficticio',
        acepta: true,
        publicar: true,
      })
      .expect(201);
    const publica = await http.get(enlacePublico).expect(200);
    assert.match(publica.headers['content-type'], /application\/pdf/);
    assert.match(publica.headers['cache-control'], /no-store/);
    assert.equal(publica.body.subarray(0, 5).toString(), '%PDF-');
    await auth(
      http.post(`/personal/documentos-empresa/${politicaEmpresa.id}/adoptar`),
    )
      .send({
        vigencia: '2026-01-01',
        revisadaPor: 'Revisor ficticio',
        acepta: true,
      })
      .expect(400);
    await auth(http.post('/personal/documentos-empresa'))
      .send({
        ...plantillaEmpresa,
        versionEtiqueta: '2.0',
        anteriorId: politicaEmpresa.id,
        contenido: 'Nueva versión privada ficticia.',
      })
      .expect(201);
    const modeloEmpresa = (
      await auth(http.post('/personal/documentos-empresa'))
        .send({
          ...plantillaEmpresa,
          tipo: 'CONTRATO',
          nombre: 'Modelo de auxiliar ficticio',
          contenido: 'Prestaciones legales y derechos mínimos de {{empleado}}.',
        })
        .expect(201)
    ).body;
    const modelosBiblioteca = (
      await auth(http.get('/personal/editor')).expect(200)
    ).body.modelos;
    assert(
      modelosBiblioteca.some(
        (m) => m.datos.documentoEmpresaId === modeloEmpresa.id,
      ),
    );
    await auth(http.post('/personal/configuracion'))
      .send({
        politicaId: politicaEmpresa.id,
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
    await auth(
      http.post(`/personal/documentos-empresa/${politicaEmpresa.id}/entregas`),
    )
      .send({
        empleadoId: empleado.id,
        fecha: '2026-01-02',
        medio: 'PAPEL',
        confirmado: true,
      })
      .expect(201);
    const biblioteca = (
      await auth(http.get('/personal/documentos-empresa')).expect(200)
    ).body;
    assert.equal(biblioteca.entregas[0].datos.politicaId, politicaEmpresa.id);
    assert.match(biblioteca.entregas[0].datos.alcance, /no equivale a firma/);
    await auth(
      http.post(
        `/personal/documentos-empresa/${politicaEmpresa.id}/retirar-enlace`,
      ),
    ).expect(201);
    await http.get(enlacePublico).expect(404);
    await auth(
      http.get(`/personal/documentos-empresa/${politicaEmpresa.id}/pdf`),
    ).expect(200);
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
    assert(sent.at(-1).text.includes('versión 1.0'));
    const politicaAdjunta = sent
      .at(-1)
      .attachments.find((a) => a.filename === 'politica-tratamiento-datos.pdf');
    assert.equal(politicaAdjunta.content.subarray(0, 5).toString(), '%PDF-');
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
    assert.equal(vista.politica.completa.versionEtiqueta, '1.0');
    await http
      .post(ruta + '/politica')
      .send({ token: nuevoToken })
      .expect(403);
    const copiaPolitica = await http
      .post(ruta + '/politica')
      .send(cred)
      .expect(201);
    assert.equal(copiaPolitica.body.subarray(0, 5).toString(), '%PDF-');
    console.log(
      'PASS políticas: versiones inmutables, aislamiento, publicación y retiro explícitos, entrega sin firma y acceso privado OTP',
    );
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
    // Tres modalidades y envío al firmar: solo datos ficticios en bases efímeras.
    const hoyAuto = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Bogota',
    });
    const finAuto = new Date(hoyAuto + 'T12:00:00Z');
    finAuto.setUTCMonth(finAuto.getUTCMonth() + 1);
    const perfilAuto = {
      ...contenidoEditor,
      perfilCargo: 'Auxiliar ficticio',
      clausulas: undefined,
      anexos: undefined,
      aplicarATodas: true,
    };
    const basesAuto = (
      await auth(http.post('/personal/editor/plantillas-modalidad'))
        .send(perfilAuto)
        .expect(201)
    ).body;
    assert.equal(basesAuto.length, 3);
    assert.deepEqual(basesAuto.map((p) => p.datos.tipo).sort(), [
      'FIJO',
      'INDEFINIDO',
      'OBRA_LABOR',
    ]);
    const empleadoAuto = (
      await auth(http.post('/personal/empleados'))
        .send({
          nombre: 'Empleado automático ficticio',
          identificacion: randomUUID(),
          cargo: 'Auxiliar ficticio',
          email: 'automatico@example.com',
          ingreso: hoyAuto,
          salario: '1750905',
          frecuencia: 'QUINCENAL',
          activo: true,
          domicilio: 'Domicilio privado ficticio',
          funciones: 'Funciones del expediente con atención de clientes.',
        })
        .expect(201)
    ).body;
    await auth(http.post('/personal/editor/preparar'), b.token)
      .send({ empleadoId: empleadoAuto.id, plantillaId: basesAuto[0].id })
      .expect(404);
    await auth(http.post('/personal/editor/preparar'), 'Bearer ' + ct)
      .send({ empleadoId: empleadoAuto.id, plantillaId: basesAuto[0].id })
      .expect(403);
    for (const tipoAuto of ['INDEFINIDO', 'FIJO', 'OBRA_LABOR']) {
      const pAuto = basesAuto.find((p) => p.datos.tipo === tipoAuto);
      const solicitudAuto = {
        empleadoId: empleadoAuto.id,
        plantillaId: pAuto.id,
        fin: finAuto.toISOString().slice(0, 10),
        obra: 'Ejecutar el inventario inicial del nuevo local hasta entregar el acta de verificación.',
        salario: '1',
        nombre: 'Nombre que no debe usarse',
      };
      if (tipoAuto === 'FIJO')
        await auth(http.post('/personal/editor/preparar'))
          .send({ ...solicitudAuto, fin: undefined })
          .expect(400);
      if (tipoAuto === 'OBRA_LABOR')
        await auth(http.post('/personal/editor/preparar'))
          .send({ ...solicitudAuto, obra: 'Cajero' })
          .expect(400);
      let automatico = (
        await auth(http.post('/personal/editor/preparar'))
          .send(solicitudAuto)
          .expect(201)
      ).body;
      assert.equal(automatico.datos.empleado.nombre, empleadoAuto.datos.nombre);
      assert.equal(automatico.datos.salarioCentavos, 175090500);
      assert.equal(automatico.datos.funciones, empleadoAuto.datos.funciones);
      assert.equal(automatico.datos.plantillaModalidadId, pAuto.id);
      await auth(
        http.get(`/personal/editor/borradores/${automatico.id}/pdf`),
      ).expect(200);
      automatico = (
        await auth(
          http.post(`/personal/editor/borradores/${automatico.id}/revisar`),
        )
          .send({ ...revisionEditor, versionEsperada: automatico.version })
          .expect(201)
      ).body;
      const contratoAuto = (
        await auth(
          http.post(`/personal/editor/borradores/${automatico.id}/emitir`),
        )
          .send({ versionEsperada: automatico.version, acepta: true })
          .expect(201)
      ).body;
      const firmaAuto = {
        nombre: 'Representante ficticio',
        identificacion: '123-prueba',
        facultad: 'Representación de prueba',
        password,
        acepta: true,
      };
      const guardarCorreoAuto = async (to, subject, text, attachments) => {
        sent.push({ to, subject, text, attachments });
      };
      personal.enviar =
        tipoAuto === 'FIJO'
          ? async () => {
              throw Error('Fallo SMTP simulado');
            }
          : guardarCorreoAuto;
      const envioAuto = (
        await auth(http.post(`/personal/${contratoAuto.id}/firmar-enviar`))
          .send(firmaAuto)
          .expect(201)
      ).body;
      assert.equal(envioAuto.estado, 'PENDIENTE_EMPLEADO');
      assert.equal(envioAuto.invitacionEnviada, tipoAuto !== 'FIJO');
      if (tipoAuto === 'FIJO') {
        assert.match(envioAuto.mensaje, /no se pudo enviar/);
        personal.enviar = guardarCorreoAuto;
        await auth(http.post(`/personal/${contratoAuto.id}/invitar`)).expect(
          201,
        );
      }
      const correoAuto = sent.at(-1);
      assert.equal(correoAuto.to, empleadoAuto.datos.email);
      const tokenAuto = correoAuto.text.match(/token=([a-f0-9]{64})/)[1];
      await http
        .post(ruta + '/codigo')
        .send({ token: tokenAuto })
        .expect(201);
      const codigoAuto = sent.at(-1).text.match(/código es (\d{8})/)[1];
      const sesionAuto = (
        await http
          .post(ruta + '/verificar')
          .send({ token: tokenAuto, codigo: codigoAuto })
          .expect(201)
      ).body.sesion;
      await http
        .post(ruta + '/documento')
        .send({ token: tokenAuto, sesion: sesionAuto })
        .expect(201);
      await http
        .post(ruta + '/resolver')
        .send({
          token: tokenAuto,
          sesion: sesionAuto,
          acepta: true,
          politica: true,
          copiaCorreo: true,
        })
        .expect(201);
      assert.equal(
        (await personal.store.obtener(actor, contratoAuto.id)).estado,
        'FIRMADO',
      );
      const firmasAuto = await personal.store.listar(
        actor,
        'FIRMA',
        contratoAuto.id,
      );
      assert.equal(firmasAuto.length, 2);
    }
    console.log(
      'PASS contratos por modalidad: datos del expediente, tres PDF, revisión, firma de empleador, envío y reintento SMTP, lectura y firma OTP del empleado',
    );
    // Cargos propios: un perfil nuevo no reemplaza al auxiliar; otra empresa puede usar el mismo nombre con otras condiciones.
    const cargoVentas = 'Ventas externas empresariales';
    const perfilVentas = {
      ...perfilAuto,
      perfilCargo: cargoVentas,
      funciones:
        'Visitar empresas y gestionar pedidos con condiciones autorizadas.',
      jornada: 'Jornada comercial ficticia distinta de caja.',
      descansos: 'Descansos de la ruta comercial ficticia.',
      lugarServicio: 'Rutas de visitas empresariales ficticias',
    };
    const ventasA = (
      await auth(http.post('/personal/editor/plantillas-modalidad'))
        .send(perfilVentas)
        .expect(201)
    ).body;
    const perfilProduccion = {
      ...perfilAuto,
      perfilCargo: 'Producción de alimentos',
      funciones:
        'Elaborar totopos y tortillas con procedimientos seguros e higiene.',
      jornada: 'Jornada de producción ficticia.',
      lugarServicio: 'Área de producción ficticia',
    };
    await auth(http.post('/personal/editor/plantillas-modalidad'))
      .send(perfilProduccion)
      .expect(201);
    const modelosConCargos = (
      await auth(http.get('/personal/editor')).expect(200)
    ).body.plantillasModalidad;
    assert.equal(
      modelosConCargos.filter(
        (p) => p.datos.perfilCargo === 'Auxiliar ficticio',
      ).length,
      3,
    );
    assert.equal(
      modelosConCargos.filter((p) => p.datos.perfilCargo === cargoVentas)
        .length,
      3,
    );
    assert.equal(
      modelosConCargos.filter(
        (p) => p.datos.perfilCargo === 'Producción de alimentos',
      ).length,
      3,
    );
    await auth(http.post('/personal/editor/preparar'))
      .send({
        empleadoId: empleadoAuto.id,
        plantillaId: ventasA.find((p) => p.datos.tipo === 'INDEFINIDO').id,
      })
      .expect(400);
    const ventasB = (
      await auth(http.post('/personal/editor/plantillas-modalidad'), b.token)
        .send({
          ...perfilVentas,
          funciones: 'FUNCIONES EXCLUSIVAS DE EMPRESA B',
          razonSocial: 'Empresa B ficticia',
        })
        .expect(201)
    ).body;
    const cargosB = (await auth(http.get('/personal'), b.token).expect(200))
      .body.cargosEmpresa;
    assert(cargosB.includes(cargoVentas));
    assert(!cargosB.includes('Producción de alimentos'));
    const editorB = (
      await auth(http.get('/personal/editor'), b.token).expect(200)
    ).body;
    assert.equal(editorB.plantillasModalidad.length, 3);
    assert(
      editorB.plantillasModalidad.every(
        (p) => p.datos.funciones === 'FUNCIONES EXCLUSIVAS DE EMPRESA B',
      ),
    );
    await auth(http.post('/personal/editor/preparar'))
      .send({ empleadoId: empleadoAuto.id, plantillaId: ventasB[0].id })
      .expect(404);
    const nuevasVentasA = (
      await auth(http.post('/personal/editor/plantillas-modalidad'))
        .send({
          ...perfilVentas,
          funciones: 'Funciones de ventas actualizadas solo para A.',
        })
        .expect(201)
    ).body;
    assert(
      nuevasVentasA.every((p) =>
        ventasA.some(
          (v) => v.id === p.datos.anteriorId && v.datos.tipo === p.datos.tipo,
        ),
      ),
    );
    const propiosA = (await auth(http.get('/personal')).expect(200)).body
      .cargosEmpresa;
    assert(propiosA.includes('Producción de alimentos'));
    assert(
      !JSON.stringify(
        (await auth(http.get('/personal/editor')).expect(200)).body,
      ).includes('FUNCIONES EXCLUSIVAS DE EMPRESA B'),
    );
    const legacy = (
      await auth(http.post('/personal/editor/plantillas-modalidad'))
        .send({
          ...perfilAuto,
          perfilCargo: undefined,
          aplicarATodas: false,
          tipo: 'INDEFINIDO',
        })
        .expect(201)
    ).body[0];
    await auth(http.post('/personal/editor/preparar'))
      .send({ empleadoId: empleadoAuto.id, plantillaId: legacy.id })
      .expect(400);
    await auth(http.post('/personal/editor/preparar'))
      .send({
        empleadoId: empleadoAuto.id,
        plantillaId: legacy.id,
        confirmarPerfilGeneral: true,
      })
      .expect(201);
    console.log(
      'PASS perfiles por cargo: cargos propios por empresa, coexistencia de caja/ventas/producción, rechazo de cargo distinto, aislamiento y revisión expresa de plantillas antiguas',
    );
    const cuentaPerfil = {
      ...empleadoAuto.datos,
      salario: '1750905',
      banco: 'Davivienda',
      tipoCuenta: 'AHORROS',
      numeroCuenta: '001234567890',
    };
    await auth(http.patch(`/personal/empleados/${empleadoAuto.id}`))
      .send(cuentaPerfil)
      .expect(200);
    const revisionAnteriorCuenta = (
      await auth(http.get('/personal')).expect(200)
    ).body.empleados.find((e) => e.id === empleadoAuto.id).cuentaRevision;
    const periodoBanco = (
      await auth(http.post('/personal/periodos'))
        .send({
          empleadoId: empleadoAuto.id,
          desde: hoyAuto,
          hasta: hoyAuto,
          fechaProgramada: hoyAuto,
          revisado: true,
          conceptos: [
            { tipo: 'DEVENGADO', nombre: 'Salario ficticio', monto: '1000000' },
            { tipo: 'DEVENGADO', nombre: 'Auxilio ficticio', monto: '100000' },
            {
              tipo: 'DEDUCCION',
              nombre: 'Salud ficticia',
              monto: '40000',
              fundamento: 'Aporte legal de prueba',
              soporteId: file.id,
            },
            {
              tipo: 'DEDUCCION',
              nombre: 'Pensión ficticia',
              monto: '40000',
              fundamento: 'Aporte legal de prueba',
              soporteId: file.id,
            },
          ],
        })
        .expect(201)
    ).body;
    assert(!Object.hasOwn(periodoBanco.datos.empleado, 'cuentaNomina'));
    await auth(http.patch(`/personal/empleados/${empleadoAuto.id}`))
      .send({ ...cuentaPerfil, numeroCuenta: '009999999999' })
      .expect(200);
    const revisionActualCuenta = (
      await auth(http.get('/personal')).expect(200)
    ).body.empleados.find((e) => e.id === empleadoAuto.id).cuentaRevision;
    const giro = {
      periodoId: periodoBanco.id,
      monto: '500000',
      fechaPago: hoyAuto,
      medio: 'TRANSFERENCIA',
      soporteId: file.id,
      referenciaTransferencia: 'GIRO-FICTICIO-1',
      cuentaRevision: revisionAnteriorCuenta,
      confirmado: true,
      idempotencia: randomUUID(),
    };
    await auth(http.post('/personal/pagos/registrar-enviar'))
      .send(giro)
      .expect(409);
    giro.cuentaRevision = revisionActualCuenta;
    await auth(http.post('/personal/pagos/registrar-enviar'), b.token)
      .send(giro)
      .expect(404);
    await auth(http.post('/personal/pagos/registrar-enviar'), 'Bearer ' + ct)
      .send(giro)
      .expect(403);
    const movimientosBancoAntes = await db.movimientoFinanciero.count({
      where: { empresaId: a.e.id, categoria: 'NOMINA' },
    });
    const enviadosAntes = sent.length;
    const giros = await Promise.all([
      auth(http.post('/personal/pagos/registrar-enviar'))
        .send(giro)
        .expect(201),
      auth(http.post('/personal/pagos/registrar-enviar'))
        .send(giro)
        .expect(201),
    ]);
    assert.equal(giros[0].body.id, giros[1].body.id);
    assert.equal(sent.length, enviadosAntes + 1);
    const correoComprobante = sent.at(-1);
    assert.equal(correoComprobante.to, empleadoAuto.datos.email);
    assert.equal(
      correoComprobante.attachments[0].filename,
      'comprobante-pago.pdf',
    );
    assert.equal(
      correoComprobante.attachments[0].content.subarray(0, 5).toString(),
      '%PDF-',
    );
    assert.match(correoComprobante.text, /personal\/firma#empresa=/);
    assert.equal(giros[0].body.datos.cuentaDestino.terminacion, '9999');
    assert(!JSON.stringify(giros[0].body).includes('009999999999'));
    assert.equal(giros[0].body.datos.saldoTrasAbonoCentavos, 52000000);
    assert.equal(giros[0].body.datos.netoPeriodoCentavos, 102000000);
    assert.equal(giros[0].body.estado, 'REGISTRADO_SIN_CONFIRMAR');
    assert.equal(
      (await personal.store.listar(actor, 'FIRMA', giros[0].body.id)).length,
      0,
    );
    assert.equal(
      await db.movimientoFinanciero.count({
        where: { empresaId: a.e.id, categoria: 'NOMINA' },
      }),
      movimientosBancoAntes + 1,
    );
    const giroFinal = {
      ...giro,
      monto: '520000',
      referenciaTransferencia: 'GIRO-FICTICIO-2',
      idempotencia: randomUUID(),
    };
    personal.enviar = async () => {
      throw Error('SMTP simulado no disponible');
    };
    const pagoSinCorreo = (
      await auth(http.post('/personal/pagos/registrar-enviar'))
        .send(giroFinal)
        .expect(201)
    ).body;
    assert.equal(pagoSinCorreo.comprobanteCorreo, 'FALLIDO');
    await auth(http.post('/personal/pagos/registrar-enviar'))
      .send(giroFinal)
      .expect(201);
    assert.equal(
      await db.movimientoFinanciero.count({
        where: { empresaId: a.e.id, categoria: 'NOMINA' },
      }),
      movimientosBancoAntes + 2,
    );
    personal.enviar = async (to, subject, text, attachments) => {
      sent.push({ to, subject, text, attachments });
    };
    await auth(http.post(`/personal/${pagoSinCorreo.id}/invitar`)).expect(201);
    const pagosConAviso = (await auth(http.get('/personal')).expect(200)).body
      .pagos;
    assert.equal(
      pagosConAviso.find((p) => p.id === pagoSinCorreo.id).comprobanteCorreo,
      'ENVIADO',
    );
    assert.equal(sent.at(-1).attachments[0].filename, 'comprobante-pago.pdf');
    console.log(
      'PASS nómina bancaria: destino cifrado y enmascarado, cambio de cuenta rechazado, deducciones desglosadas, abonos idempotentes y correo con PDF, reenvío sin duplicar pagos',
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
