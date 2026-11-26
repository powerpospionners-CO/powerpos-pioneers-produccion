// Opciones de una línea del carrito: presentación, adicionales y nota del cliente.
export type OpcionesLinea = {
  presentacionId?: number;
  adicionales: { adicionalId: number; cantidad: number }[];
  observacion?: string;
};
type ProductoConOpciones = {
  id: number;
  precio: string | number;
  presentaciones?: { id: number; nombre: string; precio: number }[];
  adicionales?: { id: number; nombre: string; precio: number }[];
};

export const sinOpciones = (): OpcionesLinea => ({ adicionales: [] });

export const tieneOpciones = (p?: ProductoConOpciones) =>
  !!(p?.presentaciones?.length || p?.adicionales?.length);

export function normalizarOpciones(o: OpcionesLinea): OpcionesLinea {
  return {
    ...(o.presentacionId ? { presentacionId: o.presentacionId } : {}),
    adicionales: o.adicionales
      .filter((a) => a.cantidad > 0)
      .sort((a, b) => a.adicionalId - b.adicionalId),
    ...(o.observacion?.trim() ? { observacion: o.observacion.trim().slice(0, 140) } : {}),
  };
}

// Mismo producto con las mismas opciones = misma línea; con otras opciones, línea aparte.
export const claveLinea = (productoId: number, o: OpcionesLinea) =>
  `${productoId}|${JSON.stringify(normalizarOpciones(o))}`;

// Precio por unidad con el catálogo vigente; null si una opción ya no existe.
export function precioLinea(p: ProductoConOpciones | undefined, o: OpcionesLinea) {
  if (!p) return null;
  const presentacion = o.presentacionId
    ? p.presentaciones?.find((x) => x.id === o.presentacionId)
    : null;
  if (o.presentacionId && !presentacion) return null;
  let total = presentacion ? presentacion.precio : Number(p.precio);
  for (const a of o.adicionales) {
    const ad = p.adicionales?.find((x) => x.id === a.adicionalId);
    if (!ad) return null;
    total += ad.precio * a.cantidad;
  }
  return Math.round(total * 100) / 100;
}

export function etiquetaOpciones(p: ProductoConOpciones | undefined, o: OpcionesLinea) {
  const partes: string[] = [];
  const presentacion = o.presentacionId ? p?.presentaciones?.find((x) => x.id === o.presentacionId) : null;
  if (presentacion) partes.push(presentacion.nombre);
  for (const a of o.adicionales) {
    const ad = p?.adicionales?.find((x) => x.id === a.adicionalId);
    if (ad) partes.push(`+ ${ad.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ""}`);
  }
  if (o.observacion) partes.push(`Nota: ${o.observacion}`);
  return partes.join(" · ");
}
