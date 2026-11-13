import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaletaLogo } from './paleta-logo';

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
    if (this.prisma.aislamientoActivo) await this.prisma.registrarAgente(token);
    return { token };
  }

  async actualizar(empresaId: number, datos: any) {
    if (this.prisma.aislamientoActivo) await this.prisma.control.empresa.update({where:{id:empresaId},data:{nombre:datos.nombre,nit:datos.nit,email:datos.email,telefono:datos.telefono,direccion:datos.direccion}});
    return this.prisma.empresa.update({
      where: { id: empresaId },
      data: { nombre: datos.nombre, nit: datos.nit, email: datos.email, telefono: datos.telefono, direccion: datos.direccion },
    });
  }

  async actualizarLogo(empresaId: number, logoUrl: string, paleta?: PaletaLogo) {
    return this.prisma.$transaction(async tx => {
      const empresa = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
      const config = (empresa.tiendaConfig || {}) as Record<string, unknown>;
      return tx.empresa.update({
      where: { id: empresaId },
      data: { logo: logoUrl, ...(paleta ? { tiendaConfig: {
        ...config, paletaLogo: paleta,
        ...(config.coloresAutomaticos !== false ? { color: paleta.principal } : {}),
      } } : {}) },
      });
    });
  }

  async actualizarAnuncios(empresaId: number, anuncios: any[]) {
    const lista = (Array.isArray(anuncios) ? anuncios : [])
      .slice(0, 8)
      .filter((a) => a && typeof a.imagen === 'string' && a.imagen.trim())
      .map((a) => ({
        imagen: String(a.imagen).slice(0, 500),
        titulo: typeof a.titulo === 'string' ? a.titulo.slice(0, 80) : '',
        texto: typeof a.texto === 'string' ? a.texto.slice(0, 200) : '',
      }));
    await this.prisma.empresa.update({
      where: { id: empresaId },
      data: { anunciosPantalla: lista },
    });
    return lista;
  }
}
