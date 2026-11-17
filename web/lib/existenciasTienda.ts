export function existenciasTienda(stock: unknown): number {
  const cantidad = Number(stock);
  return Number.isFinite(cantidad) ? Math.max(0, Math.floor(cantidad)) : 0;
}
export function puedePedirProducto(stock: unknown, cantidad: number, disponible: boolean): boolean {
  return disponible && Number.isSafeInteger(cantidad) && cantidad > 0 && cantidad <= existenciasTienda(stock);
}
