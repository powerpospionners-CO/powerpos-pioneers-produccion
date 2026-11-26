import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { armarKardex, costoReceta, EventoKardex, leerConsumos, margen, periodo, sugerirCompra, TipoItem } from './costos.reglas';

const DIA = 86400000;
const CONCEPTOS: Record<string, string> = { ENTRADA: 'Entrada', SALIDA: 'Salida', AJUSTE: 'Ajuste de conteo' };
const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

// Análisis de costos e inventario: solo lectura sobre ventas, movimientos y recetas existentes.
@Injectable()
export class CostosService {
  constructor(private readonly prisma: PrismaService) {}

  // Ventas válidas desde una fecha, con su consumo de inventario.
  private ventas(empresaId: number, desde: Date) {
    return this.prisma.pedido.findMany({
      where: { sucursal: { empresaId }, estado: { not: 'ANULADO' }, creadoEn: { gte: desde } },
      select: { numero: true, creadoEn: true, consumoInventario: true },
      orderBy: { creadoEn: 'asc' },
      take: 50000,
    });
  }

  async kardex(empresaId: number, tipo: unknown, id: unknown, desde: unknown, hasta: unknown) {
    if (tipo !== 'PRODUCTO' && tipo !== 'INGREDIENTE') throw new BadRequestException('Elige un producto o un insumo');
    const itemId = Number(id);
    if (!Number.isSafeInteger(itemId) || itemId < 1) throw new BadRequestException('Elemento no válido');
    const { inicio, fin } = periodo(desde, hasta);
    const item: any = tipo === 'PRODUCTO'
      ? await this.prisma.producto.findFirst({ where: { id: itemId, empresaId }, select: { id: true, nombre: true, stockActual: true, costo: true, controlaStock: true } })
      : await this.prisma.ingrediente.findFirst({ where: { id: itemId, empresaId }, select: { id: true, nombre: true, stock: true, unidad: true, costoUnitario: true } });
    if (!item) throw new NotFoundException('No encontrado');
    // Se lee hasta hoy: el saldo se reconstruye hacia atrás desde el stock actual.
    const [movimientos, ventas] = await Promise.all([
      this.prisma.movimientoInventario.findMany({
        where: { ...(tipo === 'PRODUCTO' ? { productoId: itemId } : { ingredienteId: itemId }), creadoEn: { gte: inicio } },
        include: { usuario: { select: { nombre: true } } },
        orderBy: { creadoEn: 'asc' },
        take: 20000,
      }),
      this.ventas(empresaId, inicio),
    ]);
    const eventos: EventoKardex[] = movimientos.map((m: any) => {
      const delta = Number(m.stockNuevo) - Number(m.stockAnterior);
      return {
        fecha: m.creadoEn,
        concepto: m.motivoMerma ? `Merma (${m.motivoMerma})` : CONCEPTOS[m.tipo] || m.tipo,
        referencia: m.descripcion || '',
        entrada: delta > 0 ? delta : 0,
        salida: delta < 0 ? -delta : 0,
        usuario: m.usuario?.nombre,
      };
    });
    for (const v of ventas) {
      const cantidad = leerConsumos(v.consumoInventario).filter((c) => c.tipo === tipo && c.id === itemId).reduce((s, c) => s + c.cantidad, 0);
      if (cantidad > 0) eventos.push({ fecha: v.creadoEn, concepto: 'Venta', referencia: v.numero, entrada: 0, salida: cantidad });
    }
    const stock = Number(tipo === 'PRODUCTO' ? item.stockActual : item.stock);
    const costo = Number(tipo === 'PRODUCTO' ? item.costo ?? 0 : item.costoUnitario ?? 0);
    const k = armarKardex(eventos, stock, inicio, fin);
    return {
      item: { tipo, id: item.id, nombre: item.nombre, unidad: tipo === 'PRODUCTO' ? 'und' : item.unidad, stockActual: stock, costoUnitario: costo },
      ...k,
      valorSaldoFinal: Math.round(k.saldoFinal * costo * 100) / 100,
    };
  }

  // Costo de receta, margen actual y margen real de lo vendido (costo histórico de cada venta).
  async platos(empresaId: number, dias: unknown, umbral: unknown) {
    const d = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
    const minimo = Number.isFinite(Number(umbral)) && Number(umbral) >= 0 && Number(umbral) <= 100 ? Number(umbral) : 30;
    const desde = new Date(Date.now() - d * DIA);
    const [productos, detalles] = await Promise.all([
      this.prisma.producto.findMany({
        where: { empresaId, activo: true, esCombo: false },
        select: { id: true, nombre: true, precio: true, costo: true, categoria: { select: { nombre: true } }, ingredientes: { select: { cantidad: true, ingrediente: { select: { nombre: true, costoUnitario: true } } } } },
        orderBy: { nombre: 'asc' },
        take: 3000,
      }),
      this.prisma.detallePedido.findMany({
        where: { pedido: { sucursal: { empresaId }, estado: { not: 'ANULADO' }, creadoEn: { gte: desde } } },
        select: { productoId: true, cantidad: true, subtotal: true, costoVentaHistorico: true },
        take: 100000,
      }),
    ]);
    const vendidos = new Map<number, { cantidad: number; ventas: number; costo: number; sinCosto: number }>();
    for (const x of detalles) {
      const v = vendidos.get(x.productoId) || { cantidad: 0, ventas: 0, costo: 0, sinCosto: 0 };
      v.cantidad += x.cantidad;
      v.ventas += Number(x.subtotal);
      if (x.costoVentaHistorico == null) v.sinCosto += x.cantidad;
      else v.costo += Number(x.costoVentaHistorico);
      vendidos.set(x.productoId, v);
    }
    const filas = productos.map((p: any) => {
      const receta = costoReceta(p);
      const precio = Number(p.precio);
      const v = vendidos.get(p.id);
      const margenActual = margen(precio, receta.costo);
      return {
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria?.nombre || '',
        precio,
        costo: receta.costo,
        partes: receta.partes,
        costoIncompleto: receta.incompleto,
        margen: margenActual,
        utilidadUnidad: receta.costo === null ? null : Math.round((precio - receta.costo) * 100) / 100,
        vendidos: v?.cantidad || 0,
        ventas: Math.round((v?.ventas || 0) * 100) / 100,
        // Solo con ventas que guardaron su costo; las demás se cuentan aparte.
        margenReal: v && v.cantidad > v.sinCosto ? margen(v.ventas, v.costo) : null,
        utilidad: v && v.cantidad > v.sinCosto ? Math.round((v.ventas - v.costo) * 100) / 100 : null,
        alerta: receta.costo === null || receta.incompleto ? 'SIN_COSTO' : margenActual !== null && margenActual < minimo ? 'MARGEN_BAJO' : null,
      };
    });
    filas.sort((a, b) => b.ventas - a.ventas || a.nombre.localeCompare(b.nombre));
    return { dias: d, umbral: minimo, productos: filas };
  }

  // Compra sugerida según el consumo promedio de los últimos días.
  async sugerencia(empresaId: number, dias: unknown, cobertura: unknown) {
    const d = [7, 14, 28, 56].includes(Number(dias)) ? Number(dias) : 28;
    const c = Number.isSafeInteger(Number(cobertura)) && Number(cobertura) >= 1 && Number(cobertura) <= 60 ? Number(cobertura) : 7;
    const desde = new Date(Date.now() - d * DIA);
    const [ingredientes, productos, ventas] = await Promise.all([
      this.prisma.ingrediente.findMany({ where: { empresaId, activo: true }, select: { id: true, nombre: true, unidad: true, unidadCompra: true, factorConversion: true, stock: true, stockMinimo: true, costoUnitario: true } }),
      this.prisma.producto.findMany({ where: { empresaId, activo: true, controlaStock: true, esCombo: false }, select: { id: true, nombre: true, stockActual: true, stockMinimo: true, costo: true } }),
      this.ventas(empresaId, desde),
    ]);
    const consumo = new Map<string, number>();
    for (const v of ventas) for (const x of leerConsumos(v.consumoInventario)) consumo.set(`${x.tipo}:${x.id}`, (consumo.get(`${x.tipo}:${x.id}`) || 0) + x.cantidad);
    const fila = (tipo: TipoItem, x: any, stock: number, minimo: number, costo: number, unidad: string, compra?: { unidad: string; factor: number }) => {
      const s = sugerirCompra(stock, minimo, consumo.get(`${tipo}:${x.id}`) || 0, d, c);
      const enCompra = compra && compra.factor > 0 ? Math.ceil(s.sugerido / compra.factor) : null;
      return { tipo, id: x.id, nombre: x.nombre, unidad, stock, minimo, ...s, enUnidadCompra: enCompra, unidadCompra: compra?.unidad || null, costoEstimado: Math.round(s.sugerido * costo * 100) / 100 };
    };
    const lista = [
      ...ingredientes.map((i: any) => fila('INGREDIENTE', i, Number(i.stock), Number(i.stockMinimo), Number(i.costoUnitario ?? 0), i.unidad, i.unidadCompra && i.factorConversion ? { unidad: i.unidadCompra, factor: Number(i.factorConversion) } : undefined)),
      ...productos.map((p: any) => fila('PRODUCTO', p, p.stockActual, p.stockMinimo, Number(p.costo ?? 0), 'und')),
    ].filter((x) => x.sugerido > 0 || (x.diasCobertura !== null && x.diasCobertura < c));
    lista.sort((a, b) => (a.diasCobertura ?? Infinity) - (b.diasCobertura ?? Infinity) || b.costoEstimado - a.costoEstimado);
    return { dias: d, cobertura: c, fecha: hoyBogota(), items: lista, total: Math.round(lista.reduce((s, x) => s + x.costoEstimado, 0) * 100) / 100 };
  }
}
