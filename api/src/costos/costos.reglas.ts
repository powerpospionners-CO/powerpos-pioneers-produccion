import { BadRequestException } from '@nestjs/common';

export type TipoItem = 'PRODUCTO' | 'INGREDIENTE';
export type Consumo = { tipo: TipoItem; id: number; cantidad: number };
export type EventoKardex = { fecha: Date; concepto: string; referencia: string; entrada: number; salida: number; usuario?: string };
export type FilaKardex = EventoKardex & { saldo: number };

const DIA = 86400000;
const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// Fechas de calendario de Bogotá; el periodo es de máximo 92 días.
export function periodo(desde: unknown, hasta: unknown, maxDias = 92) {
  const leer = (v: unknown, fin: boolean) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException('Fechas no válidas');
    return new Date(`${v}T${fin ? '23:59:59.999' : '00:00:00.000'}-05:00`);
  };
  const inicio = leer(desde, false), fin = leer(hasta, true);
  if (fin < inicio || fin.getTime() - inicio.getTime() > maxDias * DIA) throw new BadRequestException(`El periodo debe ser de máximo ${maxDias} días`);
  return { inicio, fin };
}

// consumoInventario de una venta: [{ tipo, id, cantidad }] en unidades base.
export function leerConsumos(valor: unknown): Consumo[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((c: any) => (c?.tipo === 'PRODUCTO' || c?.tipo === 'INGREDIENTE') && Number.isSafeInteger(c?.id) && Number.isFinite(Number(c?.cantidad)))
    .map((c: any) => ({ tipo: c.tipo, id: c.id, cantidad: Number(c.cantidad) }));
}

// Reconstruye el saldo hacia atrás desde el stock actual: el último saldo es lo que hay hoy.
export function armarKardex(eventos: EventoKardex[], stockActual: number, desde: Date, hasta: Date) {
  const ordenados = [...eventos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const filas: FilaKardex[] = [];
  let saldo = stockActual;
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const e = ordenados[i];
    filas.unshift({ ...e, saldo: redondear(saldo) });
    saldo -= e.entrada - e.salida;
  }
  const enPeriodo = filas.filter((f) => f.fecha >= desde && f.fecha <= hasta);
  const antes = (f: FilaKardex) => redondear(f.saldo - f.entrada + f.salida);
  // Sin movimientos en el periodo, el saldo es el anterior al primer movimiento posterior (o el actual).
  const posterior = filas.find((f) => f.fecha > hasta);
  const saldoInicial = enPeriodo.length ? antes(enPeriodo[0]) : posterior ? antes(posterior) : redondear(stockActual);
  return {
    saldoInicial,
    entradas: redondear(enPeriodo.reduce((s, f) => s + f.entrada, 0)),
    salidas: redondear(enPeriodo.reduce((s, f) => s + f.salida, 0)),
    saldoFinal: enPeriodo.length ? enPeriodo[enPeriodo.length - 1].saldo : saldoInicial,
    filas: enPeriodo,
  };
}

// Costo de una unidad del plato según su receta; sin receta, el costo cargado en el producto.
export function costoReceta(p: { costo?: unknown; ingredientes?: { cantidad: unknown; ingrediente?: { costoUnitario?: unknown; nombre?: string } | null }[] }) {
  if (p.ingredientes?.length) {
    const partes = p.ingredientes.map((pi) => ({ nombre: pi.ingrediente?.nombre || 'Insumo', costo: Number(pi.cantidad) * Number(pi.ingrediente?.costoUnitario ?? 0), sinCosto: pi.ingrediente?.costoUnitario == null }));
    return { costo: redondear(partes.reduce((s, x) => s + x.costo, 0), 2), partes, incompleto: partes.some((x) => x.sinCosto) };
  }
  const costo = p.costo == null ? null : Number(p.costo);
  return { costo, partes: [], incompleto: costo === null };
}

export function margen(precio: number, costo: number | null) {
  if (costo === null || !(precio > 0)) return null;
  return Math.round(((precio - costo) / precio) * 1000) / 10;
}

// Compra sugerida para cubrir `cobertura` días de consumo promedio más el mínimo.
export function sugerirCompra(stock: number, minimo: number, consumoPeriodo: number, dias: number, cobertura: number) {
  const diario = dias > 0 ? consumoPeriodo / dias : 0;
  const objetivo = diario * cobertura + minimo;
  return {
    consumoDiario: redondear(diario),
    diasCobertura: diario > 0 ? Math.floor(Math.max(0, stock) / diario) : null,
    sugerido: redondear(Math.max(0, objetivo - stock)),
  };
}
