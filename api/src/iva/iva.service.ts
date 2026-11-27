import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AjustesService } from '../ajustes/ajustes.service';
import { aplicarCambios, ConfigIva, configInicial, desgloseVacio, desglosar, desglosarVenta, NOMBRE_TARIFA, normalizarConfig, sumarDesgloses, tarifaDe, TARIFAS, validarCambios } from './iva.reglas';

const DIA = 86400000;
// La configuración es de la empresa en la base de la sede; sucursal 0 la distingue de los ajustes por sede.
const CLAVE = { sucursalId: 0, clave: 'iva' };

@Injectable()
export class IvaService {
  constructor(private readonly prisma: PrismaService, private readonly ajustes: AjustesService) {}

  async config(empresaId: number): Promise<ConfigIva> {
    const guardada = await this.ajustes.leer<Record<string, unknown>>(empresaId, CLAVE.sucursalId, CLAVE.clave, {});
    return normalizarConfig(guardada, empresaId);
  }

  async guardar(empresaId: number, usuarioId: number, body: unknown) {
    const cambios = validarCambios(body);
    if (cambios.productos && Object.keys(cambios.productos).length) {
      const ids = Object.keys(cambios.productos).map(Number);
      const existentes = await this.prisma.producto.count({ where: { empresaId, id: { in: ids } } });
      if (existentes !== ids.length) throw new BadRequestException('Algún producto no pertenece a la empresa');
    }
    const nueva = aplicarCambios(await this.config(empresaId), cambios);
    await this.ajustes.guardar(empresaId, CLAVE.sucursalId, CLAVE.clave, nueva, usuarioId);
    return this.resumen(empresaId);
  }

  // Configuración y productos con su tarifa, para la pantalla de tarifas.
  async resumen(empresaId: number) {
    const config = await this.config(empresaId);
    const productos = await this.prisma.producto.findMany({
      where: { empresaId, activo: true },
      select: { id: true, nombre: true, precio: true, categoria: { select: { id: true, nombre: true } } },
      orderBy: { nombre: 'asc' },
      take: 5000,
    });
    const lista = productos.map((p: any) => {
      const { tarifa, confirmada } = tarifaDe(config, p.id);
      return { id: p.id, nombre: p.nombre, categoria: p.categoria?.nombre || '', categoriaId: p.categoria?.id ?? null, precio: Number(p.precio), tarifa, confirmada, ...desglosar(Number(p.precio), config.responsable ? tarifa : 'EXCLUIDO') };
    });
    return { config: { responsable: config.responsable, costoIncluyeIva: config.costoIncluyeIva, porDefecto: config.porDefecto }, productos: lista, sinConfirmar: config.responsable ? lista.filter((p) => !p.confirmada).length : 0 };
  }

  // Reporte para la declaración: IVA generado por tarifa (ventas menos devoluciones), IVA descontable de compras y saldo.
  async reporte(empresaId: number, desde: unknown, hasta: unknown) {
    const leer = (v: unknown, fin: boolean) => {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException('Fechas no válidas');
      return new Date(`${v}T${fin ? '23:59:59.999' : '00:00:00.000'}-05:00`);
    };
    const inicio = leer(desde, false), fin = leer(hasta, true);
    if (fin < inicio || fin.getTime() - inicio.getTime() > 186 * DIA) throw new BadRequestException('El periodo debe ser de máximo 6 meses');
    const rango = { gte: inicio, lte: fin };
    const config = await this.config(empresaId);
    const db: any = this.prisma;
    const [pedidos, devoluciones, compras] = await Promise.all([
      db.pedido.findMany({ where: { sucursal: { empresaId }, estado: { not: 'ANULADO' }, creadoEn: rango }, select: { id: true, total: true, detalles: { select: { productoId: true, subtotal: true } } }, take: 200000 }),
      db.operacionVentaCaja.findMany({ where: { empresaId, tipo: 'DEVOLUCION', creadoEn: rango }, select: { monto: true, pedido: { select: { total: true, detalles: { select: { productoId: true, subtotal: true } } } } }, take: 50000 }),
      db.compraGasto.findMany({ where: { empresaId, fecha: rango, categoria: { in: ['COMPRA_INSUMOS', 'COMPRA_MERCANCIA'] } }, select: { monto: true, detalles: { select: { productoId: true, subtotal: true } } }, take: 50000 }),
    ]);
    const lineas = (d: any[]) => d.map((x) => ({ productoId: x.productoId, subtotal: Number(x.subtotal) }));
    let ventas = desgloseVacio(), devuelto = desgloseVacio(), descontable = desgloseVacio();
    for (const p of pedidos) ventas = sumarDesgloses(ventas, desglosarVenta(lineas(p.detalles), Number(p.total), config));
    for (const o of devoluciones) devuelto = sumarDesgloses(devuelto, desglosarVenta(lineas(o.pedido?.detalles || []), Number(o.monto), config));
    if (config.responsable && config.costoIncluyeIva)
      for (const c of compras) descontable = sumarDesgloses(descontable, desglosarVenta(lineas(c.detalles), Number(c.monto), config));
    const neto = sumarDesgloses(ventas, devuelto, -1);
    const generado = TARIFAS.reduce((s, t) => s + neto[t].iva, 0), porDescontar = TARIFAS.reduce((s, t) => s + descontable[t].iva, 0);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      responsable: config.responsable,
      costoIncluyeIva: config.costoIncluyeIva,
      tarifas: TARIFAS.map((t) => ({ tarifa: t, nombre: NOMBRE_TARIFA[t], ventas: ventas[t], devoluciones: devuelto[t], neto: neto[t], compras: descontable[t] })),
      ivaGenerado: r2(generado),
      ivaDescontable: r2(porDescontar),
      saldo: r2(generado - porDescontar),
      sinConfirmar: config.responsable ? (await this.resumen(empresaId)).sinConfirmar : 0,
    };
  }
}
