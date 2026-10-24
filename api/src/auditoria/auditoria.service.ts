import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  actividad(usuario: { id: number; empresaId: number; sucursalId?: number; nombre?: string; email?: string; rol: string }, detalle: any) {
    const base = this.prisma.control || this.prisma;
    return base.auditoria.create({ data: {
      empresaId: usuario.empresaId, usuarioId: null, accion: detalle.ruta === '/actividad/vista' ? 'PANTALLA' : detalle.ruta === '/actividad/salir' ? 'CIERRE_SESION' : detalle.metodo === 'GET' ? 'CONSULTA' : detalle.ruta === '/auth/login' ? 'INICIO_SESION' : 'OPERACION',
      entidad: 'ActividadSistema', entidadId: detalle.recursoId,
      detalle: { ...detalle, actor: { id: usuario.id, nombre: usuario.nombre || usuario.email || `Usuario ${usuario.id}`, rol: usuario.rol, sucursalId: usuario.sucursalId } },
    } });
  }

  async listarEmpresa(empresaId: number, antesDe?: string, incluirConsultas = true) {
    const cursor = Number(antesDe);
    const base = this.prisma.control || this.prisma;
    const filas = await base.auditoria.findMany({
      where: { empresaId, entidad: 'ActividadSistema', ...(!incluirConsultas ? { accion: { not: 'CONSULTA' } } : {}), ...(Number.isSafeInteger(cursor) && cursor > 0 ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' }, take: 101,
      select: { id: true, accion: true, detalle: true, creadoEn: true },
    });
    return { registros: filas.slice(0,100), siguiente: filas.length > 100 ? filas[99].id : null };
  }

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
