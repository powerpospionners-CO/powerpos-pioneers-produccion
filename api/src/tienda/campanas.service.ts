import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TiendaRegistros, Registro } from './tienda-registros';
import type { Cupon } from './tienda-extras.reglas';

type Usuario = { id: number; rol: string; empresaId: number };
type Suscriptor = { nombre?: string; correo?: string; whatsapp?: string; consentimientoEn?: string };
export type Segmento = 'TODOS' | 'NUEVOS' | 'ANTIGUOS';
export const MAX_DESTINATARIOS = 2000;
export const HORAS_ENTRE_CAMPANAS = 12;
const DIA = 86400000;

// Plantillas sugeridas; el administrador puede editar el texto antes de enviar.
export const PLANTILLAS = [
  { id: 'extranamos', nombre: 'Te extrañamos', asunto: 'Te extrañamos en {empresa}', mensaje: 'Hace un tiempo no te vemos y queremos invitarte de nuevo.\nTe tenemos un detalle para tu próxima compra.' },
  { id: 'promocion', nombre: 'Promoción', asunto: 'Promoción especial en {empresa}', mensaje: 'Esta semana tenemos una promoción especial para ti.\nAprovéchala antes de que se acabe.' },
  { id: 'novedad', nombre: 'Novedad', asunto: 'Novedades en {empresa}', mensaje: 'Tenemos productos nuevos que te van a encantar.\nConócelos en nuestra tienda en línea.' },
];

export function validarCampana(body: unknown) {
  const v = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const segmento = (['TODOS', 'NUEVOS', 'ANTIGUOS'].includes(v.segmento as string) ? v.segmento : 'TODOS') as Segmento;
  const dias = Number(v.dias ?? 30);
  if (!Number.isSafeInteger(dias) || dias < 1 || dias > 365) throw new BadRequestException('Los días deben estar entre 1 y 365');
  const asunto = typeof v.asunto === 'string' ? v.asunto.trim() : '';
  const mensaje = typeof v.mensaje === 'string' ? v.mensaje.trim() : '';
  const cupon = typeof v.cupon === 'string' && v.cupon.trim() ? v.cupon.trim().toUpperCase() : null;
  return { segmento, dias, asunto, mensaje, cupon };
}

// Suscriptores del segmento con correo: NUEVOS = se suscribieron en los últimos N días; ANTIGUOS = antes de eso.
export function filtrarSegmento<T extends { creadoEn: Date; correo?: string }>(suscriptores: T[], segmento: Segmento, dias: number, ahora = Date.now()): T[] {
  const corte = ahora - dias * DIA;
  return suscriptores.filter((s) => !!s.correo && (segmento === 'TODOS' || (segmento === 'NUEVOS' ? s.creadoEn.getTime() >= corte : s.creadoEn.getTime() < corte)));
}

@Injectable()
export class CampanasService {
  private readonly logger = new Logger(CampanasService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly registros: TiendaRegistros,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async destinatarios(empresaId: number, segmento: Segmento, dias: number) {
    const filas: Registro[] = await this.registros.listar(empresaId, 'SUSCRIPTOR', { estado: 'ACTIVO' }, 20000);
    const lista = filas.map((r) => ({ creadoEn: r.creadoEn, ...this.registros.abrir<Suscriptor>(r) }));
    // Un mismo correo recibe un solo mensaje.
    const vistos = new Set<string>();
    return filtrarSegmento(lista, segmento, dias).filter((s) => {
      const c = String(s.correo).toLowerCase();
      if (vistos.has(c)) return false;
      vistos.add(c);
      return true;
    });
  }

  async resumen(user: Usuario) {
    const filas = await this.registros.listar(user.empresaId, 'CAMPANA', {}, 20);
    const cupones = (await this.registros.listar(user.empresaId, 'CUPON')).map((r) => r.datos as Cupon).filter((c) => c.activo);
    const total = (await this.destinatarios(user.empresaId, 'TODOS', 30)).length;
    return {
      correoDisponible: this.notificaciones.correoDisponible(),
      suscriptoresConCorreo: total,
      plantillas: PLANTILLAS,
      cupones: cupones.map((c) => ({ codigo: c.codigo, descripcion: c.descripcion })),
      historial: filas.map((r) => ({ id: r.id, ...(r.datos as object), fecha: r.creadoEn })),
    };
  }

  async vistaPrevia(user: Usuario, body: unknown) {
    const { segmento, dias } = validarCampana(body);
    const lista = await this.destinatarios(user.empresaId, segmento, dias);
    return { destinatarios: lista.length, muestra: lista.slice(0, 5).map((s) => (s.nombre || '').split(' ')[0] || 'Suscriptor') };
  }

  async enviar(user: Usuario, body: unknown) {
    if (user.rol !== 'ADMIN_EMPRESA') throw new ForbiddenException('Solo el administrador envía campañas');
    if (!this.notificaciones.correoDisponible()) throw new BadRequestException('El correo del sistema no está configurado');
    const c = validarCampana(body);
    if (c.asunto.length < 5 || c.asunto.length > 120) throw new BadRequestException('El asunto debe tener entre 5 y 120 caracteres');
    if (c.mensaje.length < 10 || c.mensaje.length > 2000) throw new BadRequestException('El mensaje debe tener entre 10 y 2000 caracteres');
    const empresa = await this.prisma.empresa.findUnique({ where: { id: user.empresaId }, select: { nombre: true, tiendaSlug: true, tiendaConfig: true } });
    if (!empresa?.tiendaSlug) throw new BadRequestException('La empresa no tiene tienda en línea');
    // Un envío por empresa cada 12 horas, para no saturar a los clientes ni al servidor de correo.
    const ultima = (await this.registros.listar(user.empresaId, 'CAMPANA', {}, 1))[0];
    if (ultima && Date.now() - ultima.creadoEn.getTime() < HORAS_ENTRE_CAMPANAS * 3600000)
      throw new HttpException(`Ya enviaste una campaña hace poco. Puedes enviar otra ${HORAS_ENTRE_CAMPANAS} horas después de la anterior.`, 429);
    let cupon: Cupon | null = null;
    if (c.cupon) {
      const r = await this.registros.buscar(user.empresaId, 'CUPON', c.cupon);
      const d = r?.datos as Cupon | undefined;
      if (!d?.activo) throw new BadRequestException('El cupón no existe o está inactivo');
      cupon = d;
    }
    const lista = await this.destinatarios(user.empresaId, c.segmento, c.dias);
    if (!lista.length) throw new BadRequestException('No hay suscriptores con correo en ese grupo');
    if (lista.length > MAX_DESTINATARIOS) throw new BadRequestException(`Una campaña llega a máximo ${MAX_DESTINATARIOS} correos; elige un grupo más pequeño`);
    const dominio = process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN || 'powerpospioneers.com';
    const tienda = `https://app.${dominio}/tienda/${encodeURIComponent(empresa.tiendaSlug)}`;
    const asunto = c.asunto.replace(/\{empresa\}/g, empresa.nombre);
    // Se registra antes de enviar: aunque el proceso se interrumpa, no se repite la campaña sin control.
    await this.registros.preparar();
    const registro = await this.registros.crear(user.empresaId, 'CAMPANA', `campana:${Date.now()}`, { asunto, segmento: c.segmento, dias: c.dias, cupon: c.cupon, destinatarios: lista.length, enviados: 0, fallidos: 0, usuarioId: user.id, estado: 'ENVIANDO' }, { cifrar: false });
    let enviados = 0, fallidos = 0;
    for (let i = 0; i < lista.length; i += 5) {
      const lote = lista.slice(i, i + 5);
      const resultados = await Promise.all(lote.map((s) => this.notificaciones.enviarCampana(String(s.correo), {
        empresa: empresa.nombre,
        asunto,
        mensaje: c.mensaje.replace(/\{empresa\}/g, empresa.nombre).replace(/\{nombre\}/g, (s.nombre || '').split(' ')[0] || ''),
        cupon: cupon ? { codigo: cupon.codigo, descripcion: cupon.descripcion } : null,
        enlaceTienda: tienda,
        enlaceBaja: `${tienda}?baja=${encodeURIComponent(String(s.correo))}#boletin`,
      })));
      resultados.forEach((ok) => (ok ? enviados++ : fallidos++));
    }
    await this.registros.actualizar(registro, { datos: { ...(registro.datos as object), enviados, fallidos, estado: 'ENVIADA' }, cifrar: false });
    this.logger.log(`Campaña de la empresa ${user.empresaId}: ${enviados} enviados, ${fallidos} fallidos`);
    return { enviados, fallidos, destinatarios: lista.length };
  }
}
