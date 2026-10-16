import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { PrismaService } from './prisma.service';

@Injectable()
export class SedesProvisionService {
  private readonly pendientes = new Map<number, Promise<void>>();
  constructor(private readonly prisma: PrismaService) {}
  async preparar(
    empresaId: number,
    sucursalId: number,
    sucursalOrigen?: number,
  ) {
    if (!this.prisma.aislamientoActivo) return;
    if (this.pendientes.has(sucursalId)) return this.pendientes.get(sucursalId);
    const tarea = this.prepararBase(empresaId, sucursalId, sucursalOrigen);
    this.pendientes.set(sucursalId, tarea);
    try {
      await tarea;
    } finally {
      this.pendientes.delete(sucursalId);
    }
  }
  private async prepararBase(
    empresaId: number,
    sucursalId: number,
    sucursalOrigen?: number,
  ) {
    const { modelos, leerModelo } = require(
      path.join(process.cwd(), 'scripts/lib/sede-copy.cjs'),
    );
    const { prepararBase } = require(
      path.join(process.cwd(), 'scripts/lib/sede-provision.cjs'),
    );
    const root = this.prisma.control;
    const origen = sucursalOrigen
      ? (await this.prisma.contexto(empresaId, sucursalOrigen)).cliente
      : root;
    const datos: Record<string, any[]> = Object.fromEntries(
      modelos.map((m) => [m.name, []]),
    );
    const modelo = (name: string) => modelos.find((m) => m.name === name);
    datos.Empresa = await leerModelo(origen, modelo('Empresa'), {
      id: empresaId,
    });
    datos.Sucursal = await leerModelo(root, modelo('Sucursal'), {
      id: sucursalId,
      empresaId,
    });
    datos.Usuario = (await leerModelo(origen, modelo('Usuario'), { empresaId }))
      .filter((u) => ['ADMIN_EMPRESA', 'GERENTE'].includes(u.rol) && u.activo)
      .map((u) => ({ ...u, sucursalId, distribuidorId: null }));
    if (
      datos.Empresa.length !== 1 ||
      datos.Sucursal.length !== 1 ||
      !datos.Usuario.length
    )
      throw new ServiceUnavailableException(
        'Faltan los datos de activación de esta sede',
      );
    datos.Sucursal[0].activo = true;
    const registro = await root.baseSede.findUnique({
      where: { empresaId_sucursalId: { empresaId, sucursalId } },
    });
    if (sucursalOrigen) {
      datos.Empresa[0] = {
        ...datos.Empresa[0],
        tiendaSlug: registro?.slug || randomUUID(),
        impresionAgenteToken: null,
        tiendaConfig: '{}',
        fidelizacionConfig: '{}',
        anunciosPantalla: '[]',
      };
    }
    try {
      await prepararBase(
        root,
        empresaId,
        sucursalId,
        { datos, perfilesControl: 0 },
        { activar: true },
      );
      await root.sucursal.update({
        where: { id: sucursalId },
        data: { activo: true },
      });
    } catch {
      throw new ServiceUnavailableException(
        'La sede quedó registrada y está pendiente de activación. Sus datos se conservaron; un administrador puede reintentar la preparación.',
      );
    }
  }
}
