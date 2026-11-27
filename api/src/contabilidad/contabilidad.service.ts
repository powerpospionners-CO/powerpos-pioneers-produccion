import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cuadra, libroDiario } from './contabilidad.reglas';
import { IvaService } from '../iva/iva.service';
import { desglosar, desglosarVenta, tarifaDe, TARIFAS } from '../iva/iva.reglas';

const DIA = 86400000;
const COMPRAS = ['COMPRA_INSUMOS', 'COMPRA_MERCANCIA'];
// Fecha contable en Bogotá (UTC-5).
const fechaBogota = (f: Date) => new Date(f.getTime() - 5 * 3600000).toISOString().slice(0, 10);

@Injectable()
export class ContabilidadService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly iva?: IvaService) {}

  private periodo(desde: unknown, hasta: unknown) {
    const leer = (v: unknown, fin: boolean) => {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException('Fechas no válidas');
      return new Date(`${v}T${fin ? '23:59:59.999' : '00:00:00.000'}-05:00`);
    };
    const inicio = leer(desde, false), fin = leer(hasta, true);
    if (fin < inicio || fin.getTime() - inicio.getTime() > 92 * DIA) throw new BadRequestException('El periodo debe ser de máximo 92 días');
    return { inicio, fin };
  }

  // Libro diario de la sede de la sesión. Solo lectura.
  async libroDiario(empresaId: number, desde: unknown, hasta: unknown) {
    const { inicio, fin } = this.periodo(desde, hasta);
    const rango = { gte: inicio, lte: fin };
    const db: any = this.prisma;
    const [empresa, pedidos, operaciones, movimientos, cuentas, asignaciones, catalogo] = await Promise.all([
      db.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true, nit: true, tipoNegocio: true } }),
      db.pedido.findMany({ where: { sucursal: { empresaId }, estado: { not: 'ANULADO' }, creadoEn: rango }, select: { id: true, creadoEn: true, total: true, metodoPago: true, pagos: { select: { metodoPago: true, monto: true } }, detalles: { select: { productoId: true, subtotal: true, costoVentaHistorico: true } } }, take: 100000 }),
      db.operacionVentaCaja.findMany({ where: { empresaId, tipo: { in: ['DEVOLUCION', 'COBRO_CREDITO'] }, creadoEn: rango }, select: { tipo: true, metodoPago: true, monto: true, creadoEn: true, pedido: { select: { detalles: { select: { productoId: true, subtotal: true } } } } }, take: 50000 }),
      db.movimientoFinanciero.findMany({ where: { empresaId, fecha: rango, categoria: { notIn: ['VENTA', 'COSTO_VENTA'] } }, select: { id: true, fecha: true, tipo: true, categoria: true, descripcion: true, monto: true, compraGastoId: true }, take: 50000 }),
      db.cuentaAdministrativa.findMany({ where: { empresaId }, select: { id: true, tipo: true, anulada: true, categoria: true, descripcion: true, monto: true, creadoEn: true, compraGastoId: true, abonos: { select: { movimientoId: true } } } }),
      db.asignacionPuc.findMany({ where: { empresaId } }),
      db.cuentaPuc.findMany({ where: { empresaId, activo: true }, select: { codigo: true, nombre: true } }),
    ]);
    // Propinas: tabla aditiva; puede no existir.
    let propinas: any[] = [];
    try {
      propinas = await db.propinaRegistro.findMany({ where: { empresaId, tipo: 'PROPINA', creadoEn: rango }, select: { pedidoId: true, metodoPago: true, monto: true, creadoEn: true } });
    } catch (e) {
      if (e?.code !== 'P2021') throw e;
    }
    const validos = new Set(pedidos.map((p: any) => p.id));
    // IVA: solo empresas responsables. Sin servicio de IVA se conserva el libro sin desglose.
    const config = this.iva ? await this.iva.config(empresaId) : null;
    const conIva = !!config?.responsable;
    const lineasDe = (d: any[]) => d.map((x: any) => ({ productoId: x.productoId, subtotal: Number(x.subtotal) }));
    // IVA descontable de compras de mercancía con detalle por producto, cuando el costo incluye IVA.
    const idsCompras = [...new Set([...movimientos.map((m: any) => m.compraGastoId), ...cuentas.map((c: any) => c.compraGastoId)].filter(Boolean))];
    const compras: any[] = conIva && config!.costoIncluyeIva && idsCompras.length
      ? await db.compraGasto.findMany({ where: { empresaId, id: { in: idsCompras }, categoria: { in: COMPRAS } }, select: { id: true, monto: true, detalles: { select: { productoId: true, subtotal: true } } } })
      : [];
    const ivaCompra = new Map<number, number>(compras.map((c) => {
      const d = desglosarVenta(lineasDe(c.detalles), Number(c.monto), config!);
      return [c.id, Math.round(TARIFAS.reduce((s, t) => s + d[t].iva, 0) * 100) / 100];
    }));
    // Costo sin el IVA descontable, por la tarifa de cada producto.
    const costoSinIva = (productoId: number, costo: number) => (conIva && config!.costoIncluyeIva ? desglosar(costo, tarifaDe(config!, productoId).tarifa).base : costo);
    const asignada = new Map(asignaciones.map((a: any) => [`${a.origen}:${a.registroId}`, a.codigo]));
    const abonos = new Set(cuentas.filter((c: any) => c.tipo === 'PAGAR').flatMap((c: any) => c.abonos.map((a: any) => a.movimientoId)));
    const comprobantes = libroDiario({
      restaurante: empresa?.tipoNegocio === 'RESTAURANTE',
      nombres: Object.fromEntries(catalogo.map((c: any) => [c.codigo, c.nombre])),
      ventas: pedidos.map((p: any) => {
        const total = Number(p.total);
        const pagos = p.pagos.length ? p.pagos.map((x: any) => ({ metodo: x.metodoPago, monto: Number(x.monto) })) : p.metodoPago === 'CREDITO' ? [] : [{ metodo: p.metodoPago, monto: total }];
        const completo = p.detalles.length && p.detalles.every((d: any) => d.costoVentaHistorico !== null);
        const costo = completo ? p.detalles.reduce((s: number, d: any) => s + costoSinIva(d.productoId, Number(d.costoVentaHistorico)), 0) : null;
        return { fecha: fechaBogota(p.creadoEn), total, pagos, costo, ...(conIva ? { desglose: desglosarVenta(lineasDe(p.detalles), total, config!) } : {}) };
      }),
      devoluciones: operaciones.filter((o: any) => o.tipo === 'DEVOLUCION').map((o: any) => ({ fecha: fechaBogota(o.creadoEn), metodo: o.metodoPago, monto: Number(o.monto), ...(conIva ? { desglose: desglosarVenta(lineasDe(o.pedido?.detalles || []), Number(o.monto), config!) } : {}) })),
      cobrosCredito: operaciones.filter((o: any) => o.tipo === 'COBRO_CREDITO').map((o: any) => ({ fecha: fechaBogota(o.creadoEn), metodo: o.metodoPago, monto: Number(o.monto) })),
      propinas: propinas.filter((x) => validos.has(x.pedidoId)).map((x) => ({ fecha: fechaBogota(x.creadoEn), metodo: x.metodoPago, monto: Number(x.monto) })),
      movimientos: movimientos.map((m: any) => ({ id: m.id, fecha: fechaBogota(m.fecha), tipo: m.tipo, categoria: m.categoria, descripcion: m.descripcion, monto: Number(m.monto), cuenta: asignada.get(`MOVIMIENTO:${m.id}`) ?? null, abono: abonos.has(m.id), ivaDescontable: m.compraGastoId ? ivaCompra.get(m.compraGastoId) : undefined })),
      obligaciones: cuentas
        .filter((c: any) => c.tipo === 'PAGAR' && !c.anulada && c.creadoEn >= inicio && c.creadoEn <= fin)
        .map((c: any) => ({ id: c.id, fecha: fechaBogota(c.creadoEn), categoria: c.categoria, descripcion: c.descripcion, monto: Number(c.monto), cuenta: asignada.get(`CUENTA:${c.id}`) ?? (COMPRAS.includes(c.categoria) ? '143505' : null), ivaDescontable: c.compraGastoId ? ivaCompra.get(c.compraGastoId) : undefined })),
    });
    const debitos = comprobantes.reduce((s, c) => s + c.lineas.reduce((x, l) => x + l.debito, 0), 0);
    const creditos = comprobantes.reduce((s, c) => s + c.lineas.reduce((x, l) => x + l.credito, 0), 0);
    return {
      empresa: { nombre: empresa?.nombre, nit: empresa?.nit },
      comprobantes,
      totales: { debitos: Math.round(debitos * 100) / 100, creditos: Math.round(creditos * 100) / 100 },
      descuadrados: comprobantes.filter((c) => !cuadra(c)).map((c) => c.numero),
      porVerificar: comprobantes.filter((c) => c.verificar).length,
      iva: config ? { responsable: config.responsable, costoIncluyeIva: config.costoIncluyeIva } : null,
    };
  }
}
