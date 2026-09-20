import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class InventarioService {
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

  async listarIngredientes(empresaId: number, incluirInactivos = false) {
    const ingredientes = await this.prisma.ingrediente.findMany({
      where: { empresaId, ...(!incluirInactivos ? { activo: true } : {}) },
      include: {
        productos: { include: { producto: true } },
        movimientos: {
          orderBy: { creadoEn: 'desc' },
          take: 5,
          include: { usuario: { select: { nombre: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    return ingredientes.map(ing => ({
      ...ing,
      stockBajo: Number(ing.stock) <= Number(ing.stockMinimo),
      stockCritico: Number(ing.stock) <= Number(ing.stockMinimo) * 0.5,
    }));
  }

  async crearIngrediente(datos: any, usuarioId: number, empresaId: number) {
    const stockInicial = datos.stock || 0;
    const stockMinimo = datos.stockMinimo || 0;

    const ingrediente = await this.prisma.ingrediente.create({
      data: {
        empresaId,
        nombre: datos.nombre,
        unidad: datos.unidad,
        stock: stockInicial,
        stockMinimo,
        unidadCompra: datos.unidadCompra || null,
        factorConversion: datos.factorConversion || null,
        costoUnitario: datos.costoUnitario || null,
      },
    });

    await this.prisma.movimientoInventario.create({
      data: {
        ingredienteId: ingrediente.id,
        usuarioId,
        tipo: 'AJUSTE',
        cantidadMovida: stockInicial,
        stockAnterior: 0,
        stockNuevo: stockInicial,
        descripcion: 'Creación de ingrediente',
      },
    });

    if (stockInicial <= stockMinimo) {
      await this.notificaciones.enviarAlerta({
        tipo: 'STOCK BAJO',
        mensaje: `⚠️ ${ingrediente.nombre} fue creado con stock bajo: ${stockInicial} ${ingrediente.unidad} (mínimo: ${stockMinimo})`,
        empresa: 'PowerPOS',
        sucursal: 'Sucursal Principal',
        empresaId,
      });
    }

    return ingrediente;
  }

  async actualizarIngrediente(id: number, datos: any, empresaId: number) {
    const ingrediente = await this.prisma.ingrediente.findFirst({ where: { id, empresaId } });
    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado');

    return this.prisma.ingrediente.update({
      where: { id },
      data: {
        nombre: datos.nombre ?? ingrediente.nombre,
        unidad: datos.unidad ?? ingrediente.unidad,
        stockMinimo: datos.stockMinimo ?? ingrediente.stockMinimo,
        unidadCompra: datos.unidadCompra !== undefined ? datos.unidadCompra : ingrediente.unidadCompra,
        factorConversion: datos.factorConversion !== undefined ? datos.factorConversion : ingrediente.factorConversion,
        costoUnitario: datos.costoUnitario !== undefined ? datos.costoUnitario : ingrediente.costoUnitario,
      },
    });
  }

  async toggleActivo(id: number, empresaId: number) {
    const ingrediente = await this.prisma.ingrediente.findFirst({ where: { id, empresaId } });
    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado');

    return this.prisma.ingrediente.update({
      where: { id },
      data: { activo: !ingrediente.activo },
    });
  }

  async ajustarStock(ingredienteId: number, datos: any, usuarioId: number, empresaId: number) {
    const ingrediente = await this.prisma.ingrediente.findFirst({
      where: { id: ingredienteId, empresaId },
    });

    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado');

    const stockAnterior = Number(ingrediente.stock);
    let cantidadReal = Number(datos.cantidad);
    let factorAplicado = null;

    if (datos.enUnidadCompra && ingrediente.factorConversion) {
      factorAplicado = Number(ingrediente.factorConversion);
      cantidadReal = Number(datos.cantidad) * factorAplicado;
    }

    let stockNuevo: number;
    if (datos.tipo === 'ENTRADA') {
      stockNuevo = stockAnterior + cantidadReal;
    } else if (datos.tipo === 'SALIDA') {
      stockNuevo = stockAnterior - cantidadReal;
    } else {
      stockNuevo = cantidadReal;
    }

    const actualizado = await this.prisma.ingrediente.update({
      where: { id: ingredienteId },
      data: { stock: stockNuevo },
    });

    await this.prisma.movimientoInventario.create({
      data: {
        ingredienteId,
        usuarioId,
        tipo: datos.tipo,
        cantidadMovida: cantidadReal,
        unidadCompra: datos.enUnidadCompra ? ingrediente.unidadCompra : null,
        factorAplicado,
        stockAnterior,
        stockNuevo,
        descripcion: datos.descripcion || null,
      },
    });

    if (stockNuevo <= Number(ingrediente.stockMinimo)) {
      await this.notificaciones.enviarAlerta({
        tipo: 'STOCK BAJO',
        mensaje: `⚠️ ${ingrediente.nombre} tiene stock bajo: ${stockNuevo} ${ingrediente.unidad} (mínimo: ${ingrediente.stockMinimo})`,
        empresa: 'PowerPOS',
        sucursal: 'Sucursal Principal',
        empresaId,
      });
    }

    return { ...actualizado, stockAnterior, stockNuevo, cantidadMovida: cantidadReal, factorAplicado };
  }

  async obtenerHistorial(ingredienteId: number, empresaId: number) {
    const ingrediente = await this.prisma.ingrediente.findFirst({ where: { id: ingredienteId, empresaId } });
    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado');
    return this.prisma.movimientoInventario.findMany({
      where: { ingredienteId },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: 50,
    });
  }

  async obtenerAlertas(empresaId: number) {
    const ingredientes = await this.prisma.ingrediente.findMany({
      where: { empresaId, activo: true },
    });

    return ingredientes
      .filter(ing => Number(ing.stock) <= Number(ing.stockMinimo))
      .map(ing => ({
        ...ing,
        stockBajo: true,
        stockCritico: Number(ing.stock) <= Number(ing.stockMinimo) * 0.5,
      }));
  }
}
