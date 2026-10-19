/** El catálogo global es exclusivo del Trailer. Los empaques conservan su asociación. */
export function esBebida(producto: any): boolean {
  const normalizar = (v: unknown) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const categoria = normalizar([producto?.categoria?.nombre, producto?.categoria?.categoriaPadre?.nombre].join(' '));
  return /bebida|gaseosa|refresco|cerveza|jugo|malteada|limonada|batido/.test(categoria)
    || /^(agua\b|gaseosa\b|coca.?cola\b|pepsi\b|postobon\b|jugo\b|cerveza\b|limonada\b|malteada\b|cafe\b|te\b|soda\b)/.test(normalizar(producto?.nombre));
}

export function adicionalListo(adicional: any): boolean {
  return adicional.activo !== false && adicional.disponible !== false
    && (!adicional.ingredienteId || (adicional.ingrediente?.activo !== false && Number(adicional.cantidad) > 0));
}
