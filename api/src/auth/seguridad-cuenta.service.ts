import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { motorBase } from '../prisma/mysql-adapter';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  abrirSecreto,
  cifrarSecreto,
  codigosRecuperacion,
  describirAgente,
  hashRecuperacion,
  huellaDispositivo,
  nuevoSecreto,
  uriTotp,
  verificarTotp,
} from './dos-pasos';

type Actor = { id: number; rol: string; empresaId: number | null; sucursalId: number | null; email?: string; nombre?: string; sesionId?: string };
type Meta = { ip: string; agente: string };
type DosPasos = { secreto: any; ultimoPaso: number; recuperacion: string[]; fallos: number; bloqueadoHasta: number };
const OCHO_HORAS = 8 * 3600000;

@Injectable()
export class SeguridadCuentaService {
  private readonly logger = new Logger(SeguridadCuentaService.name);
  private readonly preparadas = new WeakSet<object>();
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificaciones?: NotificacionesService,
  ) {}

  // La misma base que consulta la estrategia JWT para ese usuario.
  async base(u: { rol: string; empresaId: number | null; sucursalId: number | null }): Promise<any> {
    if (this.prisma.aislamientoActivo && u.rol !== 'SUPERADMIN') {
      if (!Number.isSafeInteger(u.empresaId) || !Number.isSafeInteger(u.sucursalId))
        throw new ForbiddenException('La sesión requiere una sede válida');
      return (await this.prisma.contexto(u.empresaId!, u.sucursalId!)).cliente;
    }
    return this.prisma.control || this.prisma;
  }

  // DDL aditivo y estático en la base del usuario autenticado; nunca altera tablas existentes.
  async preparar(db: any) {
    if (this.preparadas.has(db)) return;
    const mysql = motorBase() === 'mysql';
    await db.$executeRawUnsafe(
      mysql
        ? `CREATE TABLE IF NOT EXISTS seguridad_registros (id VARCHAR(36) NOT NULL PRIMARY KEY, usuarioId INT NOT NULL, tipo VARCHAR(16) NOT NULL, clave VARCHAR(64) NOT NULL, estado VARCHAR(16) NOT NULL, datos JSON NOT NULL, creadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY seguridad_clave (usuarioId,tipo,clave), KEY seguridad_listado (usuarioId,tipo,creadoEn)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        : `CREATE TABLE IF NOT EXISTS seguridad_registros (id VARCHAR(36) PRIMARY KEY, "usuarioId" INTEGER NOT NULL, tipo VARCHAR(16) NOT NULL, clave VARCHAR(64) NOT NULL, estado VARCHAR(16) NOT NULL, datos JSONB NOT NULL, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("usuarioId",tipo,clave))`,
    );
    if (!mysql)
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS seguridad_registros_listado ON seguridad_registros ("usuarioId", tipo, "creadoEn")`,
      );
    this.preparadas.add(db);
  }

  private async registro(db: any, usuarioId: number, tipo: string, clave: string) {
    try {
      return await db.seguridadRegistro.findUnique({ where: { usuarioId_tipo_clave: { usuarioId, tipo, clave } } });
    } catch (e) {
      if (e?.code === 'P2021') return null;
      throw e;
    }
  }

  async dosPasosActivo(db: any, usuarioId: number) {
    return !!(await this.registro(db, usuarioId, '2FA', 'activo'));
  }

  // ---------- Sesiones ----------
  async crearSesion(db: any, usuario: { id: number; email: string; nombre: string }, meta: Meta) {
    await this.preparar(db);
    const sid = randomUUID();
    const agente = String(meta.agente || '').slice(0, 300);
    const huella = huellaDispositivo(meta.ip || '', agente);
    const desde = new Date(Date.now() - 90 * 86400000);
    const previas = await db.seguridadRegistro.findMany({
      where: { usuarioId: usuario.id, tipo: 'SESION', creadoEn: { gte: desde } },
      select: { datos: true },
      take: 500,
    });
    await db.seguridadRegistro.create({
      data: { id: randomUUID(), usuarioId: usuario.id, tipo: 'SESION', clave: sid, estado: 'ACTIVA', datos: { ip: meta.ip, agente, huella } },
    });
    // Limpieza: el historial de sesiones se conserva 90 días para reconocer dispositivos.
    await db.seguridadRegistro.deleteMany({ where: { usuarioId: usuario.id, tipo: 'SESION', creadoEn: { lt: desde } } }).catch(() => undefined);
    if (previas.length && !previas.some((p: any) => p.datos?.huella === huella) && this.notificaciones)
      void this.notificaciones
        .enviarAvisoAcceso(usuario.email, usuario.nombre, describirAgente(agente), meta.ip, new Date())
        .catch(() => undefined);
    return sid;
  }

  async sesionValida(db: any, usuarioId: number, sid: string) {
    const r = await this.registro(db, usuarioId, 'SESION', sid);
    return !!r && r.estado === 'ACTIVA' && r.creadoEn.getTime() > Date.now() - OCHO_HORAS;
  }

  async resumen(u: Actor) {
    const db = await this.base(u);
    let sesiones: any[] = [];
    try {
      sesiones = await db.seguridadRegistro.findMany({
        where: { usuarioId: u.id, tipo: 'SESION', estado: 'ACTIVA', creadoEn: { gte: new Date(Date.now() - OCHO_HORAS) } },
        orderBy: { creadoEn: 'desc' },
        take: 50,
      });
    } catch (e) {
      if (e?.code !== 'P2021') throw e;
    }
    return {
      dosPasos: await this.dosPasosActivo(db, u.id),
      dosPasosRecomendado: ['SUPERADMIN', 'ADMIN_EMPRESA', 'GERENTE'].includes(u.rol),
      sesiones: sesiones.map((s) => ({
        id: s.clave,
        actual: s.clave === u.sesionId,
        dispositivo: describirAgente(s.datos?.agente || ''),
        ip: s.datos?.ip || '',
        creadoEn: s.creadoEn,
      })),
    };
  }

  async revocar(u: Actor, sid: string) {
    const db = await this.base(u);
    const n = await db.seguridadRegistro.updateMany({ where: { usuarioId: u.id, tipo: 'SESION', clave: String(sid).slice(0, 64) }, data: { estado: 'REVOCADA' } });
    if (!n.count) throw new NotFoundException('Sesión no encontrada');
    return { ok: true };
  }

  async cerrarOtras(u: Actor) {
    const db = await this.base(u);
    await db.seguridadRegistro.updateMany({
      where: { usuarioId: u.id, tipo: 'SESION', estado: 'ACTIVA', ...(u.sesionId ? { NOT: { clave: u.sesionId } } : {}) },
      data: { estado: 'REVOCADA' },
    });
    return { ok: true };
  }

  // ---------- Verificación en dos pasos ----------
  async iniciar(u: Actor) {
    const db = await this.base(u);
    await this.preparar(db);
    if (await this.dosPasosActivo(db, u.id)) throw new BadRequestException('La verificación en dos pasos ya está activa');
    const secreto = nuevoSecreto();
    const datos = { secreto: cifrarSecreto(secreto, `${u.id}:2FA:pendiente`), creado: Date.now() };
    await db.seguridadRegistro.upsert({
      where: { usuarioId_tipo_clave: { usuarioId: u.id, tipo: '2FA', clave: 'pendiente' } },
      create: { id: randomUUID(), usuarioId: u.id, tipo: '2FA', clave: 'pendiente', estado: 'PENDIENTE', datos },
      update: { datos },
    });
    return { secreto, uri: uriTotp(secreto, u.email || `usuario-${u.id}`) };
  }

  async activar(u: Actor, codigo: unknown) {
    const db = await this.base(u);
    const p = await this.registro(db, u.id, '2FA', 'pendiente');
    if (!p || Date.now() - p.datos.creado > 900000) throw new BadRequestException('Vuelve a generar el código QR');
    const secreto = abrirSecreto(p.datos.secreto, `${u.id}:2FA:pendiente`);
    const paso = verificarTotp(secreto, codigo, 0);
    if (paso === null) throw new BadRequestException('El código no coincide. Revisa la hora del teléfono e intenta de nuevo.');
    const recuperacion = codigosRecuperacion();
    const datos: DosPasos = { secreto: cifrarSecreto(secreto, `${u.id}:2FA:activo`), ultimoPaso: paso, recuperacion: recuperacion.map(hashRecuperacion), fallos: 0, bloqueadoHasta: 0 };
    await db.$transaction(async (tx: any) => {
      await tx.seguridadRegistro.deleteMany({ where: { usuarioId: u.id, tipo: '2FA' } });
      await tx.seguridadRegistro.create({ data: { id: randomUUID(), usuarioId: u.id, tipo: '2FA', clave: 'activo', estado: 'ACTIVO', datos } });
    });
    // Los códigos de recuperación solo se muestran esta vez.
    return { recuperacion };
  }

  // Devuelve true si el código (TOTP o de recuperación) es válido; cuenta fallos y bloquea 15 minutos tras 5.
  async verificar(db: any, usuarioId: number, codigo: unknown) {
    const r = await this.registro(db, usuarioId, '2FA', 'activo');
    if (!r) return true;
    const d = r.datos as DosPasos;
    if (d.bloqueadoHasta > Date.now())
      throw new HttpException('Demasiados códigos incorrectos. Espera 15 minutos.', 429);
    const texto = typeof codigo === 'string' ? codigo.trim() : '';
    let nuevo: DosPasos | null = null;
    const paso = verificarTotp(abrirSecreto(d.secreto, `${usuarioId}:2FA:activo`), texto, d.ultimoPaso);
    if (paso !== null) nuevo = { ...d, ultimoPaso: paso, fallos: 0 };
    else if (/^[A-Z2-7]{5}-?[A-Z2-7]{5}$/i.test(texto) && d.recuperacion.includes(hashRecuperacion(texto)))
      nuevo = { ...d, recuperacion: d.recuperacion.filter((h) => h !== hashRecuperacion(texto)), fallos: 0 };
    const fallos = d.fallos + 1;
    const datos = nuevo || { ...d, fallos: fallos >= 5 ? 0 : fallos, bloqueadoHasta: fallos >= 5 ? Date.now() + 900000 : d.bloqueadoHasta };
    // Actualización condicionada: el mismo código no se acepta dos veces en paralelo.
    const n = await db.seguridadRegistro.updateMany({ where: { id: r.id, actualizadoEn: r.actualizadoEn }, data: { datos } });
    return !!nuevo && n.count === 1;
  }

  async desactivar(u: Actor, password: unknown, codigo: unknown) {
    const db = await this.base(u);
    const usuario = await db.usuario.findUnique({ where: { id: u.id }, select: { password: true } });
    if (!usuario || typeof password !== 'string' || !(await bcrypt.compare(password.slice(0, 500), usuario.password)))
      throw new ForbiddenException('La contraseña no coincide');
    if (!(await this.verificar(db, u.id, codigo))) throw new ForbiddenException('El código no es válido');
    await db.seguridadRegistro.deleteMany({ where: { usuarioId: u.id, tipo: '2FA' } });
    this.logger.log(`Verificación en dos pasos desactivada para el usuario ${u.id}`);
    return { ok: true };
  }
}
