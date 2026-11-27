import { BadRequestException } from '@nestjs/common';

// Tarifas de IVA en Colombia. Exento y excluido no generan IVA, pero se reportan por separado.
export type Tarifa = 'IVA19' | 'IVA5' | 'EXENTO' | 'EXCLUIDO';
export const TARIFAS: Tarifa[] = ['IVA19', 'IVA5', 'EXENTO', 'EXCLUIDO'];
export const PORCENTAJE: Record<Tarifa, number> = { IVA19: 19, IVA5: 5, EXENTO: 0, EXCLUIDO: 0 };
export const NOMBRE_TARIFA: Record<Tarifa, string> = { IVA19: 'IVA 19 %', IVA5: 'IVA 5 %', EXENTO: 'Exento', EXCLUIDO: 'Excluido' };

export type ConfigIva = {
  responsable: boolean;
  // El costo cargado en los productos y en las compras incluye el IVA (descontable).
  costoIncluyeIva: boolean;
  // Tarifa de los productos sin tarifa confirmada.
  porDefecto: Tarifa;
  productos: Record<string, Tarifa>;
};

// El Trailer (empresa 1) no es responsable de IVA; las demás sí, salvo que se configure otra cosa.
export function configInicial(empresaId: number): ConfigIva {
  return { responsable: empresaId !== 1, costoIncluyeIva: true, porDefecto: 'IVA19', productos: {} };
}

export function normalizarConfig(valor: unknown, empresaId: number): ConfigIva {
  const base = configInicial(empresaId);
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const productos: Record<string, Tarifa> = {};
  if (v.productos && typeof v.productos === 'object')
    for (const [id, t] of Object.entries(v.productos as Record<string, unknown>)) if (/^\d+$/.test(id) && TARIFAS.includes(t as Tarifa)) productos[id] = t as Tarifa;
  return {
    responsable: typeof v.responsable === 'boolean' ? v.responsable : base.responsable,
    costoIncluyeIva: typeof v.costoIncluyeIva === 'boolean' ? v.costoIncluyeIva : base.costoIncluyeIva,
    porDefecto: TARIFAS.includes(v.porDefecto as Tarifa) ? (v.porDefecto as Tarifa) : base.porDefecto,
    productos,
  };
}

export function validarCambios(body: unknown) {
  const v = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const cambios: Partial<Omit<ConfigIva, 'productos'>> & { productos?: Record<string, Tarifa | null> } = {};
  if (v.responsable !== undefined) { if (typeof v.responsable !== 'boolean') throw new BadRequestException('Indica si la empresa es responsable de IVA'); cambios.responsable = v.responsable; }
  if (v.costoIncluyeIva !== undefined) { if (typeof v.costoIncluyeIva !== 'boolean') throw new BadRequestException('Indica si el costo incluye IVA'); cambios.costoIncluyeIva = v.costoIncluyeIva; }
  if (v.porDefecto !== undefined) { if (!TARIFAS.includes(v.porDefecto as Tarifa)) throw new BadRequestException('Tarifa no válida'); cambios.porDefecto = v.porDefecto as Tarifa; }
  if (v.productos !== undefined) {
    if (!v.productos || typeof v.productos !== 'object' || Array.isArray(v.productos)) throw new BadRequestException('Tarifas no válidas');
    const entradas = Object.entries(v.productos as Record<string, unknown>);
    if (entradas.length > 5000) throw new BadRequestException('Demasiados productos en un solo cambio');
    cambios.productos = {};
    for (const [id, t] of entradas) {
      if (!/^\d{1,9}$/.test(id) || (t !== null && !TARIFAS.includes(t as Tarifa))) throw new BadRequestException('Tarifa no válida');
      cambios.productos[id] = t as Tarifa | null;
    }
  }
  return cambios;
}

export function aplicarCambios(config: ConfigIva, cambios: ReturnType<typeof validarCambios>): ConfigIva {
  const productos = { ...config.productos };
  for (const [id, t] of Object.entries(cambios.productos || {})) if (t === null) delete productos[id]; else productos[id] = t;
  return { ...config, ...cambios, productos };
}

export function tarifaDe(config: ConfigIva, productoId: number): { tarifa: Tarifa; confirmada: boolean } {
  const t = config.productos[String(productoId)];
  return t ? { tarifa: t, confirmada: true } : { tarifa: config.porDefecto, confirmada: false };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Separa base e IVA de un valor con IVA incluido. base + iva = valor exacto.
export function desglosar(valorConIva: number, tarifa: Tarifa) {
  const p = PORCENTAJE[tarifa];
  const base = r2(valorConIva / (1 + p / 100));
  return { base, iva: r2(valorConIva - base) };
}

export type Desglose = Record<Tarifa, { base: number; iva: number }>;
export const desgloseVacio = (): Desglose => ({ IVA19: { base: 0, iva: 0 }, IVA5: { base: 0, iva: 0 }, EXENTO: { base: 0, iva: 0 }, EXCLUIDO: { base: 0, iva: 0 } });

// Reparte el total cobrado de una venta (con descuentos y domicilio) entre las tarifas de sus líneas.
export function desglosarVenta(lineas: { productoId: number; subtotal: number }[], total: number, config: ConfigIva): Desglose {
  const d = desgloseVacio();
  if (!config.responsable) { d.EXCLUIDO.base = r2(total); return d; }
  const bruto = lineas.reduce((s, l) => s + l.subtotal, 0);
  const porTarifa = new Map<Tarifa, number>();
  for (const l of lineas) {
    const t = tarifaDe(config, l.productoId).tarifa;
    porTarifa.set(t, (porTarifa.get(t) || 0) + (bruto > 0 ? (l.subtotal / bruto) * total : 0));
  }
  if (!lineas.length || bruto <= 0) porTarifa.set(config.porDefecto, total);
  // Ajuste de centavos para que la suma sea exactamente el total.
  let acumulado = 0;
  const entradas = [...porTarifa];
  entradas.forEach(([t, v], i) => {
    const valor = i === entradas.length - 1 ? r2(total - acumulado) : r2(v);
    acumulado += valor;
    const x = desglosar(valor, t);
    d[t] = { base: r2(d[t].base + x.base), iva: r2(d[t].iva + x.iva) };
  });
  return d;
}

export function sumarDesgloses(a: Desglose, b: Desglose, signo = 1): Desglose {
  const d = desgloseVacio();
  for (const t of TARIFAS) d[t] = { base: r2(a[t].base + signo * b[t].base), iva: r2(a[t].iva + signo * b[t].iva) };
  return d;
}

// Escala un desglose a otro total (p. ej. una devolución parcial de la venta).
export function escalar(d: Desglose, factor: number): Desglose {
  const x = desgloseVacio();
  for (const t of TARIFAS) x[t] = { base: r2(d[t].base * factor), iva: r2(d[t].iva * factor) };
  return x;
}
