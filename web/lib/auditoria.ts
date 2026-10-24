export type RegistroAuditoria = {
  id: number; creadoEn: string; accion: string;
  detalle?: {
    metodo?: string; ruta?: string; estado?: number; recursoId?: number;
    actor?: { id?: number; nombre?: string; rol?: string; sucursalId?: number };
    campos?: string[];
    cambio?: { nombre?: string; anterior?: string | null; nuevo?: string; pantalla?: string; tipo?: string; repetido?: boolean; gasto?: { id: number; categoria: string; descripcion: string; monto: number; fecha: string; pagadoConRecaudo: boolean } };
  };
};

const PANTALLAS: Record<string, string> = {
  dashboard: 'Resumen de la empresa', pos: 'Punto de venta', productos: 'Productos', 'codigos-barras': 'Códigos de barras',
  auditoria: 'Auditoría', inventario: 'Inventario', clientes: 'Clientes', financiero: 'Finanzas', compras: 'Compras',
  caja: 'Cajas', configuracion: 'Configuración', reportes: 'Reportes', estadisticas: 'Estadísticas',
  cocina: 'Cocina', domicilios: 'Domicilios', usuarios: 'Usuarios', sucursales: 'Sucursales',
  'mi-tienda': 'Tienda en línea', fidelizacion: 'Puntos de clientes', administracion: 'Administración',
  distribuidores: 'Distribuidores', distribuidor: 'Pedidos del distribuidor', suscripcion: 'Suscripción',
  'consumo-empleados': 'Consumo de empleados', catalogo: 'Catálogo', empresa: 'Configuración de la empresa',
  'acceso-barras': 'Códigos de barras', 'tienda-admin': 'Tienda en línea', adicionales: 'Adicionales', notificaciones: 'Notificaciones', preparaciones: 'Preparaciones', tareas: 'Tareas de cocina',
  gastos: 'Gastos', 'acceso-gastos': 'Gastos',
};
const CAMPOS: Record<string, string> = {
  nombre: 'Nombre', email: 'Correo electrónico', rol: 'Rol', sucursalId: 'Sucursal', permisos: 'Permisos',
  precio: 'Precio', costo: 'Costo', stockActual: 'Existencias', stockMinimo: 'Existencias mínimas',
  categoriaId: 'Categoría', descripcion: 'Descripción', activo: 'Estado activo', cantidad: 'Cantidad',
  montoFinal: 'Dinero contado', motivo: 'Motivo', montoInicial: 'Base de caja', metodoPago: 'Medio de pago',
  estado: 'Estado', monto: 'Valor', direccion: 'Dirección', telefono: 'Teléfono',
  pagadoConRecaudo: 'Pago con dinero del recaudo',
};
const CATEGORIAS_GASTO: Record<string, string> = { OTROS: 'Otros gastos', COMPRA_INSUMOS: 'Compra de insumos', NOMINA: 'Nómina', SERVICIOS: 'Servicios', ARRIENDO: 'Arriendo', MANTENIMIENTO: 'Mantenimiento', IMPUESTOS: 'Impuestos', COMISION_DISTRIBUIDOR: 'Comisiones' };
export const rolAuditoria = (rol?: string) => ({ ADMIN_EMPRESA: 'Administrador', GERENTE: 'Gerente', CAJERO: 'Cajero', COCINERO: 'Cocinero', DOMICILIARIO: 'Domiciliario', DISTRIBUIDOR: 'Distribuidor', SUPERADMIN: 'Administrador de PowerPOS' }[rol || ''] || 'Usuario');
export const nombrePantalla = (ruta?: string) => {
  if (ruta === '/caja/recaudo') return 'Recaudo semanal';
  return PANTALLAS[(ruta || '').split('/').filter(Boolean)[0]] || 'una sección de la empresa';
};

export function describirAuditoria(registro: RegistroAuditoria) {
  const d = registro.detalle || {};
  const ruta = d.ruta || '';
  const metodo = d.metodo || '';
  const fallo = typeof d.estado === 'number' && d.estado >= 400;
  let titulo = 'Registró una actividad';
  let descripcion = 'Se registró una acción de este usuario en la empresa.';
  let grupo = 'Cambios';
  let seccion = nombrePantalla(ruta);
  let referencia = d.recursoId ? `Registro n.º ${d.recursoId}` : '';

  if (registro.accion === 'INICIO_SESION' || ruta === '/auth/login') {
    titulo = 'Inició sesión'; descripcion = 'Ingresó a la empresa con su usuario y contraseña.'; grupo = 'Sesiones'; seccion = 'Acceso a la empresa';
  } else if (registro.accion === 'CIERRE_SESION' || ruta === '/actividad/salir') {
    titulo = 'Cerró sesión'; descripcion = 'Salió de su cuenta desde la aplicación.'; grupo = 'Sesiones'; seccion = 'Acceso a la empresa';
  } else if (registro.accion === 'PANTALLA' || ruta === '/actividad/vista') {
    seccion = nombrePantalla(d.cambio?.pantalla); titulo = `Abrió ${seccion}`; descripcion = 'Entró a esta sección para consultar o trabajar en ella.'; grupo = 'Navegación';
  } else if (ruta.startsWith('/impresion/')) {
    seccion = 'Impresión';
    if (ruta.includes('abrir-cajon')) { titulo = 'Solicitó abrir el cajón'; descripcion = 'Envió la orden de apertura del cajón de dinero.'; }
    else if (ruta.includes('comanda')) { titulo = 'Solicitó imprimir una comanda'; descripcion = 'Envió una comanda a la impresora de cocina.'; }
    else { titulo = 'Solicitó imprimir un recibo'; descripcion = 'Envió un recibo a impresión. Este registro no confirma que haya salido en papel.'; }
  } else if (ruta === '/acceso-gastos/registrar') {
    seccion = 'Gastos'; titulo = d.cambio?.repetido ? 'Confirmó un gasto ya registrado' : 'Registró un gasto';
    descripcion = d.cambio?.gasto?.descripcion || 'Registró un gasto de su sucursal mediante el acceso autorizado.';
    referencia = d.cambio?.gasto?.id ? `Gasto n.º ${d.cambio.gasto.id}` : '';
  } else if (ruta === '/acceso-gastos/desbloquear') {
    seccion = 'Gastos'; titulo = 'Ingresó al registro de gastos'; descripcion = 'Solicitó abrir el formulario con su código de acceso.'; grupo = 'Sesiones';
  } else if (ruta.includes('/acceso-gastos/usuarios/')) {
    seccion = 'Usuarios'; titulo = 'Configuró el acceso a registrar gastos'; descripcion = 'Generó o revocó la autorización especial de un cajero para ingresar gastos.';
  } else if (ruta === '/acceso-barras/desbloquear') {
    seccion = 'Códigos de barras'; titulo = 'Ingresó al apartado de códigos'; descripcion = 'Solicitó habilitar temporalmente la edición con su código de acceso.';
  } else if (ruta.includes('/acceso-barras/usuarios/')) {
    seccion = 'Usuarios'; titulo = 'Configuró el acceso a códigos de barras'; descripcion = 'Generó o revocó la autorización especial de un cajero.'; referencia = d.recursoId ? `Usuario n.º ${d.recursoId}` : '';
  } else if (ruta.includes('/acceso-barras/productos/') && metodo === 'PATCH') {
    seccion = 'Productos'; titulo = d.cambio?.tipo === 'SABOR' ? 'Cambió el código de un sabor' : d.cambio?.tipo === 'PRESENTACION' ? 'Cambió el código de una presentación' : 'Cambió un código de barras';
    descripcion = d.cambio?.nombre || 'Actualizó el código utilizado para identificar el producto al venderlo.'; referencia = d.recursoId ? `Producto n.º ${d.recursoId}` : '';
  } else if (ruta.startsWith('/caja')) {
    seccion = 'Cajas'; referencia = d.recursoId ? `Caja n.º ${d.recursoId}` : '';
    const acciones: Array<[string, string, string]> = [
      ['/abrir', 'Abrió una caja', 'Registró la apertura de un turno de caja.'],
      ['/cerrar', 'Cerró una caja', 'Registró el cierre de un turno y el dinero contado.'],
      ['/corregir', 'Corrigió un cierre de caja', 'Actualizó los datos de un cierre de caja.'],
      ['/archivo-historial', 'Cambió la visibilidad de un cierre', 'Archivó o restauró un cierre del historial; conserva las ventas y movimientos.'],
      ['/reimprimir', 'Solicitó reimprimir un cierre', 'Solicitó una nueva copia del cierre de caja.'],
      ['/apertura-con-llave', 'Reportó una apertura con llave', 'Dejó constancia de la apertura manual del cajón.'],
      ['/apertura-irregular', 'Reportó una apertura irregular', 'Registró un aviso para revisar la apertura de la caja.'],
      ['/consignar', 'Registró una consignación', 'Registró la entrega o consignación del efectivo recaudado.'],
    ];
    const accion = acciones.find(([fragmento]) => ruta.includes(fragmento));
    if (accion && metodo !== 'GET') { titulo = accion[1]; descripcion = accion[2]; }
  } else if (ruta.startsWith('/usuarios')) {
    seccion = 'Usuarios'; referencia = d.recursoId ? `Usuario n.º ${d.recursoId}` : '';
    if (ruta.endsWith('/permisos')) { titulo = 'Actualizó permisos de un usuario'; descripcion = 'Cambió los apartados que puede consultar o editar una persona.'; }
    else if (ruta.endsWith('/toggle-activo')) { titulo = 'Cambió el estado de un usuario'; descripcion = 'Activó o desactivó el acceso de una persona a la empresa.'; }
    else if (metodo === 'POST') { titulo = 'Creó un usuario'; descripcion = 'Registró una nueva cuenta para trabajar en la empresa.'; }
    else if (metodo === 'PATCH') { titulo = ruta.endsWith('/mi-perfil') ? 'Actualizó su perfil' : 'Editó un usuario'; descripcion = 'Guardó cambios en los datos de la cuenta.'; }
  } else if (ruta.startsWith('/pedidos')) {
    seccion = 'Ventas'; referencia = d.recursoId ? `Venta n.º ${d.recursoId}` : '';
    if (ruta.includes('devoluciones')) { titulo = 'Registró una devolución'; descripcion = 'Registró la devolución de productos de una venta.'; }
    else if (ruta.includes('cobros-credito')) { titulo = 'Registró un abono a crédito'; descripcion = 'Registró un pago de una venta pendiente de cobro.'; }
    else if (ruta.endsWith('/pago')) { titulo = 'Actualizó el pago de una venta'; descripcion = 'Guardó cambios en el cobro de la venta.'; }
    else if (ruta.endsWith('/estado')) { titulo = 'Cambió el estado de una venta'; descripcion = 'Actualizó el estado del pedido o venta.'; }
    else if (metodo === 'POST') { titulo = 'Registró una venta'; descripcion = 'Envió una venta para registrarla en el sistema.'; }
  }

  if (titulo === 'Registró una actividad') {
    if (ruta.includes('ajuste-stock') || ruta.endsWith('/ajuste')) { titulo = 'Ajustó existencias'; descripcion = 'Registró un ajuste de las cantidades en inventario.'; }
    else if (ruta.includes('/presentaciones')) { titulo = metodo === 'DELETE' ? 'Retiró una presentación' : metodo === 'POST' ? 'Agregó una presentación' : 'Editó una presentación'; descripcion = 'Registró un cambio en las presentaciones de un producto.'; }
    else if (ruta.includes('/codigos-barras')) { titulo = metodo === 'DELETE' ? 'Retiró un código por sabor' : 'Agregó un código por sabor'; descripcion = 'Registró un cambio en los códigos por sabor del producto.'; }
    else if (metodo === 'PATCH' || metodo === 'PUT') { titulo = `Actualizó ${seccion}`; descripcion = 'Guardó cambios en la información de este apartado.'; }
    else if (metodo === 'DELETE') { titulo = `Retiró un registro de ${seccion}`; descripcion = 'Solicitó retirar este registro del apartado.'; }
    else if (metodo === 'POST') { titulo = `Registró una acción en ${seccion}`; descripcion = 'Envió información para registrarla en este apartado.'; }
  }
  if (metodo === 'GET' || registro.accion === 'CONSULTA') { titulo = `Consultó ${seccion}`; descripcion = 'La aplicación consultó información de este apartado.'; grupo = 'Consultas'; }
  if (fallo) {
    const verbos: Record<string, string> = { 'Inició': 'iniciar', 'Cerró': 'cerrar', 'Abrió': 'abrir', 'Cambió': 'cambiar', 'Editó': 'editar', 'Actualizó': 'actualizar', 'Registró': 'registrar', 'Agregó': 'agregar', 'Retiró': 'retirar', 'Ingresó': 'ingresar', 'Configuró': 'configurar', 'Solicitó': 'solicitar', 'Corrigió': 'corregir', 'Reportó': 'reportar', 'Ajustó': 'ajustar', 'Consultó': 'consultar' };
    const verbo = titulo.split(' ')[0];
    titulo = verbos[verbo] ? `Intentó ${verbos[verbo]}${titulo.slice(verbo.length)}` : 'Intentó realizar una acción';
    descripcion = 'La solicitud no se completó. Este registro no confirma que se hayan guardado cambios.';
  }
  return {
    titulo, descripcion, grupo, seccion, referencia, fallo,
    estado: fallo ? 'No completado' : 'Registrado',
    usuario: d.actor?.nombre || 'Usuario no identificado', rol: rolAuditoria(d.actor?.rol), sucursalId: d.actor?.sucursalId,
    campos: ['PATCH','PUT'].includes(metodo) && !ruta.startsWith('/impresion/') ? [...new Set((d.campos || []).map(c => CAMPOS[c]).filter(Boolean))] : [],
    cambio: !fallo && d.cambio?.nuevo ? { nombre: d.cambio.nombre, anterior: d.cambio.anterior || 'Sin código', nuevo: d.cambio.nuevo } : null,
    gasto: !fallo && d.cambio?.gasto ? { ...d.cambio.gasto, categoriaNombre: CATEGORIAS_GASTO[d.cambio.gasto.categoria] || 'Otros gastos' } : undefined,
  };
}
