import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  registrar(datos: { accion: string; entidad: string; entidadId?: number; empresaId?: number; usuarioId?: number; detalle?: unknown }) {
    return this.prisma.auditoria.create({
      data: {
        accion: datos.accion,
        entidad: datos.entidad,
        entidadId: datos.entidadId,
        empresaId: datos.empresaId,
        usuarioId: datos.usuarioId,
        detalle: datos.detalle as any,
      },
    });
  }
}