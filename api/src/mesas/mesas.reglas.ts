import { BadRequestException } from '@nestjs/common';

export type MesaPlano = { numero: number; nombre: string; zona: string; capacidad: number };
export type EstadoRonda = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTA' | 'SERVIDA';
export const ESTADOS_RONDA: EstadoRonda[] = ['PENDIENTE', 'EN_PREPARACION', 'LISTA', 'SERVIDA'];
export type Linea = {
  id: string;
  productoId: number;
  nombre: string;
  categoria: string;
  cantidad: number;
  precioUnitario: number;
  observacion: string;
  ronda: number | null;
  pagada: number | null;
  anulada?: { por: number; motivo: string; en: string } | null;
};
export type Ronda = { n: number; enviadaEn: string; enviadaPor: string; estado: EstadoRonda };
export type DatosCuenta = {
  mesa: number;
  personas: number;
  meseroId: number;
  meseroNombre: string;
  abiertaEn: string;
  lineas: Linea[];
  rondas: Ronda[];
  cobros: { pedidoId: number; numero: string; total: number; lineas: string[]; en: string; clave?: string }[];
  historial: { accion: string; por: string; en: string; detalle?: string }[];
};

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// El plano es una lista de mesas agrupadas por zona; el número identifica la mesa.
export function validarPlano(body: unknown): MesaPlano[] {
  const lista = (body as { mesas?: unknown })?.mesas;
  if (!Array.isArray(lista) || lista.length > 200) throw new BadRequestException('Indica hasta 200 mesas');
  const vistos = new Set<number>();
  return lista.map((m: any) => {
    const numero = Number(m?.numero);
    if (!Number.isSafeInteger(numero) || numero < 1 || numero > 9999) throw new BadRequestException('Cada mesa necesita un número entre 1 y 9999');
    if (vistos.has(numero)) throw new BadRequestException(`La mesa ${numero} está repetida`);
    vistos.add(numero);
    const capacidad = Number(m?.capacidad ?? 4);
    if (!Number.isSafeInteger(capacidad) || capacidad < 1 || capacidad > 50) throw new BadRequestException(`Capacidad no válida en la mesa ${numero}`);
    return { numero, nombre: texto(m?.nombre, 40) || `Mesa ${numero}`, zona: texto(m?.zona, 40) || 'Salón', capacidad };
  });
}

export function leerPlano(datos: unknown): MesaPlano[] {
  try {
    return validarPlano(datos);
  } catch {
    return [];
  }
}

export function validarItems(items: unknown) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new BadRequestException('Agrega entre 1 y 50 productos');
  return items.map((i: any) => {
    const productoId = Number(i?.productoId), cantidad = Number(i?.cantidad);
    if (!Number.isSafeInteger(productoId) || productoId < 1 || !Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 99)
      throw new BadRequestException('Producto o cantidad no válidos');
    return { productoId, cantidad, observacion: texto(i?.observacion, 200) };
  });
}

export const lineaActiva = (l: Linea) => !l.anulada;
export const lineaPendiente = (l: Linea) => !l.anulada && l.pagada === null;
export const totalLineas = (lineas: Linea[]) => Math.round(lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0) * 100) / 100;

export function resumenCuenta(d: DatosCuenta) {
  const pendientes = d.lineas.filter(lineaPendiente);
  return {
    mesa: d.mesa,
    personas: d.personas,
    meseroNombre: d.meseroNombre,
    abiertaEn: d.abiertaEn,
    total: totalLineas(pendientes),
    cobrado: Math.round(d.cobros.reduce((s, c) => s + c.total, 0) * 100) / 100,
    sinEnviar: d.lineas.filter((l) => lineaActiva(l) && l.ronda === null).length,
    listas: d.rondas.filter((r) => r.estado === 'LISTA').length,
  };
}
