/** Null means a cost is missing; zero is a legitimate explicitly configured cost. */
export function costoHistoricoItem(item: any): number | null {
  const valor = (n: unknown): number | null => n === null || n === undefined || !Number.isFinite(Number(n)) || Number(n) < 0 ? null : Number(n);
  const producto = item.producto;
  let costo = 0;
  if (producto.esCombo) {
    if (!item.componentes?.length) return null;
    for (const c of item.componentes) {
      const unitario = valor(c.producto.costo);
      if (unitario === null) return null;
      costo += unitario * c.cantidad;
    }
  } else if (producto.ingredientes?.length) {
    for (const pi of producto.ingredientes) {
      if ((item.exclusiones || []).includes(pi.ingrediente.nombre)) continue;
      const unitario = valor(pi.ingrediente.costoUnitario);
      if (unitario === null) return null;
      costo += unitario * Number(pi.cantidad);
    }
  } else {
    const unitario = valor(producto.costo);
    if (unitario === null) return null;
    costo = unitario * (item.factorUnidades ?? 1);
  }
  for (const extra of item.adicionales || []) {
    // An extra without a linked ingredient has no recorded production cost.
    const ad = extra.adicional;
    if (!ad.ingredienteId || ad.cantidad === null || ad.cantidad === undefined) return null;
    const unitario = valor(ad.ingrediente?.costoUnitario);
    if (unitario === null) return null;
    costo += unitario * Number(ad.cantidad) * extra.cantidad;
  }
  const total = costo * item.cantidad;
  return Number.isFinite(total) && total <= 9999999999 ? Math.round(total * 10000) / 10000 : null;
}
