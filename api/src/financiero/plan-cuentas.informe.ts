type Fuente = { origen: string; id: number; fecha: Date; descripcion: string; categoria: string; monto: number; clase: string };
type Cuenta = { codigo: string; nombre: string };
type Asignacion = { origen: string; registroId: number; codigo: string };
type Linea = { codigo: string | null; nombre: string; monto: number | null; pendiente?: boolean };

export function agruparCuentas(lineas: Linea[], cuentas: Cuenta[]) {
  const saldos = new Map<string, number | null>();
  for (const linea of lineas) {
    if (!linea.codigo) continue;
    for (const cuenta of cuentas.filter(c => linea.codigo!.startsWith(c.codigo))) {
      const saldo = saldos.get(cuenta.codigo);
      saldos.set(cuenta.codigo, saldo === null || linea.monto === null ? null : (saldo ?? 0) + linea.monto);
    }
  }
  return cuentas.filter(c => saldos.has(c.codigo)).map(c => ({ ...c, monto: saldos.get(c.codigo) === null ? null : Math.round(saldos.get(c.codigo)! * 100) / 100 }));
}

export function prepararInformePuc(
  estados: { periodo: unknown; resultado: { ventasNetas: number; costoVentas: number; gastos: number; otrosIngresos: number; resultadoNeto: number; completo: boolean }; balance: { fecha: Date; efectivo: number | null; inventario: number; cuentasPorCobrar: number; cuentasPorPagar: number; patrimonioRegistrado: number | null; completo: boolean }; detallePuc?: { ingresos: Fuente[]; gastos: Fuente[]; proveedores: number } },
  cuentas: Cuenta[], asignaciones: Asignacion[], restaurante = false,
) {
  const asignadas = new Map(asignaciones.map(a => [`${a.origen}:${a.registroId}`, a.codigo]));
  const registros = [...estados.detallePuc!.ingresos, ...estados.detallePuc!.gastos].map(fuente => ({
    ...fuente, codigo: asignadas.get(`${fuente.origen}:${fuente.id}`) ?? null,
  }));
  const r = estados.resultado, b = estados.balance;
  const lineas: Linea[] = [
    { codigo: restaurante ? '4140' : '4135', nombre: 'Ventas netas registradas', monto: r.ventasNetas },
    { codigo: restaurante ? '6140' : '6135', nombre: 'Costo de ventas registrado', monto: r.costoVentas },
    ...registros.map(registro => ({ codigo: registro.codigo, nombre: registro.descripcion, monto: registro.monto })),
  ];
  // Los pendientes permanecen separados de las cuentas confirmadas, conservando el total del estado.
  for (const clase of ['4', '5']) {
    const pendientes = registros.filter(registro => registro.clase === clase && !registro.codigo);
    if (pendientes.length) lineas.push({ codigo: clase, nombre: 'Pendiente de clasificar', monto: pendientes.reduce((s,f) => s + f.monto, 0), pendiente: true });
  }
  const proveedores = estados.detallePuc!.proveedores;
  const balance: Linea[] = [
    { codigo: '11', nombre: 'Disponible registrado · pendiente de separar caja y bancos', monto: b.efectivo },
    { codigo: '1305', nombre: 'Cuentas por cobrar registradas', monto: b.cuentasPorCobrar },
    { codigo: '1435', nombre: 'Inventario con costo registrado', monto: b.inventario },
    { codigo: '22', nombre: 'Proveedores · compras pendientes de pago', monto: proveedores },
    { codigo: '23', nombre: 'Otras cuentas por pagar registradas', monto: Math.round((b.cuentasPorPagar - proveedores) * 100) / 100 },
    { codigo: '3', nombre: 'Patrimonio registrado · pendiente de desglosar aportes y resultados', monto: b.patrimonioRegistrado },
  ];
  return {
    periodo: estados.periodo, resultado: r, fechaBalance: b.fecha, balanceCompleto: b.completo,
    resultadoCuentas: agruparCuentas(lineas, cuentas), balanceCuentas: agruparCuentas(balance, cuentas),
    alcanceBalance: balance,
    pendientes: registros.filter(registro => !registro.codigo).length,
    registros,
  };
}
