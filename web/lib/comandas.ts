const normalizar = (valor: unknown) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Completa la categoría con el catálogo: la respuesta de crear pedido no la incluye. */
export function prepararComandas(pedido: any, empresaId: number | undefined, catalogo: any[] = [], asignaciones: Record<string, string> = {}) {
  const grupos = new Map<string, any[]>();
  for (const original of pedido?.detalles || []) {
    const ficha = catalogo.find(p => p.id === (original.productoId ?? original.producto?.id));
    const producto = { ...ficha, ...original.producto, categoria: original.producto?.categoria || ficha?.categoria };
    const detalle = { ...original, producto };
    const categoria = normalizar(producto.categoria?.nombre);
    const nombre = normalizar(producto.nombre);
    let lado: string;
    const asignada = empresaId === 1 ? asignaciones[producto.id ?? original.productoId] : undefined;
    if (asignada === 'SIN_COMANDA') continue;
    if (asignada === 'PLANCHA' || asignada === 'VAPORERA') lado = asignada;
    else if (empresaId === 1) {
      // La familia del catálogo manda; los nombres resuelven categorías genéricas (Lado 1/2).
      const clasificar = (texto: string) => /hamburg|chuzo|arepa\s*(burg|hamb)|quesadill/.test(texto) ? 'PLANCHA'
        : /perro|choriz|suiz|salchipap|batata/.test(texto) ? 'VAPORERA' : null;
      const destino = clasificar(categoria) || clasificar(nombre);
      if (destino) lado = destino;
      else {
        if (/bebida|gaseosa|refresco/.test(categoria) || /^(gaseosa|coca.?cola|pepsi|postobon|agua\b)/.test(nombre)) continue;
        if (producto.aceptaAdicionales === false) continue;
        lado = /lado\s*2/.test(categoria) ? 'VAPORERA' : 'PLANCHA';
      }
    } else {
      if (!categoria.includes('bebida') && producto.aceptaAdicionales === false) continue;
      lado = /lado\s*2/.test(categoria) ? 'LADO 2' : 'LADO 1';
    }
    grupos.set(lado, [...(grupos.get(lado) || []), detalle]);
  }
  return [...grupos].sort(([a], [b]) => a === 'PLANCHA' ? -1 : b === 'PLANCHA' ? 1 : 0)
    .map(([ladoNombre, detalles]) => ({ ...pedido, ladoNombre, detalles }));
}

const escapar = (valor: unknown) => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));

/** Un único trabajo de navegador, con corte de página entre estaciones. */
export function documentoComandas(comandas: any[], empresa: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comandas de preparación</title><style>
    @page { size:80mm auto; margin:4mm; } * {box-sizing:border-box} body {margin:0;font:15px Arial,sans-serif;color:#000;background:white}
    section {max-width:72mm;margin:auto;break-after:page;page-break-after:always} section:last-child {break-after:auto;page-break-after:auto}
    h1 {font-size:24px;text-align:center;margin:8px 0} h2 {font-size:18px;text-align:center;margin:6px 0} p {margin:6px 0}
    article {border-top:1px dashed #000;padding:10px 0;break-inside:avoid} strong {font-size:18px} .nota {font-weight:bold} .pie {border-top:2px dashed #000;padding-top:8px}
    </style></head><body>${comandas.map(c => `<section><h2>${escapar(empresa)}</h2><h1>${escapar(c.ladoNombre)}</h1><h2>Pedido ${escapar(c.numero)}</h2>
      <p>${escapar(new Date(c.creadoEn || Date.now()).toLocaleString('es-CO', {timeZone:'America/Bogota'}))}</p>
      ${c.cliente ? `<p>Cliente: ${escapar(c.cliente.nombre)}</p>` : ''}
      ${c.detalles.map((d: any) => `<article><strong>${escapar(d.cantidad)} × ${escapar(d.producto?.nombre)}</strong>
        ${d.tipoConsumo ? `<p class="nota">${d.tipoConsumo === 'PARA_LLEVAR' ? 'PARA LLEVAR' : 'PARA COMER AQUÍ'}</p>` : ''}
        ${d.exclusiones?.length ? `<p class="nota">SIN: ${escapar(d.exclusiones.join(', '))}</p>` : ''}
        ${d.adicionales?.length ? `<p>ADICIONALES: ${escapar(d.adicionales.map((a: any) => `${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ''}`).join(', '))}</p>` : ''}
        ${d.observacion ? `<p class="nota">NOTA: ${escapar(d.observacion)}</p>` : ''}</article>`).join('')}
      ${c.observacion ? `<p class="nota">NOTA GENERAL: ${escapar(c.observacion)}</p>` : ''}<p class="pie">Comanda de preparación · ${escapar(c.ladoNombre)}</p></section>`).join('')}</body></html>`;
}
