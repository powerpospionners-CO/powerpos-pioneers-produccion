import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  baseModalidad,
  completarContrato,
  condicionesPlantilla,
  TIPOS_CONTRATO,
} from './contratos-modalidades';
import { PersonalStore, ActorPersonal } from './personal.store';
import { PersonalService } from './personal.service';
import { hash, hoy, texto } from './personal.reglas';
import {
  CLAUSULAS_GUIA,
  datosContrato,
  resolverTexto,
  revisionContrato,
  secciones,
} from './contrato-editor.reglas';
const PDFDocument = require('pdfkit');
export async function pdfContrato(
  d: any,
  referencia: string,
  version: number,
  borrador: boolean,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 75, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: 'Contrato individual de trabajo',
          Author: d.razonSocial || d.empresa.nombre,
        },
      }),
      chunks: Buffer[] = [];
    pdf.on('data', (b: Buffer) => chunks.push(b));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf
      .font('Helvetica-Bold')
      .fontSize(17)
      .text('CONTRATO INDIVIDUAL DE TRABAJO');
    pdf.fontSize(10).text(d.tipo.replaceAll('_', ' '));
    pdf.moveDown();
    if (borrador)
      pdf
        .fillColor('#9a3412')
        .text('BORRADOR PARA REVISIÓN. NO ES UN CONTRATO FIRMADO.')
        .fillColor('black')
        .moveDown();
    function seccion(t: string, c: string) {
      if (pdf.y > 680) pdf.addPage();
      pdf.font('Helvetica-Bold').fontSize(11).text(resolverTexto(t, d));
      pdf.moveDown(0.3);
      pdf
        .font('Helvetica')
        .fontSize(10)
        .text(resolverTexto(c, d), { lineGap: 3 });
      pdf.moveDown();
    }
    seccion(
      '1. Identificación y domicilio de las partes',
      `Empleador: ${d.razonSocial || d.empresa.nombre}. NIT: ${d.empresa.nit}. Domicilio: ${d.domicilioEmpresa}.\nTrabajador: ${d.empleado.nombre}. Identificación: ${d.empleado.identificacion}. Domicilio: ${d.domicilioEmpleado}.`,
    );
    seccion(
      '2. Celebración, contratación y servicio',
      `Lugar de celebración: ${d.lugarCelebracion}. Fecha de celebración declarada: ${d.fechaCelebracion || d.fechaElaboracion}. Fecha real de elaboración: ${d.fechaElaboracion}. La fecha de cada firma será la registrada al realizarla.\nLugar de contratación: ${d.lugarContratacion}. Lugar de prestación del servicio: ${d.lugarServicio}.`,
    );
    seccion(
      '3. Naturaleza del trabajo',
      `Cargo: ${d.cargo}.\nFunciones: ${d.funciones}`,
    );
    seccion(
      '4. Remuneración, forma y periodos de pago',
      `Salario básico mensual total pactado (dinero más especie): COP ${(d.salarioCentavos / 100).toFixed(2)}. Componente en dinero: COP ${((d.salarioCentavos - d.especieCentavos) / 100).toFixed(2)}. Periodicidad: ${d.frecuencia}. Forma de pago: ${d.formaPago}.\nComponente mensual en especie, incluido en el total: COP ${(d.especieCentavos / 100).toFixed(2)}. ${d.especieDetalle}\nLos conceptos, deducciones y novedades legales deben reflejarse en la liquidación correspondiente; este contrato no constituye un recibo de pago.`,
    );
    seccion(
      '5. Jornada y descansos',
      `${d.jornada}\nDescansos y turnos: ${d.descansos}`,
    );
    seccion(
      '6. Duración, preaviso y terminación',
      `Inicio pactado: ${d.inicio}. ${d.fin ? 'Fin pactado: ' + d.fin + '.' : 'Sin fecha final pactada.'}\n${d.obra ? 'Obra o labor precisa: ' + d.obra + '\n' : ''}${d.terminacion}`,
    );
    for (const [i, c] of d.clausulas.entries())
      seccion(`${7 + i}. ${c.titulo}`, c.contenido);
    for (const [i, c] of d.anexos.entries()) {
      pdf.addPage();
      seccion(`ANEXO ${i + 1}: ${c.titulo}`, c.contenido);
    }
    seccion(
      'Aceptación y entrega de copias',
      'Este original se somete a la aceptación separada del empleador y del trabajador. Las evidencias de firma identifican el documento mediante SHA-256 y se entregan junto con el original y sus anexos. La elaboración o revisión del borrador no equivale a una firma. La firma electrónica es voluntaria; puede solicitarse una alternativa en papel.',
    );
    const range = pdf.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      pdf.switchToPage(i);
      pdf.page.margins.bottom = 30;
      pdf
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(
          `${borrador ? 'BORRADOR · ' : ''}Referencia ${referencia} · versión ${version} · página ${i + 1}/${range.count}`,
          50,
          790,
          { width: 490, lineBreak: false },
        );
    }
    pdf.end();
  });
}
@Injectable()
export class ContratoEditorService {
  constructor(
    readonly store: PersonalStore,
    private personal: PersonalService,
  ) {}
  async inicio(a: ActorPersonal) {
    await this.store.preparar();
    return {
      borradores: await this.store.listar(a, 'BORRADOR'),
      modelos: await this.store.listar(a, 'MODELO'),
      guia: CLAUSULAS_GUIA,
      plantillasModalidad: await this.store.listar(a, 'CONTRATO_BASE'),
      modalidades: TIPOS_CONTRATO.map(baseModalidad),
      privacidad: await this.personal.config(a),
      variables: [
        'empresa',
        'nit',
        'empleado',
        'documento',
        'cargo',
        'salario',
        'inicio',
        'fechaCelebracion',
        'fin',
        'lugar',
      ],
      empresa: await this.empresa(a),
    };
  }
  async plantillaModalidad(a: ActorPersonal, d: any) {
    await this.store.preparar();
    const tipos = d.aplicarATodas === true ? TIPOS_CONTRATO : [d.tipo];
    const versiones = await this.store.listar(a, 'CONTRATO_BASE');
    const preparados = tipos.map((tipo) =>
      condicionesPlantilla({
        ...d,
        tipo,
        ...(d.aplicarATodas === true
          ? {
              nombre: baseModalidad(tipo).nombre,
              terminacion: baseModalidad(tipo).terminacion,
            }
          : {}),
      }),
    );
    return this.store.prisma.$transaction(async (tx) => {
      const resultado: any[] = [];
      for (const datos of preparados) {
        const anterior = versiones.find(
          (r: any) => r.datos.tipo === datos.tipo,
        );
        const r = await this.store.crear(
          a,
          'CONTRATO_BASE',
          {
            ...datos,
            anteriorId: anterior?.id || null,
            guardadaEn: new Date().toISOString(),
          },
          { estado: 'CONFIGURADA' },
          tx,
        );
        await this.store.evento(
          a,
          r.id,
          'CONFIGURAR_PLANTILLA_MODALIDAD',
          { tipo: datos.tipo },
          tx,
        );
        resultado.push(r);
      }
      return resultado;
    });
  }
  async prepararContrato(a: ActorPersonal, d: any) {
    await this.store.preparar();
    const p = await this.store.obtener(
      a,
      texto(d.plantillaId, 'plantilla', 36),
      'CONTRATO_BASE',
    );
    const e = await this.store.obtener(
      a,
      texto(d.empleadoId, 'empleado', 36),
      'EMPLEADO',
    );
    const datos = completarContrato(p.datos, e.datos, d);
    return this.guardar(a, { ...datos, plantillaModalidadId: p.id });
  }
  private async empresa(a: ActorPersonal, tx?: any) {
    return this.store.db(tx).empresa.findUnique({
      where: { id: a.empresaId },
      select: { nombre: true, nit: true, direccion: true },
    });
  }
  async modelo(a: ActorPersonal, d: any) {
    await this.store.preparar();
    if (d.anteriorId)
      await this.store.obtener(
        a,
        texto(d.anteriorId, 'modelo anterior', 36),
        'MODELO',
      );
    const datos = {
      nombre: texto(d.nombre, 'nombre del modelo', 200),
      clausulas: secciones(d.clausulas, 'cláusulas'),
      anexos: secciones(d.anexos || [], 'anexos', 10),
      anteriorId: d.anteriorId || null,
      advertencia:
        'Guía editable. No sustituye la revisión jurídica del contrato individual.',
    };
    const r = await this.store.crear(a, 'MODELO', datos, { estado: 'GUIA' });
    await this.store.evento(a, r.id, 'CREAR_VERSION_MODELO', {});
    return r;
  }
  async guardar(a: ActorPersonal, d: any, id?: string) {
    await this.store.preparar();
    if (!(await this.personal.config(a)))
      throw new BadRequestException('Configura primero el aviso de privacidad');
    const datos = datosContrato(d);
    if (d.plantillaModalidadId) {
      const p = await this.store.obtener(
        a,
        texto(d.plantillaModalidadId, 'plantilla por modalidad', 36),
        'CONTRATO_BASE',
      );
      if (p.datos.tipo !== datos.tipo)
        throw new BadRequestException(
          'La plantilla no corresponde a la modalidad',
        );
    }
    if (d.modeloId)
      await this.store.obtener(
        a,
        texto(d.modeloId, 'modelo de la empresa', 36),
        'MODELO',
      );
    return this.store.prisma.$transaction(async (tx) => {
      let previo: any;
      if (id) {
        await this.store.bloquear(a, id, tx);
        previo = await this.store.obtener(a, id, 'BORRADOR', tx);
        if (previo.estado === 'EMITIDO')
          throw new BadRequestException(
            'Un contrato emitido conserva su original; crea otro borrador',
          );
        if (previo.datos.empleadoId !== datos.empleadoId)
          throw new BadRequestException(
            'Para otro empleado crea un nuevo borrador',
          );
        if (previo.version !== Number(d.versionEsperada))
          throw new ConflictException(
            'Otro usuario cambió el borrador; recárgalo antes de guardar',
          );
      }
      const empleado = await this.store.obtener(
          a,
          datos.empleadoId,
          'EMPLEADO',
          tx,
        ),
        empresa = await this.empresa(a, tx);
      if (!empresa?.nit || !empresa?.direccion)
        throw new BadRequestException(
          'Completa el NIT y la dirección del empleador',
        );
      const payload = {
        ...datos,
        modeloId: d.modeloId || null,
        plantillaModalidadId: d.plantillaModalidadId || null,
        razonSocial: datos.razonSocial || empresa.nombre,
        empresa,
        empleado: empleado.datos,
        empleadoHuella: hash(JSON.stringify(empleado.datos)),
        empresaHuella: hash(JSON.stringify(empresa)),
        fechaElaboracion: hoy(),
      };
      for (const c of [...payload.clausulas, ...payload.anexos]) {
        resolverTexto(c.titulo, payload);
        resolverTexto(c.contenido, payload);
      }
      if (previo)
        await this.store.crear(
          a,
          'REV_CONTRATO',
          {
            version: previo.version,
            estado: previo.estado,
            contenido: previo.datos,
          },
          { referenciaId: previo.id },
          tx,
        );
      const r = previo
        ? await this.store.actualizar(a, previo, payload, 'BORRADOR', tx)
        : await this.store.crear(
            a,
            'BORRADOR',
            payload,
            { referenciaId: datos.empleadoId, estado: 'BORRADOR' },
            tx,
          );
      await this.store.evento(
        a,
        r.id,
        'GUARDAR_BORRADOR',
        { version: r.version, revisionInvalidada: !!previo },
        tx,
      );
      return r;
    });
  }
  async vista(a: ActorPersonal, id: string, version?: number) {
    const r = await this.store.obtener(a, id, 'BORRADOR');
    if (version !== undefined) {
      if (!Number.isSafeInteger(version) || version < 1)
        throw new BadRequestException('Versión inválida');
      const historial = await this.store.listar(a, 'REV_CONTRATO', id),
        anterior = historial.find((v: any) => v.datos.version === version);
      if (!anterior) throw new BadRequestException('Versión no encontrada');
      return pdfContrato(anterior.datos.contenido, id, version, true);
    }
    return pdfContrato(r.datos, id, r.version, true);
  }
  async historial(a: ActorPersonal, id: string) {
    await this.store.obtener(a, id, 'BORRADOR');
    return this.store.listar(a, 'REV_CONTRATO', id);
  }
  async originalRevisado(a: ActorPersonal, id: string) {
    const r = await this.store.obtener(a, id, 'BORRADOR');
    if (!r.datos.revision)
      throw new BadRequestException(
        'Este borrador no tiene una revisión vigente',
      );
    const f = await this.store.obtener(
        a,
        r.datos.revision.archivoId,
        'ARCHIVO',
      ),
      bytes = Buffer.from(f.datos.contenido, 'base64');
    if (hash(bytes) !== r.datos.revision.documentoHash)
      throw new ConflictException('El original no coincide con su revisión');
    return bytes;
  }
  async revisar(a: ActorPersonal, id: string, d: any) {
    const revision = revisionContrato(d);
    return this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, id, tx);
      const r = await this.store.obtener(a, id, 'BORRADOR', tx);
      if (r.estado !== 'BORRADOR' || r.version !== Number(d.versionEsperada))
        throw new ConflictException('Revisa la versión actual del borrador');
      const final = await pdfContrato(r.datos, r.id, r.version, false);
      const archivo = await this.store.crear(
        a,
        'ARCHIVO',
        {
          nombre: 'contrato-original.pdf',
          contenido: final.toString('base64'),
          sha256: hash(final),
          mime: 'application/pdf',
        },
        { referenciaId: id },
        tx,
      );
      await this.store.crear(
        a,
        'REV_CONTRATO',
        { version: r.version, estado: r.estado, contenido: r.datos },
        { referenciaId: id },
        tx,
      );
      await this.store.evento(
        a,
        id,
        'REVISAR_BORRADOR',
        { documentoHash: hash(final), revision },
        tx,
      );
      return this.store.actualizar(
        a,
        r,
        {
          ...r.datos,
          revision: {
            ...revision,
            versionRevisada: r.version,
            archivoId: archivo.id,
            documentoHash: hash(final),
            fecha: new Date().toISOString(),
            actorId: a.id,
          },
        },
        'REVISADO',
        tx,
      );
    });
  }
  async emitir(a: ActorPersonal, id: string, d: any) {
    return this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, id, tx);
      const r = await this.store.obtener(a, id, 'BORRADOR', tx);
      if (r.estado === 'EMITIDO')
        return this.store.obtener(a, r.datos.contratoId, 'CONTRATO', tx);
      if (
        r.estado !== 'REVISADO' ||
        r.version !== Number(d.versionEsperada) ||
        d.acepta !== true
      )
        throw new ConflictException(
          'Revisa y confirma la versión actual antes de emitir',
        );
      await this.store.bloquear(a, r.datos.empleadoId, tx);
      const e = await this.store.obtener(a, r.datos.empleadoId, 'EMPLEADO', tx),
        empresa = await this.empresa(a, tx);
      if (
        hash(JSON.stringify(e.datos)) !== r.datos.empleadoHuella ||
        hash(JSON.stringify(empresa)) !== r.datos.empresaHuella
      )
        throw new ConflictException(
          'Los datos de las partes cambiaron: guarda y revisa de nuevo el borrador',
        );
      const archivo = await this.store.obtener(
        a,
        r.datos.revision.archivoId,
        'ARCHIVO',
        tx,
      );
      if (
        hash(Buffer.from(archivo.datos.contenido, 'base64')) !==
        r.datos.revision.documentoHash
      )
        throw new ConflictException('El original no coincide con la revisión');
      const plantilla = await this.store.crear(
        a,
        'PLANTILLA',
        {
          nombre: 'Contrato creado en el editor',
          archivoId: archivo.id,
          sha256: archivo.datos.sha256,
          ...r.datos.revision,
          alcance: r.datos.revision.alcance,
        },
        { referenciaId: id, estado: 'REVISADA' },
        tx,
      );
      const contrato = await this.personal.contrato(
        a,
        {
          empleadoId: e.id,
          razonSocial: r.datos.razonSocial || r.datos.empresa.nombre,
          plantillaId: plantilla.id,
          archivoId: archivo.id,
          tipo: r.datos.tipo,
          inicio: r.datos.inicio,
          fin: r.datos.fin,
          obra: r.datos.obra,
          funciones: r.datos.funciones,
          lugar: r.datos.lugarServicio,
          salario: String(r.datos.salarioCentavos / 100),
          revisadaPor: r.datos.revision.revisadaPor,
          revisado: true,
        },
        tx,
      );
      await this.store.actualizar(
        a,
        r,
        {
          ...r.datos,
          contratoId: contrato.id,
          emitidoEn: new Date().toISOString(),
        },
        'EMITIDO',
        tx,
      );
      await this.store.evento(
        a,
        id,
        'EMITIR_CONTRATO',
        {
          contratoId: contrato.id,
          documentoHash: r.datos.revision.documentoHash,
        },
        tx,
      );
      return contrato;
    });
  }
}
