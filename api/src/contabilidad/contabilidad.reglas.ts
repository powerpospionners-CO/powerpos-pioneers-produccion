// Libro diario sugerido para el contador: asientos de partida doble por día, a partir de lo que registró el POS.
// Los códigos son del PUC colombiano (Decreto 2650 de 1993) y el contador puede reclasificarlos.

export type Linea = { cuenta: string; nombre: string; detalle: string; debito: number; credito: number };
export type Comprobante = { numero: string; fecha: string; tipo: string; descripcion: string; lineas: Linea[]; verificar?: string };

export const CUENTAS: Record<string, string> = {
  '110505': 'Caja general',
  '111005': 'Bancos · cuenta corriente o de ahorros',
  '130505': 'Clientes nacionales',
  '143505': 'Inventario de mercancías',
  '413505': 'Comercio al por mayor y al por menor',
  '414005': 'Hoteles y restaurantes',
  '417505': 'Devoluciones en ventas',
  '429595': 'Otros ingresos diversos',
  '613505': 'Costo de ventas · comercio',
  '614005': 'Costo de ventas · restaurantes',
  '238095': 'Acreedores varios · propinas por pagar',
  '220505': 'Proveedores nacionales',
  '233595': 'Costos y gastos por pagar · otros',
  '510506': 'Gastos de personal · sueldos',
  '511595': 'Impuestos · otros',
  '512010': 'Arrendamientos · construcciones y edificaciones',
  '513595': 'Servicios · otros',
  '514510': 'Mantenimiento y reparaciones · construcciones',
  '523595': 'Comisiones',
  '519595': 'Gastos diversos · otros',
};

const CUENTA_GASTO: Record<string, string> = {
  COMPRA_INSUMOS: '143505', COMPRA_MERCANCIA: '143505', NOMINA: '510506', SERVICIOS: '513595', ARRIENDO: '512010',
  MANTENIMIENTO: '514510', IMPUESTOS: '511595', COMISION_DISTRIBUIDOR: '523595', OTROS: '519595',
};

const COMPRAS = ['COMPRA_INSUMOS', 'COMPRA_MERCANCIA'];
const cuentaPorPagar = (categoria: string) => (COMPRAS.includes(categoria) ? '220505' : '233595');
const r2 = (n: number) => Math.round(n * 100) / 100;
export const cuentaMedio = (metodo: string) => (metodo === 'EFECTIVO' ? '110505' : metodo === 'CREDITO' ? '130505' : '111005');
const linea = (cuenta: string, detalle: string, debito: number, credito: number, nombres: Record<string, string>): Linea => ({
  cuenta, nombre: nombres[cuenta] || CUENTAS[cuenta] || cuenta, detalle, debito: r2(debito), credito: r2(credito),
});

export type Datos = {
  restaurante: boolean;
  ventas: { fecha: string; total: number; costo: number | null; pagos: { metodo: string; monto: number }[] }[];
  devoluciones: { fecha: string; metodo: string; monto: number }[];
  cobrosCredito: { fecha: string; metodo: string; monto: number }[];
  propinas: { fecha: string; metodo: string; monto: number }[];
  // abono: el movimiento paga una cuenta por pagar ya registrada (no es un gasto nuevo).
  movimientos: { id: number; fecha: string; tipo: 'INGRESO' | 'EGRESO'; categoria: string; descripcion: string; monto: number; cuenta?: string | null; abono?: boolean }[];
  // Compras y gastos que quedaron por pagar (cuentas por pagar creadas en el periodo).
  obligaciones: { id: number; fecha: string; categoria: string; descripcion: string; monto: number; cuenta?: string | null }[];
  nombres?: Record<string, string>;
};

// Agrupa importes por cuenta, en el orden de llegada.
function agrupar(items: { cuenta: string; monto: number }[]) {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.cuenta, (m.get(i.cuenta) || 0) + i.monto);
  return [...m].filter(([, v]) => Math.abs(v) >= 0.005);
}

export function libroDiario(d: Datos): Comprobante[] {
  const nombres = d.nombres || {};
  const cuentaVenta = d.restaurante ? '414005' : '413505', cuentaCosto = d.restaurante ? '614005' : '613505';
  const dias = [...new Set([...d.ventas, ...d.devoluciones, ...d.cobrosCredito, ...d.propinas, ...d.movimientos, ...d.obligaciones].map((x) => x.fecha))].sort();
  const salida: Comprobante[] = [];
  let n = 0;
  const num = (tipo: string) => `${tipo}-${String(++n).padStart(5, '0')}`;
  for (const fecha of dias) {
    const ventas = d.ventas.filter((v) => v.fecha === fecha);
    if (ventas.length) {
      const total = ventas.reduce((s, v) => s + v.total, 0);
      // Lo que no tiene pago registrado (ventas a crédito o antiguas) queda como cuenta por cobrar o según su método.
      const cobros = agrupar(ventas.flatMap((v) => {
        const pagado = v.pagos.reduce((s, p) => s + p.monto, 0);
        const pendiente = r2(v.total - pagado);
        return [...v.pagos.map((p) => ({ cuenta: cuentaMedio(p.metodo), monto: p.monto })), ...(pendiente > 0 ? [{ cuenta: '130505', monto: pendiente }] : [])];
      }));
      salida.push({
        numero: num('VT'), fecha, tipo: 'Ventas del día', descripcion: `${ventas.length} ventas`,
        lineas: [...cobros.map(([c, v]) => linea(c, 'Recaudo de ventas', v, 0, nombres)), linea(cuentaVenta, 'Ventas del día', 0, total, nombres)],
      });
      const conCosto = ventas.filter((v) => v.costo !== null);
      const costo = conCosto.reduce((s, v) => s + (v.costo || 0), 0);
      if (costo > 0)
        salida.push({
          numero: num('CV'), fecha, tipo: 'Costo de ventas', descripcion: `${conCosto.length} ventas con costo registrado`,
          lineas: [linea(cuentaCosto, 'Costo de lo vendido', costo, 0, nombres), linea('143505', 'Salida de inventario', 0, costo, nombres)],
          ...(conCosto.length < ventas.length ? { verificar: `${ventas.length - conCosto.length} ventas sin costo registrado` } : {}),
        });
    }
    const devs = d.devoluciones.filter((x) => x.fecha === fecha);
    if (devs.length) {
      const total = devs.reduce((s, x) => s + x.monto, 0);
      salida.push({
        numero: num('DV'), fecha, tipo: 'Devoluciones', descripcion: `${devs.length} devoluciones`,
        lineas: [linea('417505', 'Devoluciones en ventas', total, 0, nombres), ...agrupar(devs.map((x) => ({ cuenta: cuentaMedio(x.metodo), monto: x.monto }))).map(([c, v]) => linea(c, 'Reembolso al cliente', 0, v, nombres))],
      });
    }
    const cobros = d.cobrosCredito.filter((x) => x.fecha === fecha);
    if (cobros.length) {
      const total = cobros.reduce((s, x) => s + x.monto, 0);
      salida.push({
        numero: num('RC'), fecha, tipo: 'Recaudo de cartera', descripcion: `${cobros.length} abonos de clientes`,
        lineas: [...agrupar(cobros.map((x) => ({ cuenta: cuentaMedio(x.metodo), monto: x.monto }))).map(([c, v]) => linea(c, 'Abono de cliente', v, 0, nombres)), linea('130505', 'Abono a cartera', 0, total, nombres)],
      });
    }
    const props = d.propinas.filter((x) => x.fecha === fecha);
    if (props.length) {
      const total = props.reduce((s, x) => s + x.monto, 0);
      salida.push({
        numero: num('PR'), fecha, tipo: 'Propinas recibidas', descripcion: 'Propina voluntaria: no es ingreso del negocio',
        lineas: [...agrupar(props.map((x) => ({ cuenta: cuentaMedio(x.metodo), monto: x.monto }))).map(([c, v]) => linea(c, 'Propinas recibidas', v, 0, nombres)), linea('238095', 'Propinas por pagar al personal', 0, total, nombres)],
      });
    }
    for (const o of d.obligaciones.filter((x) => x.fecha === fecha)) {
      const cuenta = o.cuenta || CUENTA_GASTO[o.categoria] || '519595';
      salida.push({
        numero: num('CP'), fecha, tipo: 'Compra o gasto por pagar', descripcion: o.descripcion,
        lineas: [linea(cuenta, o.descripcion, o.monto, 0, nombres), linea(cuentaPorPagar(o.categoria), o.descripcion, 0, o.monto, nombres)],
        ...(!o.cuenta ? { verificar: 'cuenta asignada por categoría' } : {}),
      });
    }
    for (const m of d.movimientos.filter((x) => x.fecha === fecha)) {
      if (m.abono && m.tipo === 'EGRESO') {
        salida.push({
          numero: num('PG'), fecha, tipo: 'Pago de cuenta por pagar', descripcion: m.descripcion,
          lineas: [linea(cuentaPorPagar(m.categoria), m.descripcion, m.monto, 0, nombres), linea('110505', m.descripcion, 0, m.monto, nombres)],
          verificar: 'confirmar si se pagó en efectivo o por banco',
        });
        continue;
      }
      const ingreso = m.tipo === 'INGRESO';
      const cuenta = m.cuenta || (ingreso ? '429595' : CUENTA_GASTO[m.categoria] || '519595');
      salida.push({
        numero: num(ingreso ? 'IN' : 'EG'), fecha, tipo: ingreso ? 'Otro ingreso' : 'Gasto o compra', descripcion: m.descripcion,
        lineas: ingreso
          ? [linea('110505', m.descripcion, m.monto, 0, nombres), linea(cuenta, m.descripcion, 0, m.monto, nombres)]
          : [linea(cuenta, m.descripcion, m.monto, 0, nombres), linea('110505', m.descripcion, 0, m.monto, nombres)],
        verificar: [!m.cuenta ? 'cuenta asignada por categoría' : '', 'confirmar si se pagó en efectivo, por banco o quedó por pagar'].filter(Boolean).join('; '),
      });
    }
  }
  return salida;
}

export function cuadra(c: Comprobante) {
  const d = c.lineas.reduce((s, l) => s + l.debito, 0), k = c.lineas.reduce((s, l) => s + l.credito, 0);
  return Math.abs(d - k) < 0.01;
}
