type ProductoCatalogo = {
  nombre: string;
  codigoBarras?: string | null;
  disponible: boolean;
  stockActual?: number;
  ventaGranel?: boolean;
  unidadGranel?: string | null;
};

export function buscarProductosDistribuidor<T extends ProductoCatalogo>(productos: T[], busqueda: string): T[] {
  const q = busqueda.trim().toLocaleLowerCase('es-CO');
  if (!q) return [];
  return productos.filter(p => p.disponible && tieneExistenciasDistribuidor(p) && (
    p.nombre.toLocaleLowerCase('es-CO').includes(q) || (p.codigoBarras || '').includes(q)
  )).slice(0, 15);
}

export function tieneExistenciasDistribuidor(producto: { stockActual?: number }, factorUnidades = 1): boolean {
  const stock = Number(producto.stockActual);
  return Number.isFinite(stock) && Number.isFinite(factorUnidades) && factorUnidades > 0 && stock >= factorUnidades;
}

// Precio y existencias del catálogo siempre vienen en gramos o mililitros,
// incluso si el administrador carga el producto en kilogramos o litros.
export function unidadVentaDistribuidor(producto?: Pick<ProductoCatalogo, 'ventaGranel' | 'unidadGranel'>, presentacionId?: number | null): 'g' | 'ml' | null {
  if (!producto?.ventaGranel || presentacionId != null) return null;
  return ['ml', 'l'].includes(producto.unidadGranel || '') ? 'ml' : 'g';
}
