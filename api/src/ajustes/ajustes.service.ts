import { Global, Injectable, Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { motorBase } from '../prisma/mysql-adapter';

// Ajustes pequeños por sede (p. ej. arqueo ciego) en la tabla aditiva ajustes_registros.
@Injectable()
export class AjustesService {
  constructor(private readonly prisma: PrismaService) {}

  async preparar() {
    const mysql = motorBase() === 'mysql';
    await this.prisma.$executeRawUnsafe(
      mysql
        ? `CREATE TABLE IF NOT EXISTS ajustes_registros (id VARCHAR(36) NOT NULL PRIMARY KEY, empresaId INT NOT NULL, sucursalId INT NOT NULL, clave VARCHAR(64) NOT NULL, datos JSON NOT NULL, usuarioId INT NOT NULL, actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY ajuste_clave (empresaId,sucursalId,clave)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        : `CREATE TABLE IF NOT EXISTS ajustes_registros (id VARCHAR(36) PRIMARY KEY, "empresaId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL, clave VARCHAR(64) NOT NULL, datos JSONB NOT NULL, "usuarioId" INTEGER NOT NULL, "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("empresaId","sucursalId",clave))`,
    );
  }

  // Lectura tolerante: sin tabla, el ajuste no existe.
  async leer<T>(empresaId: number, sucursalId: number, clave: string, porDefecto: T): Promise<T> {
    try {
      const r = await (this.prisma as any).ajusteRegistro.findUnique({ where: { empresaId_sucursalId_clave: { empresaId, sucursalId, clave } } });
      return r ? ({ ...porDefecto, ...(r.datos as object) } as T) : porDefecto;
    } catch (e) {
      if (e?.code === 'P2021') return porDefecto;
      throw e;
    }
  }

  async guardar(empresaId: number, sucursalId: number, clave: string, datos: object, usuarioId: number) {
    await this.preparar();
    await (this.prisma as any).ajusteRegistro.upsert({
      where: { empresaId_sucursalId_clave: { empresaId, sucursalId, clave } },
      create: { id: randomUUID(), empresaId, sucursalId, clave, datos, usuarioId },
      update: { datos, usuarioId },
    });
    return datos;
  }
}

@Global()
@Module({ providers: [AjustesService], exports: [AjustesService] })
export class AjustesModule {}
