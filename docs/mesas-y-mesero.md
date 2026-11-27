# Mesas y perfil mesero

Solo para restaurantes. El módulo se activa al crear mesas en la sede: mientras no haya mesas configuradas, la pantalla Mesas no ofrece cuentas.

## Configurar

En **Mesas → Configurar mesas**, el administrador o el gerente crea las mesas por rango y les asigna nombre, zona (por ejemplo Salón o Terraza) y puestos. Hay hasta 200 mesas por sede. No se puede quitar una mesa que tenga una cuenta abierta.

## Perfil mesero

En **Configuración → Usuarios → Permisos**, a un usuario **Cajero** se le marca **Perfil mesero**. El cambio aplica cuando el usuario vuelve a iniciar sesión.

- Al entrar va directo a Mesas y solo ve ese menú.
- Abre mesas, agrega productos con nota para cocina, envía rondas, traslada o une mesas, pasa productos de una mesa a otra y marca lo servido.
- El API le bloquea la caja, crear ventas, cobrar mesas, Domicilios y la tienda web, el consumo de empleados, los pedidos de distribuidores y el reporte de propinas.

## Cuenta de una mesa

- **Una cuenta abierta por mesa.** Lo garantiza un índice único, así dos meseros no pueden abrir la misma mesa.
- **Productos sin enviar.** Se quitan libremente. "Enviar a cocina" los agrupa en una **ronda**, que la cocina ve en su pantalla (sección Mesas). Si la empresa trabaja con comandas, también se imprimen por estación, con las mismas reglas del POS.
- **Estados de la ronda.** En espera → Preparando → Lista → Servida. La mesa se pinta de verde cuando hay comida lista.
- **Anular lo enviado.** Un producto ya enviado a cocina solo lo anula el administrador o el gerente, con motivo. El historial de la cuenta registra quién lo hizo.
- **Trasladar o unir.** Si la mesa de destino está libre, la cuenta se mueve. Si está ocupada, las cuentas se unen, salvo que la de origen ya tenga cobros parciales.
- **Pasar productos.** Los productos elegidos y sin cobrar pasan a otra mesa; si está libre, se le abre cuenta.
- **Conflictos entre dispositivos.** Cada cambio verifica la versión de la cuenta. Si otro dispositivo la cambió, se pide actualizar.

## Cobro (caja)

- Cobra un cajero (que no tenga el perfil mesero), el gerente o el administrador, con la caja abierta.
- Se cobra **todo** o **los productos elegidos**, es decir, dividir la cuenta por productos. La pantalla muestra además el valor **por persona** como guía para dividir en partes iguales.
- Cada cobro crea una venta normal de la caja, marcada "Mesa N": descuenta inventario, suma al cierre, admite propina y pagos mixtos, e imprime la tirilla. La venta se crea como entregada porque ya pasó por cocina y no vuelve a la pantalla de preparación.
- **Precio.** La venta toma el precio vigente del producto al cobrar. El total que muestra la mesa es el precio del momento en que se agregó el producto.
- **Reintentos.** El cobro usa una clave de reintento: repetirlo no crea dos ventas. Cuando no queda nada por cobrar, la mesa se libera.
- **Anular la cuenta.** El administrador o el gerente puede anularla con motivo.

## Pendiente

- Adicionales y exclusiones estructurados en la mesa. Por ahora se escriben en la nota para cocina.
- Plano con posiciones arrastrables.

## Datos

Tabla aditiva `mesa_registros`, que se crea en la base de la sede desde la primera acción de escritura. Tipos de registro:

- `PLANO`: las mesas de la sede.
- `CUENTA`: una por cuenta. Mientras está abierta su clave es `mesa:N`; al cerrarse pasa a `cerrada:id`.

Los respaldos la tratan como opcional.

La venta y la confirmación de productos cobrados en la mesa se guardan en una sola transacción. Las uniones y movimientos entre cuentas también son atómicos: un conflicto en el destino revierte los cambios del origen. Las claves de cobro se identifican por cuenta para evitar reutilizar una venta ajena.
