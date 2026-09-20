import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmpresaService {
  constructor(private prisma: PrismaService) {}

  async obtener(empresaId: number) {
    return this.prisma.empresa.findUnique({
      where: { id: empresaId },
    });
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
