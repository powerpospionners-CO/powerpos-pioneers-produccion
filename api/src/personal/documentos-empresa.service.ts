import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PersonalStore, ActorPersonal } from './personal.store';
import { fecha, hash, hoy, texto } from './personal.reglas';
const PDFDocument = require('pdfkit');

export function dividirModelo(contenido: string) {
  const partes: string[] = [];
  let actual = '';
  for (const linea of contenido.split('\n')) {
    if (linea.length > 3500)
      throw new BadRequestException(
        'Divide los párrafos del modelo con saltos de línea; cada párrafo debe tener máximo 3.500 caracteres',
      );
    if (actual.length + linea.length + 1 > 3500) {
      partes.push(actual.trim());
      actual = '';
    }
    actual += (actual ? '\n' : '') + linea;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes.filter(Boolean);
}

export function enlacePolitica(valor: unknown) {
  if (!valor) return null;
  const s = texto(valor, 'enlace de la política', 1500);
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) throw new Error();
    return u.href;
  } catch {
    throw new BadRequestException(
      'La política externa requiere un enlace HTTPS sin credenciales',
    );
  }
}

export async function pdfPolitica(d: any, estado: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const p = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    p.on('data', (b: Buffer) => chunks.push(b));
    p.on('error', reject);
    p.on('end', () => resolve(Buffer.concat(chunks)));
    p.fontSize(16).text(d.nombre);
    p.moveDown();
    p.fontSize(10).text(`${estado} · Versión ${d.versionEtiqueta}`);
    p.text(`Responsable: ${d.responsable} · NIT: ${d.nit}`);
    p.text(`Contacto: ${d.correo} · ${d.telefono} · ${d.direccion}`);
    if (d.vigencia) p.text(`Vigencia desde ${d.vigencia}`);
    p.moveDown();
    p.text(d.contenido, { lineGap: 3 });
    const range = p.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      p.switchToPage(i);
      p.page.margins.bottom = 25;
      p.fontSize(8).text(
        `Versión ${d.versionEtiqueta} · ${i + 1}/${range.count}`,
        50,
        800,
        { lineBreak: false },
      );
    }
    p.end();
  });
}

@Injectable()
export class DocumentosEmpresaService {
  constructor(readonly store: PersonalStore) {}
  async inicio(a: ActorPersonal) {
    await this.store.preparar();
    return {
      documentos: await this.store.listar(a, 'DOC_EMPRESA'),
      entregas: await this.store.listar(a, 'POL_ENTREGA'),
    };
  }
  async crear(a: ActorPersonal, d: any) {
    await this.store.preparar();
    if (!['POLITICA', 'AVISO', 'CONTRATO'].includes(d.tipo))
      throw new BadRequestException('Selecciona el tipo de plantilla');
    const datos: any = {
      tipo: d.tipo,
      nombre: texto(d.nombre, 'nombre', 200),
      versionEtiqueta: texto(d.versionEtiqueta, 'versión', 60),
      responsable: texto(d.responsable, 'razón social legal', 300),
      nit: texto(d.nit, 'NIT', 40),
      correo: texto(d.correo, 'correo', 254),
      telefono: texto(d.telefono, 'teléfono', 80),
      direccion: texto(d.direccion, 'dirección', 500),
      domicilio: texto(d.domicilio, 'domicilio legal', 300),
      contenido: d.contenido ? texto(d.contenido, 'contenido', 30000) : '',
      anteriorId: d.anteriorId
        ? texto(d.anteriorId, 'versión anterior', 36)
        : null,
      archivoId: d.archivoId ? texto(d.archivoId, 'archivo', 36) : null,
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo))
      throw new BadRequestException('Correo inválido');
    if (Boolean(datos.contenido) === Boolean(datos.archivoId))
      throw new BadRequestException(
        'Escribe el contenido o carga un PDF, no ambos',
      );
    if (d.tipo === 'CONTRATO' && datos.archivoId)
      throw new BadRequestException(
        'Los modelos editables requieren texto; carga contratos externos desde Contratos',
      );
    return this.store.prisma.$transaction(async (tx) => {
      if (datos.anteriorId) {
        const anterior = await this.store.obtener(
          a,
          datos.anteriorId,
          'DOC_EMPRESA',
          tx,
        );
        if (anterior.datos.tipo !== d.tipo)
          throw new BadRequestException('La versión anterior es de otro tipo');
      }
      if (datos.archivoId) {
        const f = await this.store.obtener(a, datos.archivoId, 'ARCHIVO', tx);
        datos.sha256 = f.datos.sha256;
      } else datos.sha256 = hash(datos.contenido);
      const r = await this.store.crear(
        a,
        'DOC_EMPRESA',
        datos,
        { estado: 'BORRADOR' },
        tx,
      );
      if (d.tipo === 'CONTRATO') {
        // Secciones cortas compatibles con el editor individual; nunca se emite ni firma automáticamente.
        const partes = dividirModelo(datos.contenido);
        await this.store.crear(
          a,
          'MODELO',
          {
            nombre: `${datos.nombre} · ${datos.versionEtiqueta}`,
            clausulas: partes.map((contenido: string, i: number) => ({
              titulo: `Condiciones del modelo ${i + 1}`,
              contenido,
            })),
            anexos: [],
            documentoEmpresaId: r.id,
            advertencia: 'Plantilla editable pendiente de revisión individual.',
          },
          { estado: 'GUIA' },
          tx,
        );
      }
      await this.store.evento(
        a,
        r.id,
        'CREAR_PLANTILLA_EMPRESA',
        { tipo: d.tipo },
        tx,
      );
      return r;
    });
  }
  async adoptar(a: ActorPersonal, id: string, d: any) {
    if (d.acepta !== true)
      throw new BadRequestException(
        'Confirma la revisión y la disponibilidad de la política',
      );
    const vigencia = fecha(d.vigencia);
    if (vigencia > hoy())
      throw new BadRequestException(
        'No se puede activar una política con fecha futura',
      );
    const revisadaPor = texto(d.revisadaPor, 'responsable de revisión', 200);
    return this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, id, tx);
      const r = await this.store.obtener(a, id, 'DOC_EMPRESA', tx);
      if (r.estado !== 'BORRADOR' || r.datos.tipo !== 'POLITICA')
        throw new BadRequestException(
          'Solo se adopta una política en borrador; crea una nueva versión para modificarla',
        );
      if (/\[[^\]]+\]|\{\{/.test(r.datos.contenido))
        throw new BadRequestException(
          'Completa los campos pendientes del texto antes de adoptar',
        );
      const nuevo = await this.store.actualizar(
        a,
        r,
        {
          ...r.datos,
          vigencia,
          revisadaPor,
          adoptadaEn: new Date().toISOString(),
          publicada: d.publicar === true,
        },
        'ADOPTADA',
        tx,
      );
      await this.store.evento(
        a,
        id,
        'ADOPTAR_POLITICA',
        { publicada: d.publicar === true, sha256: r.datos.sha256 },
        tx,
      );
      return nuevo;
    });
  }
  async retirarEnlace(a: ActorPersonal, id: string) {
    return this.store.prisma.$transaction(async (tx) => {
      await this.store.bloquear(a, id, tx);
      const r = await this.store.obtener(a, id, 'DOC_EMPRESA', tx);
      if (r.estado !== 'ADOPTADA' || r.datos.tipo !== 'POLITICA')
        throw new BadRequestException('Selecciona una política adoptada');
      const nuevo = await this.store.actualizar(
        a,
        r,
        { ...r.datos, publicada: false },
        r.estado,
        tx,
      );
      await this.store.evento(a, id, 'RETIRAR_ENLACE_POLITICA', {}, tx);
      return nuevo;
    });
  }
  async documento(a: ActorPersonal, id: string, publico = false) {
    const r = await this.store.obtener(a, id, 'DOC_EMPRESA');
    if (
      publico &&
      (r.estado !== 'ADOPTADA' ||
        r.datos.tipo !== 'POLITICA' ||
        r.datos.publicada !== true)
    )
      throw new NotFoundException('Política no publicada');
    const bytes = r.datos.archivoId
      ? Buffer.from(
          (await this.store.obtener(a, r.datos.archivoId, 'ARCHIVO')).datos
            .contenido,
          'base64',
        )
      : await pdfPolitica(r.datos, r.estado);
    return { registro: r, bytes };
  }
  async entregar(a: ActorPersonal, id: string, d: any) {
    const fechaEntrega = fecha(d.fecha);
    if (
      fechaEntrega > hoy() ||
      d.confirmado !== true ||
      !['PAPEL', 'CORREO', 'PRESENCIAL'].includes(d.medio)
    )
      throw new BadRequestException(
        'Revisa fecha, medio y confirmación de entrega',
      );
    return this.store.prisma.$transaction(async (tx) => {
      const p = await this.store.obtener(a, id, 'DOC_EMPRESA', tx);
      if (p.estado !== 'ADOPTADA' || p.datos.tipo !== 'POLITICA')
        throw new BadRequestException('Selecciona una política adoptada');
      const e = await this.store.obtener(
        a,
        texto(d.empleadoId, 'empleado', 36),
        'EMPLEADO',
        tx,
      );
      if (d.soporteId)
        await this.store.obtener(
          a,
          texto(d.soporteId, 'soporte', 36),
          'ARCHIVO',
          tx,
        );
      const r = await this.store.crear(
        a,
        'POL_ENTREGA',
        {
          empleadoId: e.id,
          empleadoNombre: e.datos.nombre,
          politicaId: p.id,
          nombre: p.datos.nombre,
          versionEtiqueta: p.datos.versionEtiqueta,
          sha256: p.datos.sha256,
          fecha: fechaEntrega,
          medio: d.medio,
          soporteId: d.soporteId || null,
          observacion: d.observacion
            ? texto(d.observacion, 'observación', 2000)
            : '',
          registradoPor: a.id,
          alcance:
            'Constancia administrativa de entrega; no equivale a firma ni autorización del empleado.',
        },
        { referenciaId: e.id },
        tx,
      );
      await this.store.evento(
        a,
        e.id,
        'ENTREGAR_POLITICA',
        { politicaId: p.id, entregaId: r.id },
        tx,
      );
      return r;
    });
  }
}
