import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const redondear = (n: number) => Math.round(n * 100) / 100;
const compras = ['COMPRA_MERCANCIA', 'COMPRA_INSUMOS'];
type Movimiento = { tipo: string; categoria: string; monto: unknown; fecha: Date; id: number };
export function flujoMovimientos(movimientos: Movimiento[]) {
  const efectivo = movimientos.filter(m => m.categoria !== 'COSTO_VENTA');
  const entradas = redondear(efectivo.filter(m => m.tipo === 'INGRESO').reduce((s,m) => s + Number(m.monto),0));
  const salidas = redondear(efectivo.filter(m => m.tipo === 'EGRESO').reduce((s,m) => s + Number(m.monto),0));
  const grupos = new Map<string, { categoria: string; entradas: number; salidas: number }>();
  for (const m of efectivo) {
    const g = grupos.get(m.categoria) || { categoria: m.categoria, entradas: 0, salidas: 0 };
    if (m.tipo === 'INGRESO') g.entradas += Number(m.monto); else g.salidas += Number(m.monto);
    grupos.set(m.categoria,g);
  }
  return { entradas, salidas, neto: redondear(entradas-salidas), categorias: [...grupos.values()].map(g => ({ ...g, entradas: redondear(g.entradas), salidas: redondear(g.salidas) })) };
}

@Injectable()
export class EstadosFinancierosService {
  constructor(private readonly prisma: PrismaService) {}
  async obtener(empresaId: number, fechaDesde?: string, fechaHasta?: string) {
    const desde = fechaDesde ? new Date(fechaDesde) : new Date('2000-01-01T00:00:00Z');
    const hasta = fechaHasta ? new Date(fechaHasta) : new Date();
    if (!Number.isFinite(desde.getTime()) || !Number.isFinite(hasta.getTime()) || desde > hasta) throw new BadRequestException('El rango de fechas no es válido');
    const ahora = new Date();
    const [movimientos, pedidos, devoluciones, cuentas, productos, saldo, historicoCaja] = await Promise.all([
      this.prisma.movimientoFinanciero.findMany({ where: { empresaId, fecha: { gte: desde, lte: hasta } } }),
      this.prisma.pedido.findMany({ where: { sucursal: { empresaId }, creadoEn: { gte: desde, lte: hasta }, estado: { not: 'ANULADO' } }, select: { id: true, numero: true, total: true, detalles: { select: { costoVentaHistorico: true } } } }),
      this.prisma.operacionVentaCaja.findMany({ where: { empresaId, tipo: 'DEVOLUCION', creadoEn: { gte: desde, lte: hasta } }, select: { detalle: true } }),
      this.prisma.cuentaAdministrativa.findMany({ where: { empresaId }, include: { abonos: true } }),
      this.prisma.producto.findMany({ where: { empresaId, controlaStock: true, esCombo: false }, select: { id: true, nombre: true, costo: true, stockActual: true } }),
      this.prisma.saldoInicialCuenta.findUnique({ where: { empresaId } }),
      this.prisma.movimientoFinanciero.findMany({ where: { empresaId, fecha: { lte: ahora }, categoria: { not: 'COSTO_VENTA' } } }),
    ]);
    const flujo = flujoMovimientos(movimientos);
    const totalVenta = pedidos.reduce((s,p) => s+Number(p.total),0);
    const devolucion = devoluciones.reduce((s,o) => s+Number((o.detalle as any)?.valorTotal || 0),0);
    const costoVentas = redondear(movimientos.filter(m=>m.categoria==='COSTO_VENTA').reduce((s,m)=>s+(m.tipo==='EGRESO'?1:-1)*Number(m.monto),0));
    const idsPagosObligaciones = new Set(cuentas.filter(c=>c.tipo==='PAGAR').flatMap(c=>c.abonos.map(a=>a.movimientoId)));
    const gastoPagado = movimientos.filter(m=>!['VENTA','COSTO_VENTA',...compras].includes(m.categoria) && !idsPagosObligaciones.has(m.id));
    const gastos = redondear(gastoPagado.filter(m=>m.tipo==='EGRESO').reduce((s,m)=>s+Number(m.monto),0) + cuentas.filter(c=>c.tipo==='PAGAR'&&!c.anulada&&!compras.includes(c.categoria)&&c.creadoEn>=desde&&c.creadoEn<=hasta).reduce((s,c)=>s+Number(c.monto),0));
    const otrosIngresos = redondear(gastoPagado.filter(m=>m.tipo==='INGRESO').reduce((s,m)=>s+Number(m.monto),0));
    const ventasNetas = redondear(totalVenta-devolucion);
    const ventasSinCosto = pedidos.filter(p=>p.detalles.some(d=>d.costoVentaHistorico===null)).map(p=>p.numero);
    const disponible = (fecha: Date, inclusivo = true) => !saldo || fecha < saldo.desde ? null : redondear(Number(saldo.monto) + flujoMovimientos(historicoCaja.filter(m=>m.fecha>=saldo.desde&&(inclusivo?m.fecha<=fecha:m.fecha<fecha))).neto);
    const activosSinCosto = productos.filter(p=>p.stockActual>0&&p.costo===null).map(p=>({ id:p.id,nombre:p.nombre }));
    const inventario = redondear(productos.reduce((s,p)=>s+Math.max(0,p.stockActual)*Number(p.costo||0),0));
    const cobrar = redondear(cuentas.filter(c=>!c.anulada&&c.tipo==='COBRAR').reduce((s,c)=>s+Number(c.saldo),0));
    const pagar = redondear(cuentas.filter(c=>!c.anulada&&c.tipo==='PAGAR').reduce((s,c)=>s+Number(c.saldo),0));
    const cajaActual = disponible(ahora);
    const activos = cajaActual === null ? null : redondear(cajaActual+inventario+cobrar);
    return {
      periodo: { desde, hasta },
      resultado: { ventasNetas, costoVentas, utilidadBruta: redondear(ventasNetas-costoVentas), otrosIngresos, gastos, resultadoNeto: redondear(ventasNetas-costoVentas+otrosIngresos-gastos), completo: !ventasSinCosto.length, ventasSinCosto },
      balance: { fecha: ahora, efectivo: cajaActual, inventario, cuentasPorCobrar: cobrar, totalActivos: activos, cuentasPorPagar: pagar, patrimonioRegistrado: activos===null?null:redondear(activos-pagar), productosSinCosto: activosSinCosto, completo: cajaActual!==null&&!activosSinCosto.length, alcance: 'Balance a la fecha de consulta con efectivo, inventario y cuentas registradas. El patrimonio es el activo neto registrado; no desglosa capital y utilidades. Activos fijos, préstamos u otras obligaciones sin registrar no están incluidos.' },
      flujo: { ...flujo, saldoInicial: disponible(desde, false), saldoFinal: disponible(hasta), saldoConfiguradoDesde: saldo?.desde || null, alcance: 'Método directo de los movimientos registrados. Los costos de venta no son pagos y se excluyen. Las ventas a crédito entran cuando se cobran. Los movimientos OTROS requieren clasificación si corresponden a inversión o financiación.' },
    };
  }
}
