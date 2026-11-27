import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { alertasControl, ControlUsuario, diaBogota, horaBogota, nuevoControl, rango, semanaAntes, variacion } from './dueno.reglas';

type Actor = { id: number; rol: string; empresaId: number; sucursalId: number };
type Sede = { sucursalId: number; nombre: string; db: any };
const dinero = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;

// Vista del dueño: lee cada sede de la empresa (con aislamiento, su propia base). Solo lectura.
@Injectable()
export class DuenoService {
  private readonly logger = new Logger(DuenoService.name);
  constructor(private readonly prisma: PrismaService) {}

  // El administrador ve todas las sedes; el gerente, solo la suya.
  private async sedes(a: Actor): Promise<Sede[]> {
    if (!['ADMIN_EMPRESA', 'GERENTE'].includes(a.rol) || !a.empresaId) throw new ForbiddenException('No tienes permisos para esta vista');
    const control: any = this.prisma.control || this.prisma;
    const sucursales: any[] = await control.sucursal.findMany({ where: { empresaId: a.empresaId, activo: true, ...(a.rol === 'GERENTE' ? { id: a.sucursalId } : {}) }, select: { id: true, nombre: true }, orderBy: { id: 'asc' } });
    if (!this.prisma.aislamientoActivo) return sucursales.map((s) => ({ sucursalId: s.id, nombre: s.nombre, db: this.prisma }));
    const bases: any[] = await this.prisma.control.baseSede.findMany({ where: { empresaId: a.empresaId, estado: 'ACTIVA' }, select: { sucursalId: true } });
    const activas = new Set(bases.map((b) => b.sucursalId));
    const lista: Sede[] = [];
    for (const s of sucursales.filter((x) => activas.has(x.id))) {
      // Sin conexión a la sede, se reporta como sede sin datos en lugar de fallar todo.
      const db = await this.prisma.contexto(a.empresaId, s.id).then((c) => c.cliente).catch(() => null);
      lista.push({ sucursalId: s.id, nombre: s.nombre, db });
    }
    return lista;
  }

  // Una sede que no responde no tumba el resumen: se marca con error.
  private async porSede<T>(sedes: Sede[], fn: (s: Sede) => Promise<T>) {
    return Promise.all(sedes.map(async (s) => {
      try {
        return { sucursalId: s.sucursalId, nombre: s.nombre, ok: true as const, ...(await fn(s)) };
      } catch (e) {
        this.logger.warn(`No se pudo leer la sede ${s.sucursalId}: ${e}`);
        return { sucursalId: s.sucursalId, nombre: s.nombre, ok: false as const };
      }
    }));
  }

  async resumen(a: Actor, fecha?: unknown) {
    const dia = diaBogota(fecha);
    const antes = semanaAntes(dia);
    const sedes = await this.sedes(a);
    const filas = await this.porSede(sedes, async ({ sucursalId, db }) => {
      const base = { sucursalId, sucursal: { empresaId: a.empresaId } };
      const [ventas, previas, anuladas, abiertas, cerradas, productos, ingredientes] = await Promise.all([
        db.pedido.findMany({ where: { ...base, estado: { not: 'ANULADO' }, creadoEn: { gte: dia.inicio, lte: dia.fin } }, select: { total: true, descuento: true, creadoEn: true }, take: 50000 }),
        db.pedido.aggregate({ where: { ...base, estado: { not: 'ANULADO' }, creadoEn: { gte: antes.inicio, lte: antes.fin } }, _sum: { total: true }, _count: { _all: true } }),
        db.pedido.aggregate({ where: { ...base, estado: 'ANULADO', creadoEn: { gte: dia.inicio, lte: dia.fin } }, _sum: { total: true }, _count: { _all: true } }),
        db.caja.findMany({ where: { sucursalId, estado: 'ABIERTA' }, select: { id: true, abiertaEn: true, montoInicial: true, usuario: { select: { nombre: true } } } }),
        db.caja.findMany({ where: { sucursalId, estado: 'CERRADA', cerradaEn: { gte: dia.inicio, lte: dia.fin } }, select: { id: true, diferencia: true, cerradaEn: true, usuario: { select: { nombre: true } } } }),
        db.producto.findMany({ where: { empresaId: a.empresaId, activo: true, controlaStock: true }, select: { stockActual: true, stockMinimo: true }, take: 5000 }),
        db.ingrediente.findMany({ where: { empresaId: a.empresaId, activo: true }, select: { stock: true, stockMinimo: true }, take: 5000 }),
      ]);
      const total = dinero(ventas.reduce((s: number, v: any) => s + Number(v.total), 0));
      const porHora = Array.from({ length: 24 }, () => 0);
      for (const v of ventas) porHora[horaBogota(v.creadoEn)] += Number(v.total);
      const totalAnterior = dinero(previas._sum.total);
      const diferencias = cerradas.filter((c: any) => c.diferencia !== null && Math.abs(Number(c.diferencia)) > 1000);
      return {
        ventas: total,
        cantidad: ventas.length,
        ticketPromedio: ventas.length ? dinero(total / ventas.length) : 0,
        descuentos: dinero(ventas.reduce((s: number, v: any) => s + Number(v.descuento), 0)),
        semanaAnterior: { ventas: totalAnterior, cantidad: previas._count._all, variacion: variacion(total, totalAnterior) },
        anuladas: { cantidad: anuladas._count._all, monto: dinero(anuladas._sum.total) },
        porHora: porHora.map((x) => dinero(x)),
        cajasAbiertas: abiertas.map((c: any) => ({ id: c.id, cajero: c.usuario?.nombre || '', desde: c.abiertaEn, base: dinero(c.montoInicial) })),
        diferencias: diferencias.map((c: any) => ({ id: c.id, cajero: c.usuario?.nombre || '', diferencia: dinero(c.diferencia), cerradaEn: c.cerradaEn })),
        stockBajo: productos.filter((p: any) => p.stockActual <= p.stockMinimo).length + ingredientes.filter((i: any) => Number(i.stock) <= Number(i.stockMinimo)).length,
      };
    });
    const ok = filas.filter((f): f is Extract<typeof f, { ok: true }> => f.ok);
    const suma = (fn: (f: (typeof ok)[number]) => number) => dinero(ok.reduce((s, f) => s + fn(f), 0));
    const ventas = suma((f) => f.ventas), anterior = suma((f) => f.semanaAnterior.ventas), cantidad = ok.reduce((s, f) => s + f.cantidad, 0);
    const alertas = [
      ...ok.flatMap((f) => f.diferencias.map((d) => ({ tipo: 'DIFERENCIA_CAJA', sede: f.nombre, texto: `Caja de ${d.cajero} cerró con ${d.diferencia > 0 ? 'sobrante' : 'faltante'} de $${Math.abs(d.diferencia).toLocaleString('es-CO')}` }))),
      ...ok.filter((f) => f.anuladas.cantidad > 0).map((f) => ({ tipo: 'ANULACIONES', sede: f.nombre, texto: `${f.anuladas.cantidad} ventas anuladas por $${f.anuladas.monto.toLocaleString('es-CO')}` })),
      ...ok.filter((f) => f.stockBajo > 0).map((f) => ({ tipo: 'STOCK_BAJO', sede: f.nombre, texto: `${f.stockBajo} productos o insumos en el mínimo` })),
      ...filas.filter((f) => !f.ok).map((f) => ({ tipo: 'SEDE_SIN_DATOS', sede: f.nombre, texto: 'No se pudieron leer los datos de esta sede' })),
    ];
    return {
      fecha: dia.fecha,
      totales: { ventas, cantidad, ticketPromedio: cantidad ? dinero(ventas / cantidad) : 0, semanaAnterior: anterior, variacion: variacion(ventas, anterior), cajasAbiertas: ok.reduce((s, f) => s + f.cajasAbiertas.length, 0) },
      sedes: filas,
      alertas,
    };
  }

  // Control por usuario: ventas, descuentos, anulaciones, devoluciones, correcciones y diferencias de caja.
  async control(a: Actor, desde: unknown, hasta: unknown) {
    const { inicio, fin } = rango(desde, hasta);
    const sedes = await this.sedes(a);
    const personas = new Map<string, ControlUsuario>();
    const lecturas = await this.porSede(sedes, async ({ sucursalId, nombre, db }) => {
      const periodo = { gte: inicio, lte: fin };
      const [usuarios, ventas, anulaciones, devoluciones, eventos, cajas] = await Promise.all([
        db.usuario.findMany({ where: { empresaId: a.empresaId }, select: { id: true, nombre: true, email: true, rol: true } }),
        db.pedido.findMany({ where: { sucursalId, sucursal: { empresaId: a.empresaId }, estado: { not: 'ANULADO' }, creadoEn: periodo }, select: { usuarioId: true, total: true, descuento: true }, take: 100000 }),
        db.movimientoFinanciero.findMany({ where: { empresaId: a.empresaId, sucursalId, tipo: 'EGRESO', categoria: 'VENTA', descripcion: { startsWith: 'Anulación de venta' }, creadoEn: periodo }, select: { usuarioId: true, monto: true }, take: 20000 }),
        db.operacionVentaCaja.findMany({ where: { empresaId: a.empresaId, tipo: 'DEVOLUCION', creadoEn: periodo, caja: { sucursalId } }, select: { usuarioId: true, monto: true }, take: 20000 }),
        db.eventoCaja.findMany({ where: { tipo: { in: ['EDICION_PAGO', 'APERTURA_IRREGULAR'] }, creadoEn: periodo, caja: { sucursalId } }, select: { usuarioId: true, tipo: true }, take: 20000 }),
        db.caja.findMany({ where: { sucursalId, estado: 'CERRADA', cerradaEn: periodo }, select: { usuarioId: true, diferencia: true }, take: 5000 }),
      ]);
      const porId = new Map<number, any>(usuarios.map((u: any) => [u.id, u]));
      // Con aislamiento los ids cambian entre sedes; el correo identifica a la persona.
      const de = (id: number) => {
        const u = porId.get(id);
        const clave = u?.email ? String(u.email).toLowerCase() : `id:${id}`;
        let p = personas.get(clave);
        if (!p) personas.set(clave, (p = nuevoControl(clave, u?.nombre || `Usuario ${id}`, u?.rol || '')));
        if (!p.sedes.includes(nombre)) p.sedes.push(nombre);
        return p;
      };
      for (const v of ventas) { const p = de(v.usuarioId); p.ventas++; p.totalVendido += Number(v.total); p.descuentos += Number(v.descuento); }
      for (const m of anulaciones) { const p = de(m.usuarioId); p.anulaciones++; p.montoAnulado += Number(m.monto); }
      for (const d of devoluciones) { const p = de(d.usuarioId); p.devoluciones++; p.montoDevuelto += Number(d.monto); }
      for (const e of eventos) { const p = de(e.usuarioId); if (e.tipo === 'EDICION_PAGO') p.correccionesPago++; else p.aperturasIrregulares++; }
      for (const c of cajas) if (c.diferencia !== null && Math.abs(Number(c.diferencia)) > 1000) { const p = de(c.usuarioId); p.diferenciasCaja++; p.faltanteCaja += Number(c.diferencia); }
      return {};
    });
    const lista = [...personas.values()].map((p) => {
      const r = { ...p, totalVendido: dinero(p.totalVendido), descuentos: dinero(p.descuentos), montoAnulado: dinero(p.montoAnulado), montoDevuelto: dinero(p.montoDevuelto), faltanteCaja: dinero(p.faltanteCaja) };
      return { ...r, alertas: alertasControl(r) };
    });
    lista.sort((x, y) => y.alertas.length - x.alertas.length || y.totalVendido - x.totalVendido);
    return { personas: lista, sedesSinDatos: lecturas.filter((l) => !l.ok).map((l) => l.nombre) };
  }
}
