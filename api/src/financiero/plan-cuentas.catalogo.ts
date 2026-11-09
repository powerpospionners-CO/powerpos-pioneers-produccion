// Catálogo inicial basado en el PUC para comerciantes. Los auxiliares son configurables por empresa.
export const CUENTAS_INICIALES: [string, string][] = [
  ['1', 'Activo'], ['11', 'Disponible'], ['1105', 'Caja'], ['110505', 'Caja general'],
  ['1110', 'Bancos'], ['111005', 'Moneda nacional'], ['1120', 'Cuentas de ahorro'],
  ['112005', 'Bancos'], ['13', 'Deudores'], ['1305', 'Clientes'], ['130505', 'Nacionales'],
  ['14', 'Inventarios'], ['1435', 'Mercancías no fabricadas por la empresa'],
  ['15', 'Propiedades, planta y equipo'], ['1524', 'Equipo de oficina'], ['1528', 'Equipo de computación y comunicación'],
  ['2', 'Pasivo'], ['21', 'Obligaciones financieras'], ['22', 'Proveedores'],
  ['2205', 'Nacionales'], ['23', 'Cuentas por pagar'], ['2335', 'Costos y gastos por pagar'],
  ['24', 'Impuestos, gravámenes y tasas'], ['2408', 'Impuesto sobre las ventas por pagar'],
  ['25', 'Obligaciones laborales'], ['2505', 'Salarios por pagar'],
  ['3', 'Patrimonio'], ['31', 'Capital social'], ['36', 'Resultados del ejercicio'],
  ['3605', 'Utilidad del ejercicio'], ['3610', 'Pérdida del ejercicio'],
  ['4', 'Ingresos'], ['41', 'Operacionales'], ['4135', 'Comercio al por mayor y al por menor'],
  ['413520', 'Venta de productos en almacenes no especializados'],
  ['4140', 'Hoteles y restaurantes'],
  ['4175', 'Devoluciones en ventas'], ['42', 'No operacionales'], ['4295', 'Diversos'], ['429595', 'Otros'],
  ['5', 'Gastos'], ['51', 'Operacionales de administración'],
  ['5105', 'Gastos de personal'], ['510506', 'Sueldos'], ['510512', 'Jornales'],
  ['510515', 'Horas extras y recargos'], ['510527', 'Auxilio de transporte'],
  ['510530', 'Cesantías'], ['510533', 'Intereses sobre cesantías'], ['510536', 'Prima de servicios'],
  ['510539', 'Vacaciones'], ['5110', 'Honorarios'], ['5115', 'Impuestos'],
  ['5120', 'Arrendamientos'], ['512010', 'Construcciones y edificaciones'],
  ['5135', 'Servicios'], ['513525', 'Acueducto y alcantarillado'],
  ['513530', 'Energía eléctrica'], ['513535', 'Teléfono'],
  ['513550', 'Transporte, fletes y acarreos'], ['513595', 'Otros'],
  ['5145', 'Mantenimiento y reparaciones'], ['514510', 'Construcciones y edificaciones'],
  ['514520', 'Equipo de oficina'], ['514525', 'Equipo de computación y comunicación'],
  ['5195', 'Diversos'], ['519530', 'Útiles, papelería y fotocopias'], ['519595', 'Otros'],
  ['52', 'Operacionales de ventas'], ['5205', 'Gastos de personal'],
  ['520506', 'Sueldos'], ['5235', 'Servicios'], ['523550', 'Transporte, fletes y acarreos'],
  ['523560', 'Publicidad, propaganda y promoción'], ['5295', 'Diversos'],
  ['529505', 'Comisiones'], ['529595', 'Otros'], ['53', 'No operacionales'],
  ['5305', 'Financieros'], ['530505', 'Gastos bancarios'], ['530520', 'Intereses'],
  ['6', 'Costos de ventas'], ['61', 'Costo de ventas y de prestación de servicios'],
  ['6135', 'Comercio al por mayor y al por menor'], ['613520', 'Venta de productos en almacenes no especializados'],
  ['6140', 'Hoteles y restaurantes'],
];

export function codigoSuperior(codigo: string) {
  if (codigo.length === 1) return null;
  if (codigo.length === 2) return codigo.slice(0, 1);
  return codigo.slice(0, codigo.length - 2);
}

export function validarCodigoPuc(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && /^(?:[1-6]|[1-6]\d|[1-6]\d{3}|[1-6]\d{5}|[1-6]\d{7}|[1-6]\d{9})$/.test(codigo);
}

// Cuentas de agrupación utilizadas por los informes generados desde ventas y saldos.
export const CUENTAS_AUTOMATICAS = ['11', '1305', '1435', '22', '23', '3', '4135', '4140', '6135', '6140'];

export function motivoProteccionPuc(codigo: string) {
  return CUENTAS_AUTOMATICAS.some(c => c.startsWith(codigo))
    ? 'Esta cuenta forma parte de la estructura utilizada por los informes automáticos.'
    : null;
}
