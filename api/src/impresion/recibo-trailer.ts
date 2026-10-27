/** Recibo del Trailer: rollo de 80 mm, 48 columnas con la fuente normal. */
export function reciboTrailer(pedido: any, empresa: any, logo: Buffer = Buffer.alloc(0), mensajeCristiano?: string): Buffer {
  const partes: Array<string | Buffer> = [];
  const ancho = 48;
  const texto = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();
  const dinero = (v: unknown) => '$' + Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  const envolver = (v: unknown, prefijo = '') => {
    let resto = texto(v); const resultado: string[] = [];
    while (resto) {
      const espacio = ancho - prefijo.length;
      let corte = resto.length > espacio ? resto.lastIndexOf(' ', espacio) : resto.length;
      if (corte <= 0) corte = espacio;
      resultado.push(prefijo + resto.slice(0, corte)); resto = resto.slice(corte).trimStart();
    }
    return resultado.length ? resultado : [prefijo];
  };
  const linea = (v: string) => partes.push(v + '\n');
  const centro = (v: unknown) => envolver(v).forEach(s => linea(' '.repeat(Math.max(0, Math.floor((ancho - s.length) / 2))) + s));
  const monto = (etiqueta: string, valor: unknown) => { const derecha = dinero(valor); linea(etiqueta + ' '.repeat(Math.max(1, ancho - etiqueta.length - derecha.length)) + derecha); };
  const negrita = (activa: boolean) => partes.push(Buffer.from([0x1b, 0x45, activa ? 1 : 0]));
  const alto = (activo: boolean) => partes.push(Buffer.from([0x1d, 0x21, activo ? 1 : 0]));
  if (logo.length) partes.push(logo, '\n');
  alto(true); negrita(true); centro(texto(empresa?.nombre || 'EL TRAILER DEL SABOR').toUpperCase()); negrita(false); alto(false);
  centro('HECHO AL MOMENTO, CON SABOR');
  if (empresa?.nit) centro('NIT ' + texto(empresa.nit));
  if (empresa?.direccion) envolver(empresa.direccion).forEach(linea);
  if (empresa?.telefono) centro('Tel. ' + texto(empresa.telefono));
  linea('='.repeat(ancho));
  centro('COMPROBANTE DE VENTA');
  negrita(true); centro('PEDIDO'); centro(pedido.numero); negrita(false);
  const fecha = new Date(pedido.creadoEn || Date.now());
  envolver(fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' })).forEach(linea);
  if (pedido.usuario?.nombre) envolver('Atendio: ' + pedido.usuario.nombre).forEach(linea);
  if (pedido.cliente?.nombre) envolver('Cliente: ' + pedido.cliente.nombre).forEach(linea);
  linea('-'.repeat(ancho));
  linea('CANT. / PRODUCTO'.padEnd(ancho - 'IMPORTE'.length) + 'IMPORTE');
  linea('-'.repeat(ancho));
  for (const d of pedido.detalles || []) {
    const cantidad = Number(d.cantidad || 1);
    negrita(true); envolver(cantidad + ' x ' + (d.producto?.nombre || 'Producto') + (d.presentacionNombre ? ' (' + d.presentacionNombre + ')' : '')).forEach(linea); negrita(false);
    const importe = Number(d.subtotal ?? (Number(d.precioUnitario ?? d.precio ?? 0) * cantidad));
    for (const a of d.adicionales || []) {
      const unidades = Number(a.cantidad || 1);
      envolver('+ ' + unidades + ' x ' + a.nombre, '  ').forEach(linea);
      if (a.precio !== undefined) monto('  Extra incluido', Number(a.precio) * unidades * cantidad);
    }
    if (d.exclusiones?.length) envolver('Sin: ' + d.exclusiones.join(', '), '  ').forEach(linea);
    if (d.observacion) envolver(d.observacion, '  ').forEach(linea);
    monto('Importe producto', importe); linea('');
  }
  linea('-'.repeat(ancho));
  if (Number(pedido.descuento) > 0) { monto('Subtotal', pedido.subtotal); monto('Descuento', -Number(pedido.descuento)); }
  alto(true); negrita(true); monto('TOTAL A PAGAR', pedido.total); negrita(false); alto(false);
  linea('-'.repeat(ancho));
  if (pedido.metodoPago === 'CREDITO') {
    linea('A CREDITO - PENDIENTE DE COBRO');
    for (const abono of pedido.abonosCredito || []) monto('Abono ' + texto(abono.metodoPago), abono.monto);
    if (pedido.cuentaCredito) monto('SALDO PENDIENTE', pedido.cuentaCredito.saldo);
  }
  else {
    const pagos = Array.isArray(pedido.pagos) ? pedido.pagos : [];
    if (pagos.length) for (const p of pagos) monto(texto(p.metodoPago), p.monto);
    else if (pedido.metodoPago) linea('Pago: ' + texto(pedido.metodoPago));
    const efectivo = pagos.length ? pagos.filter((p: any) => p.metodoPago === 'EFECTIVO').reduce((s: number, p: any) => s + Number(p.monto), 0) : pedido.metodoPago === 'EFECTIVO' ? Number(pedido.total) : 0;
    if (efectivo > 0) { monto('Efectivo recibido', efectivo + Number(pedido.cambio || 0)); monto('Cambio', pedido.cambio || 0); }
  }
  if (pedido.observacion) { linea('-'.repeat(ancho)); envolver('Nota: ' + pedido.observacion).forEach(linea); }
  linea('='.repeat(ancho));
  negrita(true); centro('GRACIAS POR ELEGIRNOS'); negrita(false);
  centro('Te esperamos de nuevo');
  if (mensajeCristiano) { linea(''); centro(mensajeCristiano); }
  linea('');
  return Buffer.concat(partes.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p, 'ascii')));
}
