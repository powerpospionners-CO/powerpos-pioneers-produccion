import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmpresaService {
  constructor(private prisma: PrismaService) {}

  async obtener(empresaId: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
    });
    if (!empresa) return empresa;
    // El token del agente de impresión es un secreto: no viaja en la
    // respuesta general, solo se entrega al generarlo/regenerarlo.
    const { impresionAgenteToken, ...resto } = empresa;
    return { ...resto, agenteImpresionConfigurado: !!impresionAgenteToken };
  }

  async generarTokenAgenteImpresion(empresaId: number) {
    const token = randomBytes(32).toString('hex');
    await this.prisma.empresa.update({
      where: { id: empresaId },
      data: { impresionAgenteToken: token },
    });
    return { token };
  }

  async actualizar(empresaId: number, datos: any) {
    return this.prisma.empresa.update({
      where: { id: empresaId },
      data: { nombre: datos.nombre, nit: datos.nit, email: datos.email, telefono: datos.telefono, direccion: datos.direccion },
    });
  }

  async actualizarLogo(empresaId: number, logoUrl: string) {
    return this.prisma.empresa.update({
      where: { id: empresaId },
      data: { logo: logoUrl },
    });
  }
}
