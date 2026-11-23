import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { motorBase } from '../prisma/mysql-adapter';
import { cifrar, descifrar, identidad, clavePersonal } from './personal.reglas';
export type ActorPersonal = {
  id: number;
  empresaId: number;
  sucursalId: number;
  rol?: string;
};
@Injectable()
export class PersonalStore {
  constructor(readonly prisma: PrismaService) {}
  async preparar() {
    clavePersonal();
    // DDL aditivo y estático. Solo se ejecuta dentro de la sede autenticada; no altera tablas existentes.
    const mysql = motorBase() === 'mysql';
    await this.prisma.$executeRawUnsafe(
      mysql
        ? `CREATE TABLE IF NOT EXISTS personal_registros (id VARCHAR(36) NOT NULL PRIMARY KEY, empresaId INT NOT NULL, sucursalId INT NOT NULL, tipo VARCHAR(24) NOT NULL, referenciaId VARCHAR(191) NULL, llave VARCHAR(128) NULL, estado VARCHAR(32) NOT NULL, datos JSON NOT NULL, version INT NOT NULL DEFAULT 1, creadoPor INT NOT NULL, creadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY personal_llave (empresaId,sucursalId,tipo,llave), KEY personal_busqueda (empresaId,sucursalId,tipo,referenciaId)) ENGINE=InnoDB`
        : `CREATE TABLE IF NOT EXISTS personal_registros (id VARCHAR(36) PRIMARY KEY, "empresaId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL, tipo VARCHAR(24) NOT NULL, "referenciaId" VARCHAR(191), llave VARCHAR(128), estado VARCHAR(32) NOT NULL, datos JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, "creadoPor" INTEGER NOT NULL, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("empresaId","sucursalId",tipo,llave))`,
    );
  }
  db(tx?: any): any {
    return tx || this.prisma;
  }
  scope(a: ActorPersonal) {
    return { empresaId: a.empresaId, sucursalId: a.sucursalId };
  }
  abrir(r: any) {
    return { ...r, datos: descifrar(r.datos, identidad(r)) };
  }
  async obtener(a: ActorPersonal, id: string, tipo?: string, tx?: any) {
    const r = await this.db(tx).personalRegistro.findFirst({
      where: { ...this.scope(a), id, ...(tipo ? { tipo } : {}) },
    });
    if (!r) throw new NotFoundException('Registro no encontrado');
    return this.abrir(r);
  }
  async listar(
    a: ActorPersonal,
    tipo: string,
    referenciaId?: string,
    tx?: any,
  ) {
    return (
      await this.db(tx).personalRegistro.findMany({
        where: {
          ...this.scope(a),
          tipo,
          ...(referenciaId ? { referenciaId } : {}),
        },
        orderBy: { creadoEn: 'desc' },
        take: referenciaId ? undefined : 500,
      })
    ).map((r: any) => this.abrir(r));
  }
  async crear(
    a: ActorPersonal,
    tipo: string,
    datos: any,
    opciones: { referenciaId?: string; llave?: string; estado?: string } = {},
    tx?: any,
  ) {
    const r = {
      id: randomUUID(),
      ...this.scope(a),
      tipo,
      referenciaId: opciones.referenciaId || null,
      llave: opciones.llave || null,
      estado: opciones.estado || 'ACTIVO',
      version: 1,
      creadoPor: a.id,
    };
    return this.abrir(
      await this.db(tx).personalRegistro.create({
        data: { ...r, datos: cifrar(datos, identidad(r)) },
      }),
    );
  }
  async actualizar(
    a: ActorPersonal,
    r: any,
    datos: any,
    estado = r.estado,
    tx?: any,
  ) {
    const nuevo = { ...r, estado, version: r.version + 1 };
    const actualizado = await this.db(tx).personalRegistro.updateMany({
      where: { id: r.id, ...this.scope(a), version: r.version },
      data: {
        datos: cifrar(datos, identidad(nuevo)),
        estado,
        version: nuevo.version,
      },
    });
    if (actualizado.count !== 1)
      throw new ConflictException(
        'El expediente cambió; actualiza la vista antes de continuar',
      );
    return this.obtener(a, r.id, r.tipo, tx);
  }
  async bloquear(a: ActorPersonal, id: string, tx: any) {
    await tx.$queryRaw`SELECT id FROM personal_registros WHERE id = ${id} AND "empresaId" = ${a.empresaId} AND "sucursalId" = ${a.sucursalId} FOR UPDATE`;
  }
  async evento(
    a: ActorPersonal,
    registroId: string,
    accion: string,
    detalle: any,
    tx?: any,
  ) {
    await this.crear(
      a,
      'EVENTO',
      { accion, detalle, fecha: new Date().toISOString(), actorId: a.id },
      { referenciaId: registroId },
      tx,
    );
    await this.db(tx).auditoria.create({
      data: {
        empresaId: a.empresaId,
        usuarioId: a.id || null,
        accion: 'CREAR',
        entidad: 'PERSONAL',
        detalle: { registroId, accion },
      },
    });
  }
}
