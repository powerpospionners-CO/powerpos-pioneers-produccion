export type Linea = { id: string; productoId: number; nombre: string; cantidad: number; precioUnitario: number; observacion: string; ronda: number | null; pagada: number | null; anulada?: unknown };
export type Ronda = { n: number; estado: 'PENDIENTE' | 'EN_PREPARACION' | 'LISTA' | 'SERVIDA'; enviadaEn: string };
export type ResumenCuenta = { mesa: number; personas: number; meseroNombre: string; total: number; cobrado: number; sinEnviar: number; listas: number };
export type Cuenta = ResumenCuenta & { id: string; estado: string; version: number; lineas: Linea[]; rondas: Ronda[] };
export type Mesa = { numero: number; nombre: string; zona: string; capacidad: number; cuenta: (ResumenCuenta & { id: string }) | null };

export function agruparPorZona(mesas: Mesa[]): [string, Mesa[]][] {
  const zonas = new Map<string, Mesa[]>();
  for (const m of mesas) zonas.set(m.zona, [...(zonas.get(m.zona) || []), m]);
  return [...zonas];
}

// Libre gris, ocupada naranja, con comida lista verde.
export function colorMesa(m: Mesa) {
  if (!m.cuenta) return 'border-gray-700 bg-gray-900 text-gray-200';
  if (m.cuenta.listas > 0) return 'border-green-500 bg-green-900/40 text-white';
  return 'border-orange-500 bg-orange-900/30 text-white';
}

// Valor por persona redondeado hacia arriba al peso; la última paga lo que falte.
export function porPersona(total: number, personas: number) {
  return personas > 0 ? Math.ceil(total / personas) : total;
}
