import { Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SedesProvisionService } from '../prisma/sedes-provision.service';

@Injectable()
export class SucursalesService {
  constructor(private prisma: PrismaService, @Optional() private readonly sedes?: SedesProvisionService) {}

  async crear(datos: any, empresaId: number, sucursalOrigen?: number) {
    const sucursal = await this.prisma.sucursal.create({
      data: {
        nombre: datos.nombre,
        direccion: datos.direccion,
        telefono: datos.telefono,
        empresaId,
        activo: !this.prisma.aislamientoActivo,
      },
    });
    if (this.prisma.aislamientoActivo) await this.preparar(sucursal.id, empresaId, sucursalOrigen);
    return { ...sucursal, activo: true };
  }

  async preparar(id: number, empresaId: number, sucursalOrigen?: number) {
    const sucursal = await this.prisma.sucursal.findFirst({ where: { id, empresaId } });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    if (!this.prisma.aislamientoActivo || !this.sedes || !sucursalOrigen) throw new ServiceUnavailableException('La preparación de bases por sede no está disponible');
    await this.sedes.preparar(empresaId, id, sucursalOrigen);
    return this.prisma.sucursal.findUnique({ where: { id } });
  }

  async listar(empresaId: number, incluirInactivas = false) {
    const sucursales = await this.prisma.sucursal.findMany({
      where: { empresaId, ...(incluirInactivas ? {} : { activo: true }) },
      orderBy: { creadoEn: 'asc' },
    });
    if (!this.prisma.aislamientoActivo) return sucursales;
    const bases=await this.prisma.control.baseSede.findMany({where:{empresaId},select:{sucursalId:true,estado:true}});
    return sucursales.map(s=>({...s,estadoBase:bases.find(b=>b.sucursalId===s.id)?.estado || 'PENDIENTE'}));
  }

  async actualizar(id: number, empresaId: number, datos: any) {
    const sucursal = await this.prisma.sucursal.findFirst({ where: { id, empresaId } });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');

    const payload = {
      nombre: datos.nombre?.trim() || sucursal.nombre,
      direccion: datos.direccion === '' ? null : (datos.direccion ?? sucursal.direccion),
      telefono: datos.telefono === '' ? null : (datos.telefono ?? sucursal.telefono),
    };

    return this.prisma.sucursal.update({
      where: { id },
      data: payload,
    });
  }

  async toggleActivo(id: number, empresaId: number) {
    const sucursal = await this.prisma.sucursal.findFirst({ where: { id, empresaId } });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    if (this.prisma.aislamientoActivo && !sucursal.activo) {
      const base = await this.prisma.control.baseSede.findUnique({where:{sucursalId:id},select:{estado:true,verificadoEn:true}});
      if (base?.estado !== 'ACTIVA' || !base.verificadoEn) throw new ServiceUnavailableException('Primero prepara y verifica la base independiente de esta sede');
    }
    return this.prisma.sucursal.update({
      where: { id },
      data: { activo: !sucursal.activo },
    });
  }
}
