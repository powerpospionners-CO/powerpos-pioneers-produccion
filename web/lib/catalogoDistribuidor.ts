type ProductoCatalogo = {
  nombre: string;
  codigoBarras?: string | null;
  disponible: boolean;
  ventaGranel?: boolean;
  unidadGranel?: string | null;
};

export function buscarProductosDistribuidor<T extends ProductoCatalogo>(productos: T[], busqueda: string): T[] {
  const q = busqueda.trim().toLocaleLowerCase('es-CO');
  if (!q) return [];
  return productos.filter(p => p.disponible && (
    p.nombre.toLocaleLowerCase('es-CO').includes(q) || (p.codigoBarras || '').includes(q)
  )).slice(0, 15);
}

// Precio y existencias del catálogo siempre vienen en gramos o mililitros,
// incluso si el administrador carga el producto en kilogramos o litros.
export function unidadVentaDistribuidor(producto?: Pick<ProductoCatalogo, 'ventaGranel' | 'unidadGranel'>, presentacionId?: number | null): 'g' | 'ml' | null {
  if (!producto?.ventaGranel || presentacionId != null) return null;
  return ['ml', 'l'].includes(producto.unidadGranel || '') ? 'ml' : 'g';
}
