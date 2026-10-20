export function esBebidaTrailer(producto: any, categorias: any[] = []) {
  const normalizar = (v: unknown) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const padre = producto?.categoria?.categoriaPadre || categorias.find(c => c.id === producto?.categoria?.parentId);
  const categoria = normalizar([producto?.categoria?.nombre, padre?.nombre].join(' '));
  return /bebida|gaseosa|refresco|cerveza|jugo|malteada|limonada|batido/.test(categoria)
    || /^(agua\b|gaseosa\b|coca.?cola\b|pepsi\b|postobon\b|jugo\b|cerveza\b|limonada\b|malteada\b|cafe\b|te\b|soda\b)/.test(normalizar(producto?.nombre));
}

export function adicionalesParaTrailer(producto: any, catalogo: any[], categorias: any[] = []) {
  if (!producto) return [];
  const listos = (a: any) => a.activo !== false && a.disponible !== false
    && (!a.ingredienteId || (a.ingrediente?.activo !== false && Number(a.cantidad) > 0));
  const empaques = (producto.adicionales || []).map((p: any) => p.adicional).filter((a: any) => a.empaqueParaLlevar && a.activo !== false);
  return [...(esBebidaTrailer(producto, categorias) ? [] : catalogo.filter(a => !a.empaqueParaLlevar && listos(a))), ...empaques];
}
