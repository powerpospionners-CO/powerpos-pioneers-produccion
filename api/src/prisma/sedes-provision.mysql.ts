import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cifrarConexion, descifrarConexion } from './conexion-cifrada';
import { identidadBase } from './sede-databases';
import { adaptarMysql } from './mysql-adapter';

const pendiente = () => new ServiceUnavailableException('Falta conectar la base MySQL independiente de esta sede. Crea una base vacía en Hostinger y usa «Conectar base de la sede» en Superadmin. La empresa y sus administradores están guardados.');
const q = (nombre: string) => { if (!/^[a-zA-Z0-9_]+$/.test(nombre)) throw new Error('Identificador inválido'); return '`' + nombre + '`'; };
const claveSede = (empresaId: number, sucursalId: number) => ({ empresaId_sucursalId: { empresaId, sucursalId } });

export function conexionNuevaMysql(datos: { base?: unknown; usuario?: unknown; password?: unknown }, baseControl = process.env.DATABASE_URL || '') {
  const url = new URL(baseControl);
  if (url.protocol !== 'mysql:' || typeof datos.base !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(datos.base) || typeof datos.usuario !== 'string' || !/^[a-zA-Z0-9_]{1,80}$/.test(datos.usuario) || typeof datos.password !== 'string' || !datos.password || datos.password.length > 256) throw new BadRequestException('Completa el nombre de la base, el usuario y su contraseña de MySQL.');
  const cuenta = decodeURIComponent(url.pathname.slice(1)).match(/^(u\d+)_/);
  if (cuenta && !datos.base.startsWith(cuenta[1] + '_')) throw new BadRequestException('La base debe pertenecer a la misma cuenta de Hostinger.');
  const original = identidadBase(url.toString());
  url.pathname = '/' + datos.base;
  url.username = datos.usuario;
  url.password = encodeURIComponent(datos.password);
  if (identidadBase(url.toString()) === original) throw new BadRequestException('La sede no puede usar la base de control.');
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('connect_timeout', '10');
  return url.toString();
}

export async function registrarConexionMysql(control: any, Cliente: any, empresaId: number, sucursalId: number, datos: { base?: unknown; usuario?: unknown; password?: unknown }) {
  if (!Number.isSafeInteger(empresaId) || !Number.isSafeInteger(sucursalId) || empresaId < 1 || sucursalId < 1) throw new BadRequestException('Sede inválida');
  const sede = await control.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
  if (!sede) throw new BadRequestException('La sede no pertenece a esta empresa.');
  const conexion = conexionNuevaMysql(datos);
  const identidad = identidadBase(conexion);
  const existente = await control.baseSede.findUnique({ where: claveSede(empresaId, sucursalId) });
  if (existente && (existente.identidadBase !== identidad || ['ACTIVA', 'VERIFICADA'].includes(existente.estado))) throw new BadRequestException('La sede ya tiene una base asignada; no se reemplazará.');
  const usada = await control.baseSede.findUnique({ where: { identidadBase: identidad } });
  if (usada && (usada.empresaId !== empresaId || usada.sucursalId !== sucursalId)) throw new BadRequestException('Esta base ya pertenece a otra sede.');
  const db = new Cliente({ datasources: { db: { url: conexion } } });
  try {
    const tablas = await db.$queryRawUnsafe('SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
    if (tablas.length && !existente) throw new BadRequestException('La base debe estar vacía. No se modificarán sus tablas existentes.');
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('No se pudo conectar a MySQL. Revisa el nombre completo, usuario y contraseña en Hostinger.');
  } finally { await db.$disconnect(); }
  const empresa = await control.empresa.findUnique({ where: { id: empresaId } });
  const registro = { conexionCifrada: cifrarConexion(conexion, empresaId, sucursalId), identidadBase: identidad };
  if (existente) await control.baseSede.update({ where: { id: existente.id }, data: registro });
  else await control.baseSede.create({ data: { ...registro, empresaId, sucursalId, estado: 'PREPARANDO', slug: empresa.tiendaSlug, agenteHash: empresa.impresionAgenteToken ? createHash('sha256').update(empresa.impresionAgenteToken).digest('hex') : null } });
}

export async function provisionarMysql(control: any, Cliente: any, empresaId: number, sucursalId: number, origen?: any) {
  const registro = await control.baseSede.findUnique({ where: claveSede(empresaId, sucursalId) });
  if (!registro) throw pendiente();
  let conexion: string;
  try {
    conexion = descifrarConexion(registro.conexionCifrada, empresaId, sucursalId);
    if (new URL(conexion).protocol !== 'mysql:' || identidadBase(conexion) !== registro.identidadBase || identidadBase(conexion) === identidadBase(process.env.DATABASE_URL || '')) throw new Error();
  } catch { throw new ServiceUnavailableException('La conexión registrada para esta sede no es válida. No se modificaron sus datos.'); }
  const raw = new Cliente({ datasources: { db: { url: conexion } } });
  const db: any = adaptarMysql(raw);
  try {
    const fuente = origen || control;
    const empresa = await fuente.empresa.findUnique({ where: { id: empresaId } });
    const sede = await control.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
    const usuarios = await fuente.usuario.findMany({ where: { empresaId, activo: true, rol: { in: ['ADMIN_EMPRESA', 'GERENTE'] }, ...(!origen ? { OR: [{ sucursalId }, { sucursalId: null }] } : {}) } });
    if (!empresa || !sede || !usuarios.length) throw new ServiceUnavailableException('Agrega un administrador activo a esta sede antes de activarla.');
    // Named locks remain held across MySQL DDL commits and across API instances.
    await raw.$transaction(async (tx: any) => {
      const nombreBloqueo = 'powerpos-sede-' + createHash('sha256').update(registro.identidadBase).digest('hex').slice(0, 40);
      const [bloqueo] = await tx.$queryRawUnsafe('SELECT GET_LOCK(?, 5) AS tomado', nombreBloqueo);
      if (Number(bloqueo.tomado) !== 1) throw new ServiceUnavailableException('Esta sede ya se está preparando. Reintenta en unos segundos.');
      try {
        let tablas = await tx.$queryRawUnsafe('SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
        if (!tablas.length) {
          if (['ACTIVA', 'VERIFICADA'].includes(registro.estado)) throw new ServiceUnavailableException('La base activa está vacía. Se requiere revisión; no se recreará automáticamente.');
          const sql = readFileSync(resolve(__dirname, '../../prisma/mysql/sede-inicial.sql'), 'utf8');
          for (const sentencia of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(sentencia);
          tablas = await tx.$queryRawUnsafe('SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
        }
        const sello = await tx.selloBaseSede.findUnique({ where: { id: 1 } });
        if (sello) {
          if (sello.empresaId !== empresaId || sello.sucursalId !== sucursalId || await tx.empresa.count() !== 1 || await tx.sucursal.count() !== 1) throw new ServiceUnavailableException('El contenido de esta base no corresponde a la sede. No se modificará.');
          return;
        }
        if (['ACTIVA', 'VERIFICADA'].includes(registro.estado)) throw new ServiceUnavailableException('La base registrada perdió su sello. Se requiere revisión antes de activarla.');
        const permitidas = new Set([...Prisma.dmmf.datamodel.models.map(m => m.dbName || m.name), '_powerpos_transaction_locks']);
        if (tablas.length !== permitidas.size || tablas.some((t: any) => !permitidas.has(t.nombre))) throw new ServiceUnavailableException('La estructura de la base está incompleta o contiene tablas ajenas. No se cargarán datos.');
        for (const tabla of tablas) if ((await tx.$queryRawUnsafe(`SELECT 1 FROM ${q(tabla.nombre)} LIMIT 1`)).length) throw new ServiceUnavailableException('La base contiene registros y no se sobrescribirá.');
      } finally { await tx.$queryRawUnsafe('SELECT RELEASE_LOCK(?)', nombreBloqueo); }
    }, { timeout: 120000, maxWait: 15000 });
    // Loading data is atomic; keep foreign keys enabled and insert parents first.
    await db.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT id FROM empresas LIMIT 1 FOR UPDATE');
      const sello = await tx.selloBaseSede.findUnique({ where: { id: 1 } });
      if (sello) {
        if (sello.empresaId !== empresaId || sello.sucursalId !== sucursalId) throw new Error('Sello inválido');
        return;
      }
      await tx.empresa.create({ data: { ...empresa, ...(origen ? { tiendaSlug: registro.slug || randomUUID(), impresionAgenteToken: null, tiendaConfig: {}, fidelizacionConfig: {}, anunciosPantalla: [] } : {}) } });
      await tx.sucursal.create({ data: { ...sede, activo: true } });
      for (const usuario of usuarios) await tx.usuario.create({ data: { ...usuario, permisos: usuario.permisos === null ? Prisma.DbNull : usuario.permisos, sucursalId, distribuidorId: null } });
      if (await tx.empresa.count() !== 1 || await tx.sucursal.count() !== 1 || await tx.usuario.count() !== usuarios.length) throw new Error('Carga no verificada');
      await tx.selloBaseSede.create({ data: { id: 1, empresaId, sucursalId } });
    }, { timeout: 30000 });
    await control.baseSede.update({ where: { id: registro.id }, data: { estado: 'ACTIVA', verificadoEn: new Date(), verificacion: { motor: 'mysql', empresaId, sucursalId } } });
    await control.sucursal.update({ where: { id: sucursalId }, data: { activo: true } });
  } catch (e) {
    if (e instanceof ServiceUnavailableException) throw e;
    throw new ServiceUnavailableException('No se pudo preparar la base MySQL de la sede. Sus datos se conservaron. Revisa la conexión y los permisos de la base en Hostinger.');
  } finally { await raw.$disconnect(); }
}
