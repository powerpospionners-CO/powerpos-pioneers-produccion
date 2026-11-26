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
// Roles a los que la empresa puede exigir la verificación en dos pasos.
export const ROLES_DOS_PASOS = ['ADMIN_EMPRESA', 'GERENTE'];
const politicaEmpresa = (empresaId: number) => ({ usuarioId: 0, tipo: 'POLITICA', clave: `exigir2fa:${empresaId}` });

@Injectable()
export class SeguridadCuentaService {
  private readonly logger = new Logger(SeguridadCuentaService.name);
  private readonly preparadas = new WeakSet<object>();
  // Caché corta por base: la estrategia JWT consulta la política en cada petición.
  private pendientes = new WeakMap<object, Map<number, { valor: boolean; vence: number }>>();
  private readonly fallosClave = new Map<number, { n: number; hasta: number }>();
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

  async politicaActiva(db: any, empresaId?: number | null) {
    if (!Number.isSafeInteger(empresaId) || !empresaId || empresaId < 1) return false;
    const POLITICA = politicaEmpresa(empresaId);
    return (await this.registro(db, POLITICA.usuarioId, POLITICA.tipo, POLITICA.clave))?.estado === 'ACTIVA';
  }

  // true si la empresa exige 2FA a este rol y el usuario todavía no la activó.
  async dosPasosPendiente(db: any, usuario: { id: number; rol: string; empresaId?: number | null }) {
    if (!ROLES_DOS_PASOS.includes(usuario.rol)) return false;
    let porBase = this.pendientes.get(db);
    if (!porBase) this.pendientes.set(db, (porBase = new Map()));
    const guardado = porBase.get(usuario.id);
    if (guardado && guardado.vence > Date.now()) return guardado.valor;
    const valor = (await this.politicaActiva(db, usuario.empresaId)) && !(await this.dosPasosActivo(db, usuario.id));
    porBase.set(usuario.id, { valor, vence: Date.now() + 30000 });
    return valor;
  }

  private olvidarPendientes() {
    this.pendientes = new WeakMap();
  }

  // Todas las bases de la empresa: la política y los restablecimientos aplican en cada sede.
  private async basesEmpresa(u: Actor): Promise<any[]> {
    if (this.prisma.aislamientoActivo && u.rol !== 'SUPERADMIN') {
      const sedes = await this.prisma.control.baseSede.findMany({
        where: { empresaId: u.empresaId!, estado: 'ACTIVA' },
        select: { empresaId: true, sucursalId: true },
      });
      return Promise.all(sedes.map(async (s: any) => (await this.prisma.contexto(s.empresaId, s.sucursalId)).cliente));
    }
    return [await this.base(u)];
  }

  // Confirma la identidad del administrador: contraseña y, si la tiene activa, su propio código.
  private async confirmarAdministrador(db: any, u: Actor, password: unknown, codigo: unknown) {
    const fallo = this.fallosClave.get(u.id);
    if (fallo && fallo.hasta > Date.now() && fallo.n >= 5)
      throw new HttpException('Demasiados intentos. Espera 15 minutos.', 429);
    const usuario = await db.usuario.findUnique({ where: { id: u.id }, select: { password: true } });
    if (!usuario || typeof password !== 'string' || !(await bcrypt.compare(password.slice(0, 500), usuario.password))) {
      const previo = fallo && fallo.hasta > Date.now() ? fallo.n : 0;
      this.fallosClave.set(u.id, { n: previo + 1, hasta: Date.now() + 900000 });
      throw new ForbiddenException('La contraseña no coincide');
    }
    this.fallosClave.delete(u.id);
    if ((await this.dosPasosActivo(db, u.id)) && !(await this.verificar(db, u.id, codigo)))
      throw new ForbiddenException('El código de tu app no es válido');
  }

  // ---------- Política de la empresa y equipo ----------
  async cambiarPolitica(u: Actor, exigir: unknown, password: unknown, codigo: unknown) {
    if (u.rol !== 'ADMIN_EMPRESA' || !u.empresaId) throw new ForbiddenException('Solo el administrador de la empresa cambia esta política');
    if (typeof exigir !== 'boolean') throw new BadRequestException('Indica si se exige la verificación');
    const db = await this.base(u);
    if (exigir && !(await this.dosPasosActivo(db, u.id)))
      throw new BadRequestException('Activa primero tu propia verificación en dos pasos');
    await this.confirmarAdministrador(db, u, password, codigo);
    const POLITICA = politicaEmpresa(u.empresaId);
    for (const b of await this.basesEmpresa(u)) {
      await this.preparar(b);
      const datos = { por: u.id, fecha: Date.now() };
      if (exigir)
        await b.seguridadRegistro.upsert({
          where: { usuarioId_tipo_clave: POLITICA },
          create: { id: randomUUID(), ...POLITICA, estado: 'ACTIVA', datos },
          update: { estado: 'ACTIVA', datos },
        });
      else await b.seguridadRegistro.deleteMany({ where: POLITICA });
    }
    this.olvidarPendientes();
    this.logger.log(`Empresa ${u.empresaId}: verificación en dos pasos ${exigir ? 'exigida' : 'opcional'} por el usuario ${u.id}`);
    return { exigir };
  }

  async equipo(u: Actor) {
    if (u.rol !== 'ADMIN_EMPRESA' || !u.empresaId) throw new ForbiddenException('No tienes permisos para esta operación');
    const db = await this.base(u);
    const usuarios = await db.usuario.findMany({
      where: { empresaId: u.empresaId, activo: true, NOT: { rol: 'SUPERADMIN' } },
      select: { id: true, nombre: true, email: true, rol: true },
      orderBy: { nombre: 'asc' },
      take: 500,
    });
    let activos = new Set<number>();
    try {
      const filas = await db.seguridadRegistro.findMany({
        where: { tipo: '2FA', clave: 'activo', usuarioId: { in: usuarios.map((x: any) => x.id) } },
        select: { usuarioId: true },
      });
      activos = new Set(filas.map((f: any) => f.usuarioId));
    } catch (e) {
      if (e?.code !== 'P2021') throw e;
    }
    return usuarios.map((x: any) => ({ ...x, dosPasos: activos.has(x.id), propio: x.id === u.id }));
  }

  // Para quien perdió el teléfono y los códigos: quita su 2FA y cierra sus sesiones en todas las sedes.
  async restablecer(u: Actor, usuarioId: unknown, password: unknown, codigo: unknown) {
    if (u.rol !== 'ADMIN_EMPRESA' || !u.empresaId) throw new ForbiddenException('Solo el administrador de la empresa puede restablecerla');
    const id = Number(usuarioId);
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('Usuario no válido');
    if (id === u.id) throw new BadRequestException('Para tu propia cuenta usa la opción Desactivar');
    const db = await this.base(u);
    const objetivo = await db.usuario.findFirst({
      where: { id, empresaId: u.empresaId },
      select: { id: true, nombre: true, email: true, rol: true },
    });
    if (!objetivo || objetivo.rol === 'SUPERADMIN') throw new NotFoundException('Usuario no encontrado');
    if (!(await this.dosPasosActivo(db, u.id)))
      throw new BadRequestException('Activa primero tu propia verificación en dos pasos');
    await this.confirmarAdministrador(db, u, password, codigo);
    let restablecida = false;
    for (const b of await this.basesEmpresa(u)) {
      // El acceso se resuelve por correo en cada sede, así que se busca igual.
      const copia = b === db ? objetivo : await b.usuario.findFirst({ where: { email: objetivo.email, empresaId: u.empresaId }, select: { id: true, rol: true } });
      if (!copia || copia.rol === 'SUPERADMIN') continue;
      try {
        await b.$transaction(async (tx: any) => {
          const n = await tx.seguridadRegistro.deleteMany({ where: { usuarioId: copia.id, tipo: '2FA' } });
          if (n?.count) restablecida = true;
          await tx.seguridadRegistro.updateMany({ where: { usuarioId: copia.id, tipo: 'SESION', estado: 'ACTIVA' }, data: { estado: 'REVOCADA' } });
        });
      } catch (e) {
        if (e?.code !== 'P2021') throw e;
      }
    }
    if (!restablecida) throw new BadRequestException('Ese usuario no tiene activa la verificación en dos pasos');
    this.olvidarPendientes();
    this.logger.log(`Empresa ${u.empresaId}: el usuario ${u.id} restableció la verificación en dos pasos del usuario ${id}`);
    if (this.notificaciones)
      void this.notificaciones.enviarAvisoDosPasos(objetivo.email, objetivo.nombre, u.nombre || 'el administrador').catch(() => undefined);
    return { ok: true };
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
    const politica = u.rol !== 'SUPERADMIN' && (await this.politicaActiva(db, u.empresaId));
    return {
      dosPasos: await this.dosPasosActivo(db, u.id),
      dosPasosRecomendado: ['SUPERADMIN', 'ADMIN_EMPRESA', 'GERENTE'].includes(u.rol),
      dosPasosObligatorio: politica && ROLES_DOS_PASOS.includes(u.rol),
      ...(u.rol === 'ADMIN_EMPRESA' ? { politicaEmpresa: politica } : {}),
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
    this.olvidarPendientes();
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
    if (ROLES_DOS_PASOS.includes(u.rol) && (await this.politicaActiva(db, u.empresaId)))
      throw new ForbiddenException('Tu empresa exige la verificación en dos pasos; no se puede desactivar');
    const usuario = await db.usuario.findUnique({ where: { id: u.id }, select: { password: true } });
    if (!usuario || typeof password !== 'string' || !(await bcrypt.compare(password.slice(0, 500), usuario.password)))
      throw new ForbiddenException('La contraseña no coincide');
    if (!(await this.verificar(db, u.id, codigo))) throw new ForbiddenException('El código no es válido');
    await db.seguridadRegistro.deleteMany({ where: { usuarioId: u.id, tipo: '2FA' } });
    this.olvidarPendientes();
    this.logger.log(`Verificación en dos pasos desactivada para el usuario ${u.id}`);
    return { ok: true };
  }
}
