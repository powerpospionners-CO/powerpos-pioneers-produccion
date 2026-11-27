// Guías cortas del centro de ayuda. `roles` vacío = visible para todos.
export type Guia = { id: string; titulo: string; tema: string; roles: string[]; ruta?: string; pasos: string[]; notas?: string[] };

const ADMIN = ['ADMIN_EMPRESA', 'GERENTE'];
const CAJA = ['ADMIN_EMPRESA', 'GERENTE', 'CAJERO'];

export const GUIAS: Guia[] = [
  { id: 'abrir-caja', titulo: 'Abrir y cerrar la caja', tema: 'Caja', roles: CAJA, ruta: '/pos', pasos: [
    'En el POS, escribe la base de efectivo y pulsa "Abrir caja".',
    'Para cerrar, pulsa "Cerrar caja", cuenta los billetes y monedas con la calculadora y confirma.',
    'Si hubo propinas, marca entre quiénes se reparten antes de confirmar.',
  ], notas: ['Si el administrador activó el arqueo ciego, no verás cuánto se espera: cuenta todo el efectivo, incluida la base.'] },
  { id: 'vender', titulo: 'Registrar una venta', tema: 'Caja', roles: CAJA, ruta: '/pos', pasos: [
    'Agrega los productos tocándolos o con el lector de códigos.',
    'Pulsa "Cobrar", elige el medio de pago (o divide el pago en varios) y escribe lo recibido en efectivo.',
    'Si la empresa usa propinas, pregunta al cliente y marca su respuesta.',
    'Confirma: se imprime la tirilla y, en efectivo, se abre el cajón.',
  ] },
  { id: 'propinas', titulo: 'Propinas', tema: 'Caja', roles: ADMIN, ruta: '/configuracion', pasos: [
    'En Configuración → Propinas, activa "Preguntar la propina al cobrar" y fija el porcentaje sugerido (máximo 10 %).',
    'La propina va aparte de la venta y se reparte en partes iguales al cerrar la caja.',
    'En "Reparto por persona" ves cuánto le corresponde a cada uno en un periodo.',
  ], notas: ['La propina es voluntaria (Ley 1935 de 2018): siempre se pregunta al cliente.'] },
  { id: 'mesas-configurar', titulo: 'Configurar las mesas', tema: 'Mesas', roles: ADMIN, ruta: '/mesas', pasos: [
    'Abre Mesas → "Configurar mesas".',
    'Agrega un rango (por ejemplo de la 1 a la 15 en Salón) y ajusta nombre, zona y puestos.',
    'Guarda. Las mesas aparecen agrupadas por zona.',
  ] },
  { id: 'mesero', titulo: 'Crear un mesero', tema: 'Mesas', roles: ['ADMIN_EMPRESA'], ruta: '/configuracion', pasos: [
    'En Configuración → Usuarios, crea un usuario con rol Cajero.',
    'Pulsa "Permisos" y marca "Perfil mesero".',
    'Al volver a iniciar sesión, el mesero solo verá Mesas: toma pedidos y los envía a cocina, pero no maneja la caja ni cobra.',
  ] },
  { id: 'mesas-atender', titulo: 'Atender una mesa', tema: 'Mesas', roles: CAJA, ruta: '/mesas', pasos: [
    'Toca una mesa libre e indica cuántas personas hay.',
    'Agrega productos; escribe una nota para cocina si hace falta.',
    'Pulsa "Enviar a cocina". Cuando la cocina la marque lista, la mesa se pone verde: sírvela y márcala como servida.',
    'Para cambiar de mesa usa "Trasladar o unir"; para pasar solo algunos productos, márcalos y usa "Pasar elegidos a otra mesa".',
  ] },
  { id: 'mesas-cobrar', titulo: 'Cobrar una mesa o dividir la cuenta', tema: 'Mesas', roles: CAJA, ruta: '/mesas', pasos: [
    'Abre la mesa desde la caja.',
    'Para dividir por productos, marca lo que paga cada persona y pulsa "Cobrar elegidos". Para cobrar todo, "Cobrar todo".',
    'La pantalla muestra cuánto le toca a cada persona si pagan por partes iguales.',
    'Cuando no queda nada por cobrar, la mesa se libera.',
  ] },
  { id: 'costos', titulo: 'Ver el costo y el margen de cada plato', tema: 'Inventario', roles: ADMIN, ruta: '/costos', pasos: [
    'Abre Costos → "Costo por plato".',
    'El costo sale de la receta (insumos × costo). Si un plato dice "Falta el costo", completa la receta o el costo en Productos e Inventario.',
    'Marca "Solo con alerta" para ver los platos con margen bajo.',
  ] },
  { id: 'kardex', titulo: 'Kardex de un producto o insumo', tema: 'Inventario', roles: ADMIN, ruta: '/costos', pasos: [
    'Abre Costos → Kardex, elige producto o insumo y el periodo.',
    'Verás cada entrada, venta, ajuste y merma con el saldo.',
  ] },
  { id: 'compra-sugerida', titulo: 'Saber qué comprar', tema: 'Inventario', roles: ADMIN, ruta: '/costos', pasos: [
    'Abre Costos → "Compra sugerida".',
    'Elige con qué consumo calcular y para cuántos días quieres comprar.',
    'Revisa la lista y pulsa "Exportar para el proveedor".',
  ] },
  { id: 'mi-negocio', titulo: 'Ver mi negocio desde el celular', tema: 'Dueño', roles: ADMIN, ruta: '/dueno', pasos: [
    'Abre el panel en el celular y, en el menú del navegador, elige "Agregar a la pantalla de inicio" o "Instalar".',
    'Mantén presionado el ícono de PowerPOS y toca "Mi negocio".',
    'Ves las ventas del día de cada sede, la comparación con la semana anterior y las alertas.',
  ] },
  { id: 'control', titulo: 'Revisar anulaciones, descuentos y diferencias por persona', tema: 'Dueño', roles: ADMIN, ruta: '/dueno', pasos: [
    'Abre Mi negocio → "Control por usuario" y elige el periodo.',
    'Las personas con señales para revisar aparecen primero.',
  ], notas: ['Una alerta no prueba un error: revisa el caso con la persona.'] },
  { id: 'arqueo-ciego', titulo: 'Arqueo ciego', tema: 'Dueño', roles: ADMIN, ruta: '/configuracion', pasos: [
    'En Configuración → Arqueo ciego, actívalo para la sede.',
    'Al cerrar, el cajero contará sin ver cuánto debería haber; la diferencia la ves en Cajas.',
  ] },
  { id: 'contabilidad', titulo: 'Enviar la información al contador', tema: 'Contabilidad', roles: ADMIN, ruta: '/contabilidad', pasos: [
    'Abre Contabilidad, elige el periodo (por ejemplo el mes) y pulsa "Generar".',
    'Revisa que diga "Todos los comprobantes cuadran" y mira los que dicen "Verificar".',
    'Pulsa "Exportar para el contador" y envíale el archivo.',
  ], notas: ['Para que los gastos queden en la cuenta correcta, asígnales la cuenta en Financiero → Plan de cuentas.'] },
  { id: 'iva', titulo: 'Configurar el IVA de los productos', tema: 'Contabilidad', roles: ADMIN, ruta: '/contabilidad', pasos: [
    'Abre Contabilidad → "Tarifas de IVA" y confirma que la empresa está marcada como responsable de IVA.',
    'Marca "Solo sin confirmar", filtra por categoría y elige la tarifa (19 %, 5 %, exento o excluido). Puedes aplicarla a todos los productos visibles.',
    'Pulsa "Guardar cambios". El precio de venta no cambia: el sistema separa la base y el IVA.',
    'En "Reporte de IVA" ves por bimestre el IVA generado, el descontable y el saldo estimado.',
  ], notas: ['Confirma las tarifas con tu contador: muchos alimentos van al 5 % o están excluidos.'] },
  { id: 'seguridad', titulo: 'Proteger mi cuenta', tema: 'Seguridad', roles: [], ruta: '/seguridad', pasos: [
    'Toca el ícono del escudo en la barra superior.',
    'Activa la verificación en dos pasos con Google o Microsoft Authenticator y guarda los códigos de recuperación.',
    'Revisa tus sesiones abiertas y cierra las que no reconozcas.',
  ] },
  { id: 'tienda', titulo: 'Tienda en línea', tema: 'Tienda', roles: ['ADMIN_EMPRESA'], ruta: '/mi-tienda', pasos: [
    'En Mi tienda configura el enlace, los horarios, las zonas de domicilio y los medios de pago.',
    'Activa recoger en tienda, pedidos programados, mesas con QR, avisos o reseñas en "Entregas, mesas y avisos".',
    'Los pedidos llegan a Domicilios para aceptarlos.',
  ] },
];

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function guiasPara(rol: string | undefined, busqueda = '') {
  const q = normalizar(busqueda.trim());
  return GUIAS.filter((g) => (!g.roles.length || (rol && g.roles.includes(rol))) && (!q || normalizar([g.titulo, g.tema, ...g.pasos, ...(g.notas || [])].join(' ')).includes(q)));
}
