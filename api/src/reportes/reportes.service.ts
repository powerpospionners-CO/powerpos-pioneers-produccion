import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportesService {
  constructor(private prisma: PrismaService) {}

  async rendimientoPorEmpleado(empresaId: number) {
    const pedidos = await this.prisma.pedido.findMany({
      where: {
        sucursal: { empresaId },
        estado: { not: 'ANULADO' },
      },
      include: {
        usuario: { select: { id: true, nombre: true } },
      },
    });

    const porEmpleado = new Map<number, { nombre: string; totalVentas: number; cantidadPedidos: number }>();

    for (const pedido of pedidos) {
      const actual = porEmpleado.get(pedido.usuarioId) || {
        nombre: pedido.usuario.nombre,
        totalVentas: 0,
        cantidadPedidos: 0,
      };
      actual.totalVentas += Number(pedido.total);
      actual.cantidadPedidos += 1;
      porEmpleado.set(pedido.usuarioId, actual);
    }

    return Array.from(porEmpleado.values())
      .map((e) => ({
        ...e,
        ticketPromedio: e.cantidadPedidos > 0 ? e.totalVentas / e.cantidadPedidos : 0,
      }))
      .sort((a, b) => b.totalVentas - a.totalVentas);
  }

  async mejoresClientes(empresaId: number, limite = 10) {
    const clientes = await this.prisma.cliente.findMany({
      where: { empresaId, activo: true },
      include: {
        pedidos: { where: { estado: { not: 'ANULADO' } } },
      },
    });

    return clientes
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        totalGastado: c.pedidos.reduce((acc, p) => acc + Number(p.total), 0),
        cantidadPedidos: c.pedidos.length,
        puntos: c.puntos,
      }))
      .filter((c) => c.cantidadPedidos > 0)
      .sort((a, b) => b.totalGastado - a.totalGastado)
      .slice(0, limite);
  }

  async comparativaPorPeriodo(empresaId: number) {
    const ahora = new Date();

    const inicioSemanaActual = new Date(ahora);
    inicioSemanaActual.setDate(ahora.getDate() - ahora.getDay());
    inicioSemanaActual.setHours(0, 0, 0, 0);

    const inicioSemanaPasada = new Date(inicioSemanaActual);
    inicioSemanaPasada.setDate(inicioSemanaActual.getDate() - 7);

    const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const finMesPasado = new Date(inicioMesActual.getTime() - 1);

    const sumarVentas = async (desde: Date, hasta?: Date) => {
      const pedidos = await this.prisma.pedido.findMany({
        where: {
          sucursal: { empresaId },
          estado: { not: 'ANULADO' },
          creadoEn: { gte: desde, ...(hasta && { lte: hasta }) },
        },
      });
      return {
        total: pedidos.reduce((acc, p) => acc + Number(p.total), 0),
        cantidadPedidos: pedidos.length,
      };
    };

    const [semanaActual, semanaPasada, mesActual, mesPasado] = await Promise.all([
      sumarVentas(inicioSemanaActual),
      sumarVentas(inicioSemanaPasada, inicioSemanaActual),
      sumarVentas(inicioMesActual),
      sumarVentas(inicioMesPasado, finMesPasado),
    ]);

    const variacionSemana = semanaPasada.total > 0
      ? ((semanaActual.total - semanaPasada.total) / semanaPasada.total) * 100
      : null;

    const variacionMes = mesPasado.total > 0
      ? ((mesActual.total - mesPasado.total) / mesPasado.total) * 100
      : null;

    return {
      semana: { actual: semanaActual, anterior: semanaPasada, variacionPorcentual: variacionSemana },
      mes: { actual: mesActual, anterior: mesPasado, variacionPorcentual: variacionMes },
    };
  }

  async rentabilidadPorProducto(empresaId: number) {
    const productos = await this.prisma.producto.findMany({
      where: { empresaId, activo: true },
      include: {
        ingredientes: { include: { ingrediente: true } },
      },
    });

    return productos.map((producto) => {
      const usaReceta = producto.ingredientes.length > 0;
      let costoReceta: number;
      let tieneCostosDefinidos: boolean;

      if (usaReceta) {
        // Negocios tipo restaurante: el costo sale de sumar los ingredientes de la receta.
        costoReceta = producto.ingredientes.reduce((acc, pi) => {
          const costoUnitario = pi.ingrediente.costoUnitario ? Number(pi.ingrediente.costoUnitario) : 0;
          return acc + costoUnitario * Number(pi.cantidad);
        }, 0);
        tieneCostosDefinidos = producto.ingredientes.every((pi) => pi.ingrediente.costoUnitario !== null);
      } else {
        // Comercio/tienda/supermercado: no hay receta, el costo es el campo directo del producto.
        costoReceta = producto.costo !== null && producto.costo !== undefined ? Number(producto.costo) : 0;
        tieneCostosDefinidos = producto.costo !== null && producto.costo !== undefined;
      }

      const precioVenta = Number(producto.precio);
      const margenAbsoluto = precioVenta - costoReceta;
      const margenPorcentual = precioVenta > 0 ? (margenAbsoluto / precioVenta) * 100 : 0;

      return {
        id: producto.id,
        nombre: producto.nombre,
        precioVenta,
        costoReceta: Math.round(costoReceta * 100) / 100,
        margenAbsoluto: Math.round(margenAbsoluto * 100) / 100,
        margenPorcentual: Math.round(margenPorcentual * 10) / 10,
        tieneCostosDefinidos,
      };
    }).sort((a, b) => b.margenPorcentual - a.margenPorcentual);
  }

  async generarReportePeriodo(empresaId: number, tipo: 'DIARIO' | 'MENSUAL' | 'ANUAL', fechaInput?: string) {
    const fechaReferencia = fechaInput ? new Date(fechaInput) : new Date();
    if (Number.isNaN(fechaReferencia.getTime())) {
      throw new Error('Fecha inválida para el reporte');
    }

    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, nombre: true, email: true, telefono: true, direccion: true },
    });

    const inicio = tipo === 'DIARIO'
      ? new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), fechaReferencia.getDate(), 0, 0, 0, 0)
      : tipo === 'MENSUAL'
        ? new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), 1, 0, 0, 0, 0)
        : new Date(fechaReferencia.getFullYear(), 0, 1, 0, 0, 0, 0);

    const fin = tipo === 'DIARIO'
      ? new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), fechaReferencia.getDate(), 23, 59, 59, 999)
      : tipo === 'MENSUAL'
        ? new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() + 1, 0, 23, 59, 59, 999)
        : new Date(fechaReferencia.getFullYear(), 11, 31, 23, 59, 59, 999);

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        sucursal: { empresaId },
        estado: { not: 'ANULADO' },
        creadoEn: { gte: inicio, lte: fin },
      },
      include: {
        usuario: { select: { nombre: true, email: true } },
        cliente: { select: { nombre: true, documento: true, telefono: true } },
        detalles: {
          include: {
            producto: { select: { nombre: true } },
            adicionales: true,
          },
        },
      },
      orderBy: { creadoEn: 'asc' },
    });

    const totalVentas = pedidos.reduce((acc, pedido) => acc + Number(pedido.total), 0);
    const cantidadPedidos = pedidos.length;
    const promedioPedido = cantidadPedidos > 0 ? totalVentas / cantidadPedidos : 0;
    const pagoPorMetodo = pedidos.reduce((acc, pedido) => {
      const metodo = pedido.metodoPago;
      acc[metodo] = (acc[metodo] || 0) + Number(pedido.total);
      return acc;
    }, {} as Record<string, number>);

    const productosMasVendidos = pedidos
      .flatMap((pedido) => pedido.detalles)
      .reduce((acc, detalle) => {
        const nombre = detalle.producto.nombre;
        acc[nombre] = (acc[nombre] || 0) + detalle.cantidad;
        return acc;
      }, {} as Record<string, number>);

    const topProductos = Object.entries(productosMasVendidos)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    const resumen = {
      tipo,
      empresa: empresa ? { id: empresa.id, nombre: empresa.nombre, email: empresa.email, telefono: empresa.telefono, direccion: empresa.direccion } : null,
      periodo: {
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
      },
      totalVentas: Number(totalVentas.toFixed(2)),
      cantidadPedidos,
      promedioPedido: Number(promedioPedido.toFixed(2)),
      pagoPorMetodo: Object.fromEntries(Object.entries(pagoPorMetodo).map(([key, value]) => [key, Number(value.toFixed(2))])),
      topProductos,
      pedidos: pedidos.map((pedido) => ({
        id: pedido.id,
        numero: pedido.numero,
        estado: pedido.estado,
        metodoPago: pedido.metodoPago,
        total: Number(pedido.total),
        cliente: pedido.cliente ? { nombre: pedido.cliente.nombre, documento: pedido.cliente.documento, telefono: pedido.cliente.telefono } : null,
        usuario: pedido.usuario ? { nombre: pedido.usuario.nombre, email: pedido.usuario.email } : null,
        creadoEn: pedido.creadoEn,
        detalles: pedido.detalles.map((detalle) => ({
          producto: detalle.producto.nombre,
          cantidad: detalle.cantidad,
          subtotal: Number(detalle.subtotal),
          observacion: detalle.observacion,
          exclusiones: detalle.exclusiones,
          adicionales: detalle.adicionales.map((ad) => ({
            nombre: ad.nombre,
            cantidad: ad.cantidad,
            subtotal: Number(ad.subtotal),
          })),
        })),
      })),
    };

    return resumen;
  }
}