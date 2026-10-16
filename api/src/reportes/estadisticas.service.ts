import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { fechaDia } from '../administracion/administracion.service';

type VentaEstadistica = {
  id: number;
  total: unknown;
  subtotal: unknown;
  descuento: unknown;
  estado: string;
  creadoEn: Date;
  sucursalId: number;
  sucursal: { nombre: string };
  metodoPago: string;
  pagos: { metodoPago: string; monto: unknown }[];
  detalles: {
    productoId: number;
    cantidad: number;
    subtotal: unknown;
    producto: { nombre: string };
  }[];
};
const redondear = (n: number) => Math.round(n * 100) / 100;
export function agruparDias(dias: { fecha: string; total: number; cantidad: number }[], tipo: 'semana' | 'mes') {
  const grupos = new Map<string, { periodo: string; total: number; cantidad: number }>();
  for (const d of dias) {
    let periodo = d.fecha.slice(0, 7);
    if (tipo === 'semana') {
      const fecha = new Date(`${d.fecha}T00:00:00Z`);
      fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay() + 6) % 7);
      periodo = `Semana del ${fecha.toISOString().slice(0, 10)}`;
    }
    const g = grupos.get(periodo) || { periodo, total: 0, cantidad: 0 };
    g.total += d.total; g.cantidad += d.cantidad; grupos.set(periodo, g);
  }
  return [...grupos.values()].map(g => ({ ...g, total: redondear(g.total) }));
}
export function resumirVentas(
  ventas: VentaEstadistica[],
  desde: Date,
  dias: number,
) {
  const diarias = new Map<
    string,
    { fecha: string; total: number; cantidad: number }
  >();
  for (let i = 0; i < dias; i++) {
    const fecha = new Date(desde.getTime() + i * 86400000 - 5 * 3600000)
      .toISOString()
      .slice(0, 10);
    diarias.set(fecha, { fecha, total: 0, cantidad: 0 });
  }
  const horas = Array.from({ length: 24 }, (_, hora) => ({
    hora: `${String(hora).padStart(2, '0')}:00`,
    total: 0,
    cantidad: 0,
  }));
  const sucursales = new Map<
    number,
    { id: number; nombre: string; total: number; cantidad: number }
  >();
  const medios = new Map<string, number>();
  const productos = new Map<
    number,
    { id: number; nombre: string; cantidad: number; subtotal: number }
  >();
  let total = 0,
    descuentos = 0,
    anuladas = 0,
    valorAnulado = 0,
    cantidad = 0;
  for (const venta of ventas) {
    if (venta.estado === 'ANULADO') {
      anuladas++;
      valorAnulado += Number(venta.total);
      continue;
    }
    cantidad++;
    total += Number(venta.total);
    descuentos += Number(venta.descuento);
    const local = new Date(venta.creadoEn.getTime() - 5 * 3600000);
    const diaria = diarias.get(local.toISOString().slice(0, 10));
    if (diaria) {
      diaria.total += Number(venta.total);
      diaria.cantidad++;
    }
    horas[local.getUTCHours()].total += Number(venta.total);
    horas[local.getUTCHours()].cantidad++;
    const sucursal = sucursales.get(venta.sucursalId) ?? {
      id: venta.sucursalId,
      nombre: venta.sucursal.nombre,
      total: 0,
      cantidad: 0,
    };
    sucursal.total += Number(venta.total);
    sucursal.cantidad++;
    sucursales.set(venta.sucursalId, sucursal);
    const pagos = venta.pagos.length
      ? venta.pagos
      : [{ metodoPago: venta.metodoPago, monto: venta.total }];
    for (const pago of pagos)
      medios.set(
        pago.metodoPago,
        (medios.get(pago.metodoPago) || 0) + Number(pago.monto),
      );
    for (const detalle of venta.detalles) {
      const producto = productos.get(detalle.productoId) ?? {
        id: detalle.productoId,
        nombre: detalle.producto.nombre,
        cantidad: 0,
        subtotal: 0,
      };
      producto.cantidad += detalle.cantidad;
      producto.subtotal += Number(detalle.subtotal);
      productos.set(detalle.productoId, producto);
    }
  }
  return {
    ventas: redondear(total),
    cantidad,
    ticketPromedio: cantidad ? redondear(total / cantidad) : 0,
    descuentos: redondear(descuentos),
    anuladas,
    valorAnulado: redondear(valorAnulado),
    diarias: [...diarias.values()].map((d) => ({
      ...d,
      total: redondear(d.total),
    })),
    horas: horas.map((h) => ({
      ...h,
      total: redondear(h.total),
      promedioDiario: redondear(h.total / dias),
    })),
    sucursales: [...sucursales.values()]
      .map((s) => ({ ...s, total: redondear(s.total) }))
      .sort((a, b) => b.total - a.total),
    medios: [...medios].map(([medio, monto]) => ({
      medio,
      monto: redondear(monto),
    })),
    productos: [...productos.values()]
      .map((p) => ({ ...p, subtotal: redondear(p.subtotal) }))
      .sort((a, b) => b.subtotal - a.subtotal)
      .slice(0, 10),
  };
}

@Injectable()
export class EstadisticasService {
  constructor(private readonly prisma: PrismaService) {}

  async consultar(
    empresaId: number,
    desdeInput: string,
    hastaInput: string,
    sucursalInput?: string,
  ) {
    const desde = fechaDia(desdeInput);
    const hasta = new Date(fechaDia(hastaInput).getTime() + 86400000);
    const dias = (hasta.getTime() - desde.getTime()) / 86400000;
    if (dias < 1 || dias > 366)
      throw new BadRequestException('Selecciona entre uno y 366 días');
    const sucursalId = sucursalInput ? Number(sucursalInput) : undefined;
    if (
      sucursalInput &&
      (!Number.isInteger(sucursalId) ||
        sucursalId <= 0 ||
        !(await this.prisma.sucursal.findFirst({
          where: { id: sucursalId, empresaId },
          select: { id: true },
        })))
    )
      throw new BadRequestException('Sucursal no disponible para esta empresa');
    const anteriorDesde = new Date(desde.getTime() - dias * 86400000);
    const alcance = {
      sucursal: { empresaId },
      ...(sucursalId ? { sucursalId } : {}),
    };
    const where = { ...alcance, creadoEn: { gte: anteriorDesde, lt: hasta } };
    // Límite explícito para no cargar historias completas en la API de producción.
    const cantidad = await this.prisma.pedido.count({ where });
    if (cantidad > 50000)
      throw new BadRequestException(
        'El periodo contiene demasiadas ventas. Selecciona menos días o una sucursal',
      );
    const [actuales, anteriores, sucursales] = await Promise.all([
      this.prisma.pedido.findMany({
        where: { ...alcance, creadoEn: { gte: desde, lt: hasta } },
        select: {
          id: true,
          total: true,
          subtotal: true,
          descuento: true,
          estado: true,
          creadoEn: true,
          sucursalId: true,
          metodoPago: true,
          sucursal: { select: { nombre: true } },
          pagos: { select: { metodoPago: true, monto: true } },
          detalles: {
            select: {
              productoId: true,
              cantidad: true,
              subtotal: true,
              producto: { select: { nombre: true } },
            },
          },
        },
      }),
      this.prisma.pedido.aggregate({
        where: {
          ...alcance,
          creadoEn: { gte: anteriorDesde, lt: desde },
          estado: { not: 'ANULADO' },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.sucursal.findMany({
        where: { empresaId },
        select: { id: true, nombre: true, activo: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);
    const resumen = resumirVentas(actuales, desde, dias);
    const totalAnterior = Number(anteriores._sum.total || 0);
    return {
      ...resumen,
      semanales: agruparDias(resumen.diarias, 'semana'),
      mensuales: agruparDias(resumen.diarias, 'mes'),
      filtro: {
        desde: desdeInput,
        hasta: hastaInput,
        sucursalId: sucursalId ?? null,
        dias,
      },
      anterior: {
        desde: new Date(anteriorDesde.getTime() - 5 * 3600000)
          .toISOString()
          .slice(0, 10),
        hasta: new Date(desde.getTime() - 86400000 - 5 * 3600000)
          .toISOString()
          .slice(0, 10),
        total: totalAnterior,
        cantidad: anteriores._count,
      },
      variacion:
        totalAnterior > 0
          ? redondear(((resumen.ventas - totalAnterior) / totalAnterior) * 100)
          : null,
      sucursalesDisponibles: sucursales,
    };
  }
}
