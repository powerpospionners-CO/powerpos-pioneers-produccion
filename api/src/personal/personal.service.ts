import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as nodemailer from 'nodemailer';
import * as bcrypt from 'bcrypt';
import { PersonalStore, ActorPersonal } from './personal.store';
import {
  centavos,
  fecha,
  hash,
  hoy,
  texto,
  indiceEmpleado,
} from './personal.reglas';
import { FinancieroService } from '../financiero/financiero.service';
import { validarPeriodo } from './personal.reglas';
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
const ACEPTACION =
  'He leído el documento completo y apruebo exclusivamente su contenido e importe, si corresponde. Esta confirmación no constituye renuncia a derechos laborales ni a reclamar diferencias.';
@Injectable()
export class PersonalService {
  constructor(
    readonly store: PersonalStore,
    private financiero: FinancieroService,
  ) {}
  async inicio(a: ActorPersonal) {
    await this.store.preparar();
    const entregas = await this.store.listar(a, 'ENTREGA');
    const conEntrega = (docs: any[]) =>
      docs.map((doc) => {
        const ultima = entregas.find((e: any) => e.referenciaId === doc.id);
        return {
          ...doc,
          copia: ultima
            ? ultima.datos.pendiente
              ? 'PENDIENTE'
              : 'ENVIADA'
            : 'SIN_ENVIO_REGISTRADO',
        };
      });
    return {
      empleados: await this.store.listar(a, 'EMPLEADO'),
      periodos: await this.store.listar(a, 'PERIODO'),
      pagos: conEntrega(await this.store.listar(a, 'PAGO')),
      plantillas: await this.store.listar(a, 'PLANTILLA'),
      contratos: conEntrega(await this.store.listar(a, 'CONTRATO')),
      config: await this.config(a),
      correoConfigurado: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
      nominaDian: {
        estado: 'NO_CONECTADA',
        mensaje:
          'El comprobante interno no es el documento soporte de nómina electrónica validado por la DIAN.',
      },
    };
  }
  async config(a: ActorPersonal) {
    return (await this.store.listar(a, 'CONFIG'))[0]?.datos || null;
  }
  async configurar(a: ActorPersonal, d: any) {
    await this.store.preparar();
    const datos = {
      responsable: texto(d.responsable, 'responsable del tratamiento'),
      correo: texto(d.correo, 'correo de atención'),
      politica: texto(d.politica, 'aviso de privacidad y conservación', 12000),
      version: hoy(),
      aceptadoPor: a.id,
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo) || d.acepta !== true)
      throw new BadRequestException(
        'Completa la política y confirma su revisión',
      );
    return this.store.crear(a, 'CONFIG', datos);
  }
  async empleado(a: ActorPersonal, d: any, id?: string) {
    await this.store.preparar();
    if (id) await this.store.obtener(a, id, 'EMPLEADO');
    if (!(await this.config(a)))
      throw new BadRequestException(
        'Configura primero el aviso de privacidad de la empresa',
      );
    const datos = {
      nombre: texto(d.nombre, 'nombre'),
      identificacion: texto(d.identificacion, 'identificación', 40),
      cargo: texto(d.cargo, 'cargo'),
      email: texto(d.email, 'correo del empleado', 254).toLowerCase(),
      ingreso: fecha(d.ingreso),
      salarioCentavos: centavos(d.salario),
      frecuencia: texto(d.frecuencia, 'frecuencia', 20),
      activo: d.activo !== false,
    };
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email) ||
      !['QUINCENAL', 'MENSUAL', 'SEMANAL'].includes(datos.frecuencia)
    )
      throw new BadRequestException('Correo o frecuencia inválidos');
    if (datos.salarioCentavos <= 0)
      throw new BadRequestException('El salario debe ser positivo');
    if (datos.ingreso > hoy())
      throw new BadRequestException(
        'La fecha real de ingreso no puede ser futura',
      );
    return this.store.prisma.$transaction(async (tx) => {
      if (id) {
        await this.store.bloquear(a, id, tx);
        const previo = await this.store.obtener(a, id, 'EMPLEADO', tx);
        if (previo.datos.identificacion !== datos.identificacion)
          throw new BadRequestException(
            'La identificación vincula el expediente histórico y no puede reemplazarse; solicita una corrección documentada al responsable',
          );
        const cambiado = await this.store.actualizar(
          a,
          previo,
          datos,
          datos.activo ? 'ACTIVO' : 'RETIRADO',
          tx,
        );
        await this.store.evento(
          a,
          id,
          'ACTUALIZAR_EMPLEADO',
          { anterior: previo.datos, nuevo: datos },
          tx,
        );
        return cambiado;
      }
      const duplicados = await this.store.listar(a, 'EMPLEADO', undefined, tx);
      if (
        duplicados.some(
          (e: any) => e.datos.identificacion === datos.identificacion,
        )
      )
        throw new BadRequestException(
          'Ya existe un empleado con esa identificación',
        );
      const creado = await this.store.crear(
        a,
        'EMPLEADO',
        datos,
        { llave: indiceEmpleado(datos.identificacion) },
        tx,
      );
      await this.store.evento(a, creado.id, 'CREAR_EMPLEADO', {}, tx);
      return creado;
    });
  }
  async archivo(a: ActorPersonal, file: any) {
    await this.store.preparar();
    if (
      !file ||
      file.size > 5 * 1024 * 1024 ||
      !file.buffer?.subarray(0, 5).equals(Buffer.from('%PDF-'))
    )
      throw new BadRequestException('Sube un PDF de hasta 5 MB');
    return this.store.crear(a, 'ARCHIVO', {
      nombre: texto(file.originalname, 'nombre del archivo', 180),
      contenido: file.buffer.toString('base64'),
      sha256: hash(file.buffer),
      mime: 'application/pdf',
    });
  }
  async periodo(a: ActorPersonal, d: any) {
    await this.store.preparar();
    const e = await this.store.obtener(
      a,
      texto(d.empleadoId, 'empleado', 36),
      'EMPLEADO',
    );
    const datos = validarPeriodo(d);
    for (const c of datos.conceptos)
      if (c.soporteId) await this.store.obtener(a, c.soporteId, 'ARCHIVO');
    return this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, e.id, tx);
      const existentes = await this.store.listar(a, 'PERIODO', e.id, tx);
      if (
        existentes.some(
          (p: any) =>
            p.datos.desde <= datos.hasta && p.datos.hasta >= datos.desde,
        )
      )
        throw new BadRequestException(
          'Ya existe un periodo que se cruza con estas fechas',
        );
      const p = await this.store.crear(
        a,
        'PERIODO',
        {
          ...datos,
          empleado: e.datos,
          empleadoId: e.id,
          pagadoCentavos: 0,
          revisionPor: a.id,
        },
        {
          referenciaId: e.id,
          llave: `${e.id}:${datos.desde}:${datos.hasta}`,
          estado: 'PENDIENTE',
        },
        tx,
      );
      await this.store.evento(
        a,
        p.id,
        'CREAR_PERIODO',
        { revisionPor: a.id },
        tx,
      );
      return p;
    });
  }
  async pago(a: ActorPersonal, d: any) {
    await this.store.preparar();
    const periodoId = texto(d.periodoId, 'periodo', 36),
      idempotencia = texto(d.idempotencia, 'clave de operación', 64);
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(idempotencia))
      throw new BadRequestException('Clave de operación inválida');
    const monto = centavos(d.monto),
      fechaPago = fecha(d.fechaPago);
    if (monto <= 0 || fechaPago > hoy())
      throw new BadRequestException(
        'El pago debe ser positivo y la fecha real no puede ser futura',
      );
    if (!['EFECTIVO', 'TRANSFERENCIA'].includes(d.medio))
      throw new BadRequestException('Medio de pago inválido');
    if (d.medio === 'TRANSFERENCIA' && !d.soporteId)
      throw new BadRequestException('Adjunta el soporte de transferencia');
    if (d.soporteId)
      await this.store.obtener(a, texto(d.soporteId, 'soporte', 36), 'ARCHIVO');
    return this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, periodoId, tx);
      const previo = await (tx as any).personalRegistro.findFirst({
        where: { ...this.store.scope(a), tipo: 'PAGO', llave: idempotencia },
      });
      if (previo) {
        const pago = this.store.abrir(previo);
        if (
          pago.datos.periodoId !== periodoId ||
          pago.datos.montoCentavos !== monto ||
          pago.datos.fechaPago !== fechaPago ||
          pago.datos.medio !== d.medio ||
          pago.datos.soporteId !== (d.soporteId || null)
        )
          throw new BadRequestException('La clave ya corresponde a otro pago');
        return pago;
      }
      const p = await this.store.obtener(a, periodoId, 'PERIODO', tx);
      if (p.datos.pagadoCentavos + monto > p.datos.totalCentavos)
        throw new BadRequestException('El pago supera el saldo pendiente');
      const empresa = await tx.empresa.findUnique({
        where: { id: a.empresaId },
        select: { nombre: true, nit: true, direccion: true },
      });
      const movimiento = await this.financiero.registrarMovimiento(
        {
          tipo: 'EGRESO',
          categoria: 'NOMINA',
          descripcion: `Pago laboral ${p.datos.desde} a ${p.datos.hasta}; referencia privada ${p.id}`,
          monto: monto / 100,
          comprobante: 'personal-pago:' + idempotencia,
          fecha: fechaPago + 'T12:00:00Z',
        },
        a.id,
        a.empresaId,
        a.sucursalId,
        tx,
      );
      const snapshot = {
        empresa,
        empleado: p.datos.empleado,
        empleadoId: p.datos.empleadoId,
        periodoId: p.id,
        desde: p.datos.desde,
        hasta: p.datos.hasta,
        conceptos: p.datos.conceptos,
        netoPeriodoCentavos: p.datos.totalCentavos,
        pagadoAnteriorCentavos: p.datos.pagadoCentavos,
        saldoTrasAbonoCentavos:
          p.datos.totalCentavos - p.datos.pagadoCentavos - monto,
        montoCentavos: monto,
        fechaPago,
        medio: d.medio,
        soporteId: d.soporteId || null,
        movimientoId: movimiento.id,
        aviso: ACEPTACION,
        registradoEn: new Date().toISOString(),
        dian: 'NO_TRANSMITIDO',
      };
      const creado = await this.store.crear(
        a,
        'PAGO',
        { ...snapshot, documentoHash: hash(JSON.stringify(snapshot)) },
        {
          referenciaId: p.id,
          llave: idempotencia,
          estado: 'REGISTRADO_SIN_CONFIRMAR',
        },
        tx,
      );
      await this.store.actualizar(
        a,
        p,
        { ...p.datos, pagadoCentavos: p.datos.pagadoCentavos + monto },
        p.datos.pagadoCentavos + monto === p.datos.totalCentavos
          ? 'PAGO_REGISTRADO'
          : 'PARCIAL',
        tx,
      );
      await this.store.evento(
        a,
        creado.id,
        'REGISTRAR_PAGO',
        { movimientoId: movimiento.id },
        tx,
      );
      return creado;
    });
  }
  async plantilla(a: ActorPersonal, d: any) {
    await this.store.preparar();
    const archivo = await this.store.obtener(
      a,
      texto(d.archivoId, 'PDF de plantilla', 36),
      'ARCHIVO',
    );
    if (fecha(d.revisadaEn) > hoy())
      throw new BadRequestException('La revisión no puede tener fecha futura');
    if (d.revisada !== true)
      throw new BadRequestException('La plantilla requiere revisión jurídica');
    const r = await this.store.crear(
      a,
      'PLANTILLA',
      {
        nombre: texto(d.nombre, 'nombre de plantilla'),
        archivoId: archivo.id,
        sha256: archivo.datos.sha256,
        revisadaPor: texto(
          d.revisadaPor,
          'responsable de la revisión jurídica',
        ),
        revisadaEn: fecha(d.revisadaEn),
        alcance: texto(d.alcance, 'alcance de la revisión', 2000),
      },
      { estado: 'REVISADA' },
    );
    await this.store.evento(a, r.id, 'REVISAR_PLANTILLA', {
      responsable: r.datos.revisadaPor,
    });
    return r;
  }
  async contrato(a: ActorPersonal, d: any) {
    await this.store.preparar();
    const e = await this.store.obtener(
        a,
        texto(d.empleadoId, 'empleado', 36),
        'EMPLEADO',
      ),
      p = await this.store.obtener(
        a,
        texto(d.plantillaId, 'plantilla', 36),
        'PLANTILLA',
      ),
      archivo = await this.store.obtener(
        a,
        texto(d.archivoId, 'contrato completo en PDF', 36),
        'ARCHIVO',
      );
    if (p.estado !== 'REVISADA' || d.revisado !== true)
      throw new BadRequestException(
        'Requiere revisión jurídica del contrato completo',
      );
    if (!['INDEFINIDO', 'FIJO', 'OBRA_LABOR'].includes(d.tipo))
      throw new BadRequestException('Selecciona un tipo de contrato laboral');
    const inicio = fecha(d.inicio),
      fin = d.tipo === 'FIJO' ? fecha(d.fin) : null;
    const anteriores = await this.store.listar(a, 'CONTRATO', e.id);
    const primero = anteriores
      .filter((r: any) => r.datos.tipo === 'FIJO')
      .reduce(
        (min: string, r: any) => (r.datos.inicio < min ? r.datos.inicio : min),
        inicio,
      );
    const limite = new Date(primero);
    limite.setUTCFullYear(limite.getUTCFullYear() + 4);
    if (fin && (fin < inicio || Date.parse(fin) > limite.getTime()))
      throw new BadRequestException(
        'El término fijo acumulado supera cuatro años o las fechas son inválidas; requiere revisión jurídica',
      );
    const empresa = await this.store.prisma.empresa.findUnique({
      where: { id: a.empresaId },
      select: { nombre: true, nit: true, direccion: true },
    });
    if (!empresa?.nit || !empresa.direccion)
      throw new BadRequestException(
        'Completa identificación y domicilio del empleador',
      );
    if (centavos(d.salario) <= 0)
      throw new BadRequestException('El salario debe ser positivo');
    const datos = {
      empresa,
      empleado: e.datos,
      empleadoId: e.id,
      plantillaId: p.id,
      archivoId: archivo.id,
      tipo: d.tipo,
      inicio,
      fin,
      obra:
        d.tipo === 'OBRA_LABOR'
          ? texto(d.obra, 'obra o labor específica', 3000)
          : null,
      funciones: texto(d.funciones, 'funciones', 3000),
      lugar: texto(d.lugar, 'lugar de trabajo'),
      salarioCentavos: centavos(d.salario),
      revisadaPor: texto(d.revisadaPor, 'responsable de revisión del contrato'),
      regularizacion: inicio < hoy(),
      elaboradoEn: new Date().toISOString(),
      documentoHash: archivo.datos.sha256,
      aviso: ACEPTACION,
    };
    const r = await this.store.crear(a, 'CONTRATO', datos, {
      referenciaId: e.id,
      estado: 'PENDIENTE_EMPLEADOR',
    });
    await this.store.evento(a, r.id, 'CREAR_CONTRATO', {
      revisadaPor: datos.revisadaPor,
    });
    return r;
  }
  async firmarEmpleador(a: ActorPersonal, id: string, d: any) {
    const usuario = await this.store.prisma.usuario.findFirst({
      where: { id: a.id, empresaId: a.empresaId },
    });
    if (
      typeof d.password !== 'string' ||
      d.password.length > 200 ||
      !usuario ||
      !(await bcrypt.compare(d.password, usuario.password))
    )
      throw new ForbiddenException('Confirma tu contraseña actual');
    if (d.acepta !== true)
      throw new BadRequestException('Debes leer y aceptar el documento');
    const nombre = texto(d.nombre, 'nombre del representante'),
      identificacion = texto(
        d.identificacion,
        'identificación del representante',
        40,
      ),
      facultad = texto(
        d.facultad,
        'facultad para representar al empleador',
        500,
      );
    return this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, id, tx);
      const doc = await this.store.obtener(a, id, 'CONTRATO', tx);
      if (doc.estado !== 'PENDIENTE_EMPLEADOR')
        throw new BadRequestException(
          'El contrato ya fue firmado por el empleador',
        );
      const firma = {
        documentoHash: doc.datos.documentoHash,
        nombre,
        identificacion,
        facultad,
        calidad: 'EMPLEADOR',
        metodo: 'CONTRASENA_ADMINISTRADOR',
        actorId: a.id,
        fecha: new Date().toISOString(),
        aceptacion: ACEPTACION,
      };
      await this.store.crear(
        a,
        'FIRMA',
        firma,
        { referenciaId: id, estado: 'EMPLEADOR' },
        tx,
      );
      await this.store.evento(
        a,
        id,
        'FIRMAR_EMPLEADOR',
        { documentoHash: firma.documentoHash },
        tx,
      );
      return this.store.actualizar(a, doc, doc.datos, 'PENDIENTE_EMPLEADO', tx);
    });
  }
  private async enviar(
    destino: string,
    asunto: string,
    cuerpo: string,
    attachments?: any[],
  ) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS)
      throw new ServiceUnavailableException(
        'Configura el correo institucional antes de enviar documentos o códigos',
      );
    const smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      requireTLS: Number(process.env.SMTP_PORT) !== 465,
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      socketTimeout: 20000,
    });
    try {
      await smtp.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: destino,
        subject: asunto,
        text: cuerpo,
        attachments,
      });
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo entregar el correo; revisa la configuración y reintenta',
      );
    } finally {
      smtp.close();
    }
  }
  async invitar(a: ActorPersonal, id: string) {
    const doc = await this.store.obtener(a, id);
    if (
      !['PAGO', 'CONTRATO'].includes(doc.tipo) ||
      !['REGISTRADO_SIN_CONFIRMAR', 'PENDIENTE_EMPLEADO'].includes(doc.estado)
    )
      throw new BadRequestException(
        'Este documento no admite una nueva solicitud de firma',
      );
    const empleado = await this.store.obtener(
      a,
      doc.datos.empleadoId,
      'EMPLEADO',
    );
    const config = await this.config(a);
    if (!config)
      throw new BadRequestException('Configura el aviso de privacidad');
    const token = randomBytes(32).toString('hex');
    const r = await this.store.crear(
      a,
      'INVITACION',
      {
        documentoId: id,
        empleadoId: empleado.id,
        email: empleado.datos.email,
        vence: Date.now() + 7 * 86400000,
        intentos: 0,
        solicitadoEn: 0,
        politica: config,
      },
      { referenciaId: id, llave: hash(token), estado: 'PENDIENTE' },
    );
    const base = (
      process.env.PERSONAL_WEB_URL || 'https://app.powerpospioneers.com'
    ).replace(/\/$/, '');
    if (!/^https:\/\/[a-z0-9.-]+\.powerpospioneers\.com$/.test(base))
      throw new ServiceUnavailableException(
        'Configura una dirección HTTPS válida para Personal',
      );
    try {
      await this.enviar(
        empleado.datos.email,
        'Documento laboral para revisar',
        `Tienes un documento de tu empleador para revisar. Nadie debe firmar por ti. Abre ${base}/personal/firma#empresa=${a.empresaId}&sede=${a.sucursalId}&token=${token}\nEl enlace vence en 7 días. No compartas los códigos. Puedes pedir una copia en papel sin firmar electrónicamente.`,
      );
    } catch (error) {
      await this.store.actualizar(
        a,
        r,
        { ...r.datos, falloEntrega: true },
        'ENTREGA_FALLIDA',
      );
      throw error;
    }
    await this.store.evento(a, id, 'ENVIAR_INVITACION', {
      destinoVerificado: false,
    });
    return { enviado: true };
  }
  async acceso(a: ActorPersonal, token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new ForbiddenException('Enlace no válido');
    const r = await this.store.db().personalRegistro.findFirst({
      where: {
        ...this.store.scope(a),
        tipo: 'INVITACION',
        llave: hash(token),
      },
    });
    if (!r) throw new ForbiddenException('Enlace no válido');
    const i = this.store.abrir(r);
    if (i.datos.vence < Date.now() || i.estado === 'ENTREGA_FALLIDA')
      throw new ForbiddenException(
        'El enlace venció o fue revocado; solicita uno nuevo',
      );
    return i;
  }
  async solicitarCodigo(a: ActorPersonal, token: string) {
    const i = await this.acceso(a, token);
    if (i.estado === 'FINALIZADA')
      throw new BadRequestException('El documento ya fue confirmado');
    const codigo = String(randomInt(0, 100000000)).padStart(8, '0'),
      nonce = randomBytes(16).toString('hex');
    await this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, i.id, tx);
      const actual = await this.store.obtener(a, i.id, 'INVITACION', tx);
      if (Date.now() - actual.datos.solicitadoEn < 60000)
        throw new BadRequestException(
          'Espera un minuto antes de solicitar otro código',
        );
      if ((actual.datos.envios || 0) >= 10)
        throw new BadRequestException(
          'Alcanzaste el máximo de envíos para este enlace',
        );
      await this.store.actualizar(
        a,
        actual,
        {
          ...actual.datos,
          nonce,
          codigoHash: hash(nonce + codigo),
          venceCodigo: Date.now() + 10 * 60000,
          intentos: 0,
          solicitadoEn: Date.now(),
          envios: (actual.datos.envios || 0) + 1,
        },
        actual.estado,
        tx,
      );
    });
    await this.enviar(
      i.datos.email,
      'Código privado de confirmación laboral',
      `Tu código es ${codigo}. Vence en 10 minutos. Úsalo únicamente después de revisar el documento. No lo entregues a tu administrador.`,
    );
    return { enviado: true };
  }
  async verificarCodigo(a: ActorPersonal, token: string, codigo: string) {
    const i = await this.acceso(a, token);
    let error = false;
    const resultado = await this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, i.id, tx);
      const actual = await this.store.obtener(a, i.id, 'INVITACION', tx),
        d = actual.datos;
      if (
        actual.estado === 'FINALIZADA' ||
        !d.codigoHash ||
        d.venceCodigo < Date.now() ||
        d.intentos >= 5
      )
        throw new ForbiddenException('Código vencido, usado o bloqueado');
      const esperado = Buffer.from(d.codigoHash, 'hex'),
        recibido = Buffer.from(hash(String(d.nonce) + String(codigo)), 'hex');
      if (!timingSafeEqual(esperado, recibido)) {
        await this.store.actualizar(
          a,
          actual,
          { ...d, intentos: d.intentos + 1 },
          actual.estado,
          tx,
        );
        error = true;
        return null;
      }
      const session = randomBytes(32).toString('hex');
      await this.store.actualizar(
        a,
        actual,
        {
          ...d,
          codigoHash: null,
          sessionHash: hash(session),
          sesionVence: Date.now() + 30 * 60000,
          verificadoEn: new Date().toISOString(),
        },
        'VERIFICADA',
        tx,
      );
      return { sesion: session };
    });
    if (error) throw new ForbiddenException('Código incorrecto');
    return resultado;
  }
  async sesion(a: ActorPersonal, token: string, sesion: string) {
    const i = await this.acceso(a, token);
    if (
      typeof sesion !== 'string' ||
      !/^[a-f0-9]{64}$/.test(sesion) ||
      !i.datos.sessionHash ||
      i.datos.sesionVence < Date.now() ||
      hash(sesion) !== i.datos.sessionHash
    )
      throw new ForbiddenException('Verifica tu correo para continuar');
    return i;
  }
  async vista(a: ActorPersonal, token: string, sesion: string) {
    const i = await this.sesion(a, token, sesion),
      doc = await this.store.obtener(a, i.datos.documentoId);
    const firmas = await this.store.listar(a, 'FIRMA', doc.id);
    await this.store.crear(
      a,
      'ACCESO',
      {
        documentoHash: doc.datos.documentoHash,
        fecha: new Date().toISOString(),
      },
      { referenciaId: i.id },
    );
    return {
      documento: { ...doc, datos: { ...doc.datos, soporteId: undefined } },
      firmas: firmas.map((f: any) => f.datos),
      politica: i.datos.politica,
      aceptacion: ACEPTACION,
    };
  }
  async resolver(
    a: ActorPersonal,
    token: string,
    sesion: string,
    d: any,
    ip: string,
  ) {
    const i = await this.sesion(a, token, sesion);
    if (d.acepta !== true || d.politica !== true || d.copiaCorreo !== true)
      throw new BadRequestException(
        'Confirma lectura, aviso de privacidad y entrega de copia por correo; puedes elegir el proceso en papel',
      );
    const resultado = await this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, i.datos.documentoId, tx);
      await this.store.bloquear(a, i.id, tx);
      const actual = await this.store.obtener(a, i.id, 'INVITACION', tx),
        doc = await this.store.obtener(a, i.datos.documentoId, undefined, tx);
      if (
        actual.datos.sesionVence < Date.now() ||
        actual.datos.vence < Date.now() ||
        actual.datos.sessionHash !== hash(sesion)
      )
        throw new ForbiddenException(
          'La verificación venció; solicita un nuevo acceso',
        );
      if (
        actual.estado !== 'VERIFICADA' ||
        !['REGISTRADO_SIN_CONFIRMAR', 'PENDIENTE_EMPLEADO'].includes(doc.estado)
      )
        throw new BadRequestException('El documento ya fue atendido');
      const evento = {
        documentoHash: doc.datos.documentoHash,
        nombre: doc.datos.empleado.nombre,
        identificacion: doc.datos.empleado.identificacion,
        email: i.datos.email,
        fecha: new Date().toISOString(),
        metodo: 'CODIGO_CORREO',
        verificadoEn: i.datos.verificadoEn,
        ipHash: hash(ip),
        aceptacion: d.reclamo
          ? 'He leído el documento y presento una diferencia; no confirmo recepción del importe ni acepto el contrato.'
          : doc.tipo === 'PAGO'
            ? 'He revisado los conceptos y confirmo que recibí únicamente el importe de este abono. No renuncio a reclamar diferencias.'
            : ACEPTACION,
        politica: i.datos.politica,
        copiaCorreo: true,
        ...(d.reclamo
          ? { reclamo: texto(d.reclamo, 'diferencia o reclamación', 3000) }
          : {}),
      };
      await this.store.crear(
        a,
        d.reclamo ? 'RECLAMO' : 'FIRMA',
        evento,
        {
          referenciaId: doc.id,
          estado: d.reclamo ? 'EN_REVISION' : 'EMPLEADO',
        },
        tx,
      );
      await this.store.actualizar(
        a,
        doc,
        doc.datos,
        d.reclamo
          ? 'EN_REVISION'
          : doc.tipo === 'CONTRATO'
            ? 'FIRMADO'
            : 'RECIBIDO_FIRMADO',
        tx,
      );
      await this.store.actualizar(
        a,
        actual,
        { ...actual.datos, finalizadoEn: evento.fecha },
        'FINALIZADA',
        tx,
      );
      await this.store.evento(
        a,
        doc.id,
        d.reclamo ? 'RECLAMAR' : 'CONFIRMAR_RECEPCION',
        { documentoHash: evento.documentoHash },
        tx,
      );
      return { id: doc.id, confirmado: !d.reclamo };
    });
    try {
      await this.entregarCopia(a, resultado.id);
      return { ...resultado, copiaEntregada: true };
    } catch {
      await this.store.crear(
        a,
        'ENTREGA',
        { fecha: new Date().toISOString(), pendiente: true },
        { referenciaId: resultado.id, estado: 'PENDIENTE' },
      );
      return { ...resultado, copiaEntregada: false };
    }
  }
  async documento(a: ActorPersonal, id: string) {
    const doc = await this.store.obtener(a, id);
    if (!['PAGO', 'CONTRATO'].includes(doc.tipo))
      throw new BadRequestException('Selecciona un pago o contrato');
    const firmas = (await this.store.listar(a, 'FIRMA', id)).map(
        (f: any) => f.datos,
      ),
      reclamos = (await this.store.listar(a, 'RECLAMO', id)).map(
        (f: any) => f.datos,
      );
    const pdf = await new Promise<Buffer>((resolve, reject) => {
      const p = new PDFDocument({ size: 'A4', margin: 48 });
      const parts: Buffer[] = [];
      p.on('data', (b: Buffer) => parts.push(b));
      p.on('end', () => resolve(Buffer.concat(parts)));
      p.on('error', reject);
      p.fontSize(18).text(
        doc.tipo === 'PAGO'
          ? 'Comprobante de pago laboral'
          : 'Constancia de firma del contrato',
      );
      p.moveDown()
        .fontSize(10)
        .text(
          `Estado: ${doc.estado}\nReferencia: ${doc.id}\nEmpresa: ${doc.datos.empresa?.nombre}\nNIT: ${doc.datos.empresa?.nit}\nEmpleado: ${doc.datos.empleado?.nombre}\nIdentificacion: ${doc.datos.empleado?.identificacion}`,
        );
      if (doc.tipo === 'PAGO')
        p.moveDown().text(
          `Periodo: ${doc.datos.desde} al ${doc.datos.hasta}\nFecha real del pago: ${doc.datos.fechaPago}\nImporte de este abono: COP ${(doc.datos.montoCentavos / 100).toFixed(2)}\nNeto del periodo: COP ${(doc.datos.netoPeriodoCentavos / 100).toFixed(2)}\nAbonos anteriores registrados: COP ${(doc.datos.pagadoAnteriorCentavos / 100).toFixed(2)}\nSaldo tras este abono: COP ${(doc.datos.saldoTrasAbonoCentavos / 100).toFixed(2)}\nMedio: ${doc.datos.medio}\nEste comprobante no acredita transmision DIAN.`,
        );
      if (doc.tipo === 'PAGO') {
        p.moveDown().text(
          'Conceptos revisados del periodo (este comprobante puede ser un abono parcial):',
        );
        for (const c of doc.datos.conceptos || [])
          p.text(
            `${c.tipo}: ${c.nombre}: COP ${(c.montoCentavos / 100).toFixed(2)}`,
          );
        if (doc.estado === 'REGISTRADO_SIN_CONFIRMAR')
          p.moveDown().text(
            'REGISTRADO POR EL EMPLEADOR. EL TRABAJADOR TODAVIA NO HA CONFIRMADO LA RECEPCION.',
          );
      }
      p.moveDown().text(`SHA-256 del documento: ${doc.datos.documentoHash}`);
      for (const f of firmas)
        p.moveDown().text(
          `Firmante: ${f.nombre}\nCalidad: ${f.calidad || 'TRABAJADOR'}\nMetodo: ${f.metodo}\nFecha real de firma: ${f.fecha}\n${f.aceptacion}`,
        );
      for (const r of reclamos)
        p.moveDown().text(`RECLAMACION: ${r.reclamo}\nFecha: ${r.fecha}`);
      p.moveDown().text(
        'Este documento solo tiene confirmacion del trabajador cuando existen evidencias de su firma. Conservar un comprobante no implica renuncia a derechos laborales ni impide presentar diferencias.',
      );
      p.end();
    });
    return { doc, pdf, firmas, reclamos };
  }
  async original(a: ActorPersonal, id: string) {
    const doc = await this.store.obtener(a, id);
    if (doc.tipo === 'CONTRATO') {
      const archivo = await this.store.obtener(
          a,
          doc.datos.archivoId,
          'ARCHIVO',
        ),
        bytes = Buffer.from(archivo.datos.contenido, 'base64');
      if (hash(bytes) !== doc.datos.documentoHash)
        throw new ServiceUnavailableException(
          'El contrato no supera la comprobación de integridad',
        );
      return bytes;
    }
    if (doc.tipo === 'PLANTILLA') {
      const archivo = await this.store.obtener(
        a,
        doc.datos.archivoId,
        'ARCHIVO',
      );
      return Buffer.from(archivo.datos.contenido, 'base64');
    }
    return (await this.documento(a, id)).pdf;
  }
  async paquete(a: ActorPersonal, id: string) {
    const { doc, pdf, firmas, reclamos } = await this.documento(a, id);
    const zip = new JSZip();
    zip.file('comprobante-y-evidencias.pdf', pdf);
    if (doc.tipo === 'CONTRATO') {
      const archivo = await this.store.obtener(
        a,
        doc.datos.archivoId,
        'ARCHIVO',
      );
      const bytes = Buffer.from(archivo.datos.contenido, 'base64');
      if (hash(bytes) !== doc.datos.documentoHash)
        throw new ServiceUnavailableException(
          'La integridad del contrato no coincide',
        );
      zip.file('contrato-original.pdf', bytes);
    }
    if (doc.tipo === 'PAGO') {
      const soportes = [
        ...(doc.datos.soporteId ? [doc.datos.soporteId] : []),
        ...(doc.datos.conceptos || [])
          .filter((c: any) => c.soporteId)
          .map((c: any) => c.soporteId),
      ];
      for (const [i, archivoId] of [...new Set(soportes)].entries()) {
        const archivo = await this.store.obtener(
            a,
            String(archivoId),
            'ARCHIVO',
          ),
          bytes = Buffer.from(archivo.datos.contenido, 'base64');
        if (hash(bytes) !== archivo.datos.sha256)
          throw new ServiceUnavailableException(
            'No se pudo verificar un soporte del pago',
          );
        zip.file(`soporte-${i + 1}.pdf`, bytes);
      }
    }
    zip.file(
      'evidencias.json',
      JSON.stringify({ documento: doc, firmas, reclamos }, null, 2),
    );
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
  async entregarCopia(a: ActorPersonal, id: string) {
    const doc = await this.store.obtener(a, id);
    if (!['FIRMADO', 'RECIBIDO_FIRMADO', 'EN_REVISION'].includes(doc.estado))
      throw new BadRequestException('Todavía no se ha confirmado el documento');
    const firmas = await this.store.listar(
      a,
      doc.estado === 'EN_REVISION' ? 'RECLAMO' : 'FIRMA',
      id,
    );
    const confirmacion = firmas.find((f: any) => f.datos.copiaCorreo);
    if (!confirmacion)
      throw new BadRequestException('No existe autorización para este envío');
    await this.enviar(
      confirmacion.datos.email,
      'Copia de tu documento laboral',
      'Adjuntamos el documento y sus evidencias. Conserva esta copia. Puedes presentar diferencias al responsable de tu empresa.',
      [
        {
          filename: 'documento-laboral.zip',
          content: await this.paquete(a, id),
        },
      ],
    );
    await this.store.crear(
      a,
      'ENTREGA',
      {
        fecha: new Date().toISOString(),
        documentoHash: doc.datos.documentoHash,
      },
      { referenciaId: id },
    );
    return { entregado: true };
  }
  async historial(a: ActorPersonal, id: string) {
    await this.store.obtener(a, id);
    return {
      eventos: await this.store.listar(a, 'EVENTO', id),
      firmas: await this.store.listar(a, 'FIRMA', id),
      reclamos: await this.store.listar(a, 'RECLAMO', id),
      entregas: await this.store.listar(a, 'ENTREGA', id),
    };
  }
}
