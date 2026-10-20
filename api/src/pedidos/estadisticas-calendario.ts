const ZONA = 'America/Bogota';
const formatoFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });

export function fechaBogota(fecha: Date | string): string {
  const partes = Object.fromEntries(formatoFecha.formatToParts(new Date(fecha)).map(p => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** Calendario colombiano; las fechas originales de las ventas no se modifican. */
export function estadisticasCalendario<T extends { creadoEn: Date | string; total: unknown }>(pedidos: T[], ahora = new Date()) {
  const hoy = fechaBogota(ahora);
  const dias = new Map<string, { dia: string; total: number }>();
  const meses = new Map<string, { mes: string; total: number }>();
  // Mediodía UTC representa el mismo día en Bogotá y permite restar días sin
  // depender de la zona horaria del servidor ni usar etiquetas como claves.
  for (let i = 6; i >= 0; i--) {
    const fecha = new Date(hoy + 'T12:00:00Z'); fecha.setUTCDate(fecha.getUTCDate() - i);
    dias.set(fechaBogota(fecha), { dia: fecha.toLocaleDateString('es-CO', { timeZone: ZONA, weekday: 'short', day: 'numeric' }), total: 0 });
  }
  for (let i = 11; i >= 0; i--) {
    const fecha = new Date(hoy.slice(0, 7) + '-01T12:00:00Z'); fecha.setUTCMonth(fecha.getUTCMonth() - i);
    meses.set(fechaBogota(fecha).slice(0, 7), { mes: fecha.toLocaleDateString('es-CO', { timeZone: ZONA, month: 'short', year: 'numeric' }), total: 0 });
  }
  const pedidosHoy: T[] = [];
  for (const pedido of pedidos) {
    const clave = fechaBogota(pedido.creadoEn), monto = Number(pedido.total);
    const dia = dias.get(clave); if (dia) dia.total += monto;
    const mes = meses.get(clave.slice(0, 7)); if (mes) mes.total += monto;
    if (clave === hoy) pedidosHoy.push(pedido);
  }
  return { ventasPorDia: [...dias.values()], ventasPorMes: [...meses.values()], pedidosHoy };
}
