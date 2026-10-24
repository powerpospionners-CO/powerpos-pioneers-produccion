import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccesoTemporal, Identidad } from '../auth/acceso-temporal';

@Injectable()
export class AccesoBarrasService extends AccesoTemporal {
  constructor(prisma: PrismaService) { super(prisma, 'AccesoBarras', 'productos'); }

  async listar(usuario: Identidad, token: unknown, buscar = '', despues?: string, sinCodigo?: string) {
    await this.verificar(usuario, token);
    const cursor = Number(despues);
    const filas = await this.prisma.producto.findMany({
      where: { empresaId: usuario.empresaId, activo: true, ...(Number.isSafeInteger(cursor) && cursor > 0 ? { id: { gt: cursor } } : {}),
        ...(buscar.trim() ? { nombre: { contains: buscar.trim().slice(0,100) } } : {}),
        ...(sinCodigo === 'true' ? { OR: [
          { presentaciones: { some: { activo: true, OR: [{ codigoBarras: null }, { codigoBarras: '' }] } } },
          { codigosBarras: { some: { codigoBarras: '' } } },
          { AND: [{ OR: [{ codigoBarras: null }, { codigoBarras: '' }] }, { presentaciones: { none: { activo: true } } }, { codigosBarras: { none: {} } }] },
        ] } : {}),
      }, orderBy: { id: 'asc' }, take: 51, select: { id: true, nombre: true, codigoBarras: true,
        presentaciones: { where: { activo: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }], select: { id: true, nombre: true, codigoBarras: true } },
        codigosBarras: { orderBy: { id: 'asc' }, select: { id: true, sabor: true, codigoBarras: true } },
      },
    });
    return { productos: filas.slice(0,50), siguiente: filas.length > 50 ? filas[49].id : null };
  }

  async guardar(usuario: Identidad, token: unknown, id: number, datos: any) {
    await this.verificar(usuario, token);
    if (!Number.isSafeInteger(id) || id < 1 || !datos || Object.keys(datos).some(k => !['codigoBarras', 'anterior', 'tipo', 'destinoId'].includes(k)) || typeof datos.codigoBarras !== 'string' || !/^[\x21-\x7e]{1,80}$/.test(datos.codigoBarras) || !(datos.anterior === null || typeof datos.anterior === 'string')) throw new BadRequestException('Solo puedes ingresar un código de barras válido de hasta 80 caracteres');
    const tipo = datos.tipo ?? 'PRODUCTO';
    if (!['PRODUCTO','PRESENTACION','SABOR'].includes(tipo) || (tipo !== 'PRODUCTO' && (!Number.isSafeInteger(datos.destinoId) || datos.destinoId < 1)) || (tipo === 'PRODUCTO' && datos.destinoId !== undefined)) throw new BadRequestException('Destino de código no válido');
    try {
      return await this.prisma.$transaction(async tx => {
        const producto = await tx.producto.findFirst({ where: { id, empresaId: usuario.empresaId, activo: true }, select: { id: true, nombre: true, codigoBarras: true } });
        if (!producto) throw new NotFoundException('Producto no encontrado');
        const destino = tipo === 'PRESENTACION'
          ? await tx.productoPresentacion.findFirst({ where: { id: datos.destinoId, productoId: id, activo: true, producto: { empresaId: usuario.empresaId } }, select: { id: true, nombre: true, codigoBarras: true } })
          : tipo === 'SABOR'
            ? await tx.productoCodigoBarras.findFirst({ where: { id: datos.destinoId, productoId: id, empresaId: usuario.empresaId }, select: { id: true, sabor: true, codigoBarras: true } })
            : producto;
        if (!destino) throw new NotFoundException('La presentación o sabor no pertenece a este producto');
        if (destino.codigoBarras !== datos.anterior) throw new ConflictException('Otro usuario cambió este código. Actualiza la lista antes de guardar');
        const nombre = tipo === 'PRODUCTO' ? producto.nombre : `${producto.nombre} · ${tipo === 'PRESENTACION' ? destino['nombre'] : destino['sabor']}`;
        const codigoBarras = datos.codigoBarras;
        const [otro, variante, presentacion] = await Promise.all([
          tx.producto.findFirst({ where: { empresaId: usuario.empresaId, codigoBarras, ...(tipo === 'PRODUCTO' ? { id: { not: id } } : {}) }, select: { id: true } }),
          tx.productoCodigoBarras.findFirst({ where: { empresaId: usuario.empresaId, codigoBarras, ...(tipo === 'SABOR' ? { id: { not: datos.destinoId } } : {}) }, select: { id: true } }),
          tx.productoPresentacion.findFirst({ where: { codigoBarras, producto: { empresaId: usuario.empresaId }, ...(tipo === 'PRESENTACION' ? { id: { not: datos.destinoId } } : {}) }, select: { id: true } }),
        ]);
        if (otro || variante || presentacion) throw new ConflictException('Ese código ya está asignado a otro producto, sabor o presentación');
        const cambio = tipo === 'PRESENTACION'
          ? await tx.productoPresentacion.updateMany({ where: { id: datos.destinoId, productoId: id, activo: true, producto: { empresaId: usuario.empresaId }, codigoBarras: datos.anterior }, data: { codigoBarras } })
          : tipo === 'SABOR'
            ? await tx.productoCodigoBarras.updateMany({ where: { id: datos.destinoId, productoId: id, empresaId: usuario.empresaId, codigoBarras: datos.anterior }, data: { codigoBarras } })
            : await tx.producto.updateMany({ where: { id, empresaId: usuario.empresaId, codigoBarras: datos.anterior }, data: { codigoBarras } });
        if (cambio.count !== 1) throw new ConflictException('El código cambió. Actualiza la lista');
        await tx.auditoria.create({ data: { empresaId: usuario.empresaId, usuarioId: usuario.id, entidad: 'ProductoCodigoBarras', entidadId: id, accion: 'MODIFICAR', detalle: { anterior: destino.codigoBarras, nuevo: codigoBarras, nombre, tipo, destinoId: destino.id } } });
        return { id, nombre, codigoBarras, anterior: destino.codigoBarras, tipo, destinoId: destino.id };
      });
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('Ese código ya está asignado');
      throw error;
    }
  }
}
