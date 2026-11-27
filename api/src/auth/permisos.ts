// Los permisos individuales solo restringen; nunca amplían el plan o el rol.
export const RUTAS_MODULO: Array<[string, string]> = [
  ['/personal', 'financiero'],
  ['/pedidos/estadisticas', 'dashboard'],
  ['/administracion', 'financiero'],
  ['/pedidos', 'pos'],
  ['/caja', 'pos'],
  ['/categorias', 'pos'],
  ['/adicionales', 'pos'],
  ['/impresion', 'pos'],
  ['/productos', 'productos'],
  ['/inventario', 'inventario'],
  ['/costos', 'inventario'],
  ['/dueno', 'dashboard'],
  ['/clientes', 'clientes'],
  ['/financiero', 'financiero'],
  ['/compras', 'financiero'],
  ['/reportes', 'reportes'],
  ['/preparaciones', 'inventario'],
  ['/tareas', 'cocina'],
  ['/usuarios', 'configuracion'],
  ['/notificaciones', 'configuracion'],
  ['/sucursales', 'configuracion'],
  ['/empresa', 'configuracion'],
  ['/tienda-admin', 'pos'],
  ['/distribuidores', 'distribuidores'],
  ['/pedidos-distribuidor', 'distribuidores'],
  ['/catalogo', 'catalogo'],
  ['/consumo-empleados', 'pos'],
  ['/mesas', 'pos'],
];

export function moduloRuta(ruta: string) {
  return RUTAS_MODULO.find(
    ([prefijo]) => ruta === prefijo || ruta.startsWith(prefijo + '/'),
  )?.[1];
}

export function permisoIndividual(
  permisos: unknown,
  modulo: string,
  escritura: boolean,
): boolean {
  if (!permisos || typeof permisos !== 'object' || Array.isArray(permisos))
    return true;
  const permiso = (permisos as Record<string, unknown>)[modulo];
  // Campos ausentes conservan compatibilidad con usuarios previos.
  if (permiso === undefined) return true;
  if (typeof permiso === 'boolean') return permiso;
  if (!permiso || typeof permiso !== 'object' || Array.isArray(permiso))
    return false;
  const valor = permiso as Record<string, unknown>;
  return valor.ver === true && (!escritura || valor.editar === true);
}

// Perfil mesero: un CAJERO que toma pedidos en las mesas pero no maneja la caja ni cobra.
export function esMesero(permisos: unknown) {
  return !!permisos && typeof permisos === 'object' && !Array.isArray(permisos) && (permisos as Record<string, unknown>).perfil === 'MESERO';
}

const PREFIJOS_SIN_MESERO = ['/caja', '/tienda-admin', '/consumo-empleados', '/pedidos-distribuidor', '/propinas/reporte'];
export function rutaBloqueadaMesero(ruta: string, metodo: string) {
  const escritura = !['GET', 'HEAD', 'OPTIONS'].includes(metodo);
  if (PREFIJOS_SIN_MESERO.some((p) => ruta === p || ruta.startsWith(p + '/'))) return true;
  if (escritura && (ruta === '/pedidos' || ruta.startsWith('/pedidos/'))) return true;
  return /^\/mesas\/cuentas\/[^/]+\/cobrar$/.test(ruta);
}
