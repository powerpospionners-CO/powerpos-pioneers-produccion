import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { motorBase } from '../prisma/mysql-adapter';
import { CONFIG_INICIAL, ConfigPropinas, normalizarConfig, repartirIgual, validarConfig } from './propinas.reglas';

export type ResumenPropinas = {
  total: number;
  efectivo: number;
  cantidad: number;
  porMetodo: { metodo: string; total: number }[];
  reparto: { usuarioId: number; nombre: string; monto: number }[] | null;
};
const VACIO: ResumenPropinas = { total: 0, efectivo: 0, cantidad: 0, porMetodo: [], reparto: null };
const dinero = (n: number) => Math.round(n * 100) / 100;

// Tabla aditiva propina_registros: PROPINA (una por venta), REPARTO (uno por caja) y CONFIG (uno por empresa en la base).
@Injectable()
export class PropinasService {
  constructor(private readonly prisma: PrismaService) {}

  // DDL aditivo y estático; solo desde acciones de escritura y fuera de transacciones.
  async preparar() {
    const mysql = motorBase() === 'mysql';
    await this.prisma.$executeRawUnsafe(
      mysql
        ? `CREATE TABLE IF NOT EXISTS propina_registros (id VARCHAR(36) NOT NULL PRIMARY KEY, empresaId INT NOT NULL, sucursalId INT NOT NULL, tipo VARCHAR(16) NOT NULL, clave VARCHAR(64) NOT NULL, cajaId INT NULL, pedidoId INT NULL, usuarioId INT NOT NULL, metodoPago VARCHAR(16) NULL, monto DECIMAL(12,2) NOT NULL DEFAULT 0, estado VARCHAR(16) NOT NULL, datos JSON NOT NULL, creadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY propina_clave (empresaId,tipo,clave), KEY propina_caja (empresaId,cajaId), KEY propina_listado (empresaId,tipo,creadoEn)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        : `CREATE TABLE IF NOT EXISTS propina_registros (id VARCHAR(36) PRIMARY KEY, "empresaId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL, tipo VARCHAR(16) NOT NULL, clave VARCHAR(64) NOT NULL, "cajaId" INTEGER, "pedidoId" INTEGER, "usuarioId" INTEGER NOT NULL, "metodoPago" VARCHAR(16), monto DECIMAL(12,2) NOT NULL DEFAULT 0, estado VARCHAR(16) NOT NULL, datos JSONB NOT NULL, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("empresaId",tipo,clave))`,
    );
    if (!mysql) {
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS propina_registros_caja ON propina_registros ("empresaId", "cajaId")`);
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS propina_registros_listado ON propina_registros ("empresaId", tipo, "creadoEn")`);
    }
  }

  // Lecturas toleran que la tabla aún no exista (empresa que nunca usó propinas).
  private async leer<T>(fn: () => Promise<T>, vacio: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e?.code === 'P2021') return vacio;
      throw e;
    }
  }

  private db(tx?: any): any {
    return tx || this.prisma;
  }

  async config(empresaId: number): Promise<ConfigPropinas> {
    const r = await this.leer(
      () => this.db().propinaRegistro.findUnique({ where: { empresaId_tipo_clave: { empresaId, tipo: 'CONFIG', clave: 'config' } } }),
      null,
    );
    return r ? normalizarConfig(r.datos) : { ...CONFIG_INICIAL };
  }

  async guardarConfig(actor: { id: number; empresaId: number; sucursalId: number }, body: unknown) {
    const config = validarConfig(body);
    await this.preparar();
    await this.db().propinaRegistro.upsert({
      where: { empresaId_tipo_clave: { empresaId: actor.empresaId, tipo: 'CONFIG', clave: 'config' } },
      create: { id: randomUUID(), empresaId: actor.empresaId, sucursalId: actor.sucursalId || 0, tipo: 'CONFIG', clave: 'config', usuarioId: actor.id, estado: 'ACTIVA', datos: config },
      update: { datos: config, usuarioId: actor.id },
    });
    return config;
  }

  // Dentro de la transacción de la venta; la tabla debe existir (preparar antes).
  async registrar(tx: any, pedido: { id: number; sucursalId: number; cajaId: number | null; total: unknown }, propina: { monto: number; metodoPago: string }, empresaId: number, usuarioId: number) {
    if (!pedido.cajaId) throw new BadRequestException('La propina solo se registra en ventas de caja');
    if (propina.monto > Number(pedido.total)) throw new BadRequestException('La propina no puede superar el valor de la venta');
    const clave = `pedido:${pedido.id}`;
    // Reintento offline de la misma venta: la propina ya quedó registrada.
    const existe = await tx.propinaRegistro.findUnique({ where: { empresaId_tipo_clave: { empresaId, tipo: 'PROPINA', clave } } });
    if (existe) return existe;
    return tx.propinaRegistro.create({
      data: {
        id: randomUUID(), empresaId, sucursalId: pedido.sucursalId, tipo: 'PROPINA', clave,
        cajaId: pedido.cajaId, pedidoId: pedido.id, usuarioId, metodoPago: propina.metodoPago,
        monto: propina.monto, estado: 'ACTIVA', datos: {},
      },
    });
  }

  async dePedido(empresaId: number, pedidoId: number) {
    const r = await this.leer(
      () => this.db().propinaRegistro.findUnique({ where: { empresaId_tipo_clave: { empresaId, tipo: 'PROPINA', clave: `pedido:${pedidoId}` } } }),
      null,
    );
    return r ? { monto: Number(r.monto), metodoPago: r.metodoPago as string } : null;
  }

  // Propinas de la caja, sin las de ventas anuladas.
  async deCaja(empresaId: number, cajaId: number, pedidosValidos: Set<number>, tx?: any): Promise<ResumenPropinas> {
    const filas: any[] = await this.leer(
      () => this.db(tx).propinaRegistro.findMany({ where: { empresaId, cajaId, tipo: { in: ['PROPINA', 'REPARTO'] } } }),
      [],
    );
    const propinas = filas.filter((f) => f.tipo === 'PROPINA' && pedidosValidos.has(f.pedidoId));
    if (!filas.length) return { ...VACIO, porMetodo: [] };
    const porMetodo = new Map<string, number>();
    for (const p of propinas) porMetodo.set(p.metodoPago, dinero((porMetodo.get(p.metodoPago) || 0) + Number(p.monto)));
    const reparto = filas.find((f) => f.tipo === 'REPARTO');
    return {
      total: dinero(propinas.reduce((s, p) => s + Number(p.monto), 0)),
      efectivo: porMetodo.get('EFECTIVO') || 0,
      cantidad: propinas.length,
      porMetodo: [...porMetodo].map(([metodo, total]) => ({ metodo, total })),
      reparto: reparto ? (reparto.datos?.participantes ?? []) : null,
    };
  }

  // Al cerrar la caja: partes iguales entre quienes trabajaron. Sin lista, quienes registraron ventas y el cajero.
  async repartir(tx: any, caja: { id: number; sucursalId: number; usuarioId: number; pedidos: { usuarioId: number; estado: string }[] }, empresaId: number, usuarioId: number, resumen: ResumenPropinas, participantes?: unknown) {
    if (resumen.total <= 0) return null;
    let ids: number[];
    if (participantes !== undefined && participantes !== null) {
      if (!Array.isArray(participantes) || !participantes.length || participantes.length > 50 || participantes.some((x) => !Number.isSafeInteger(x) || x < 1))
        throw new BadRequestException('Elige quiénes reciben la propina');
      ids = [...new Set(participantes as number[])];
    } else ids = [...new Set([caja.usuarioId, ...caja.pedidos.filter((p) => p.estado !== 'ANULADO').map((p) => p.usuarioId)])];
    const usuarios = await tx.usuario.findMany({ where: { id: { in: ids }, empresaId }, select: { id: true, nombre: true } });
    if (usuarios.length !== ids.length) throw new BadRequestException('Alguien de la lista no pertenece a la empresa');
    const nombres = new Map(usuarios.map((u: any) => [u.id, u.nombre]));
    const partes = repartirIgual(resumen.total, ids.length);
    const lista = ids.map((id, i) => ({ usuarioId: id, nombre: nombres.get(id) as string, monto: partes[i] }));
    await tx.propinaRegistro.create({
      data: {
        id: randomUUID(), empresaId, sucursalId: caja.sucursalId, tipo: 'REPARTO', clave: `caja:${caja.id}`,
        cajaId: caja.id, usuarioId, monto: resumen.total, estado: 'ACTIVA', datos: { participantes: lista, porMetodo: resumen.porMetodo },
      },
    });
    return lista;
  }

  // Lo que le corresponde a cada persona en el periodo, según los cierres de caja.
  async reporte(empresaId: number, desde: unknown, hasta: unknown) {
    const fecha = (v: unknown, fin: boolean) => {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException('Fechas no válidas');
      return new Date(`${v}T${fin ? '23:59:59.999' : '00:00:00.000'}-05:00`);
    };
    const inicio = fecha(desde, false), fin = fecha(hasta, true);
    if (fin < inicio || fin.getTime() - inicio.getTime() > 370 * 86400000) throw new BadRequestException('El periodo debe ser de máximo un año');
    const repartos: any[] = await this.leer(
      () => this.db().propinaRegistro.findMany({ where: { empresaId, tipo: 'REPARTO', creadoEn: { gte: inicio, lte: fin } }, orderBy: { creadoEn: 'asc' }, take: 5000 }),
      [],
    );
    const personas = new Map<number, { usuarioId: number; nombre: string; monto: number; turnos: number }>();
    for (const r of repartos)
      for (const p of r.datos?.participantes ?? []) {
        const actual = personas.get(p.usuarioId) || { usuarioId: p.usuarioId, nombre: p.nombre, monto: 0, turnos: 0 };
        actual.monto += Number(p.monto) || 0;
        actual.turnos += 1;
        personas.set(p.usuarioId, actual);
      }
    return {
      total: dinero(repartos.reduce((s, r) => s + Number(r.monto), 0)),
      cierres: repartos.length,
      personas: [...personas.values()].sort((a, b) => b.monto - a.monto),
    };
  }
}
