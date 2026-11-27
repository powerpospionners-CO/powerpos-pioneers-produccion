import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Patch, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { motorBase } from '../prisma/mysql-adapter';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

export type ContactoSoporte = { whatsapp: string; correo: string; horario: string };
const VACIO: ContactoSoporte = { whatsapp: '', correo: '', horario: '' };
// Ajuste global de PowerPOS: vive en la base de control (empresa 0, sucursal 0).
const CLAVE = { empresaId: 0, sucursalId: 0, clave: 'contacto-soporte' };

export function validarContacto(body: unknown): ContactoSoporte {
  const v = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const whatsapp = typeof v.whatsapp === 'string' ? v.whatsapp.replace(/\D/g, '') : '';
  const correo = typeof v.correo === 'string' ? v.correo.trim().toLowerCase() : '';
  const horario = typeof v.horario === 'string' ? v.horario.trim().slice(0, 80) : '';
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) throw new BadRequestException('El WhatsApp debe incluir el indicativo del país, por ejemplo 573001234567');
  if (correo && (correo.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) throw new BadRequestException('Correo no válido');
  return { whatsapp, correo, horario };
}

@Injectable()
export class ContactoSoporteService {
  constructor(private readonly prisma: PrismaService) {}

  private db(): any {
    return this.prisma.control || this.prisma;
  }

  async obtener(): Promise<ContactoSoporte> {
    try {
      const r = await this.db().ajusteRegistro.findUnique({ where: { empresaId_sucursalId_clave: CLAVE } });
      return r ? { ...VACIO, ...(r.datos as object) } : { ...VACIO };
    } catch (e) {
      if (e?.code === 'P2021') return { ...VACIO };
      throw e;
    }
  }

  async guardar(actor: { id: number; rol: string }, body: unknown) {
    if (actor?.rol !== 'SUPERADMIN') throw new ForbiddenException('Solo el superadministrador configura el contacto de soporte');
    const datos = validarContacto(body);
    const db = this.db();
    const mysql = motorBase() === 'mysql';
    await db.$executeRawUnsafe(
      mysql
        ? `CREATE TABLE IF NOT EXISTS ajustes_registros (id VARCHAR(36) NOT NULL PRIMARY KEY, empresaId INT NOT NULL, sucursalId INT NOT NULL, clave VARCHAR(64) NOT NULL, datos JSON NOT NULL, usuarioId INT NOT NULL, actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY ajuste_clave (empresaId,sucursalId,clave)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        : `CREATE TABLE IF NOT EXISTS ajustes_registros (id VARCHAR(36) PRIMARY KEY, "empresaId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL, clave VARCHAR(64) NOT NULL, datos JSONB NOT NULL, "usuarioId" INTEGER NOT NULL, "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("empresaId","sucursalId",clave))`,
    );
    await db.ajusteRegistro.upsert({
      where: { empresaId_sucursalId_clave: CLAVE },
      create: { id: randomUUID(), ...CLAVE, datos, usuarioId: actor.id },
      update: { datos, usuarioId: actor.id },
    });
    return datos;
  }
}

// Cualquier usuario con sesión lo ve en el Centro de ayuda; solo el superadministrador lo cambia.
@UseGuards(JwtAuthGuard)
@Controller('ayuda/contacto')
export class ContactoSoporteController {
  constructor(private readonly contacto: ContactoSoporteService) {}
  @Get()
  obtener() { return this.contacto.obtener(); }
  @Patch()
  guardar(@Request() req: any, @Body() body: any) { return this.contacto.guardar(req.user, body); }
}

@Module({ controllers: [ContactoSoporteController], providers: [ContactoSoporteService] })
export class ContactoSoporteModule {}
