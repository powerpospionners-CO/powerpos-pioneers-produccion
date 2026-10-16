# Separación física por sede: trabajo pendiente

## Alcance acordado

Cada sucursal deberá tener su propia base operativa. Actualmente existen dos empresas, cada una con una única sucursal principal (empresa/sucursal 1/1 y 2/2). La aplicación productiva todavía usa una base compartida. No se ha cambiado su conexión ni se ha activado el aislamiento físico.

La facturación electrónica queda fuera de esta ampliación. Los cajeros podrán operar crédito y devoluciones cuando esos flujos estén implementados y verificados. Los traslados no se habilitan mientras las empresas solo tengan su sede principal.

## Respaldo previo

Neon: proyecto `divine-smoke-39959405`, origen `production` (`br-aged-queen-b5wumst5`). Respaldo sin borrado automático `respaldo-20261016-antes-aislamiento` (`br-tiny-field-b5q83nxl`). Los conteos de sus 52 tablas coincidieron con origen al verificarse. La copia de pruebas `prueba-costos-ordenes-20261016` (`br-rapid-mud-b5qodctm`) conserva datos de ese respaldo y se utilizó exclusivamente para probar la migración aditiva de compras/costos. No se escribieron pruebas en el respaldo ni en producción.

Las URL con credenciales no pertenecen al repositorio ni a este documento. La retención temporal del proyecto se observó en seis horas; el respaldo creado no tiene borrado automático, pero también debe comprobarse la recuperación y la capacidad disponible antes de una migración física.

## Condiciones necesarias antes del cambio

1. Definir una base de control para identidad, suscripciones y asignación de usuarios a sedes. Las bases operativas no deben recibir datos privados de otras empresas. El control central no debe utilizarse como respaldo silencioso si falla una conexión de sede.
2. Resolver cada conexión desde la identidad autenticada en el servidor. No confiar en IDs enviados por el navegador. Validar tanto empresa como sucursal al autenticar y bloquear destinos repetidos o no configurados.
3. Revisar accesos públicos (tienda, catálogo, registro de clientes), eventos e impresión y todos los procesos programados. La separación debe cubrirlos además de los controladores autenticados.
4. Definir la gestión de usuarios y permisos del control central y su coherencia con cada base operativa. También la consulta consolidada autorizada de varias sedes y la creación de nuevas sedes.
5. Provisionar destinos con permisos y credenciales separados, aplicar el esquema y copiar datos con IDs, referencias, saldos y secuencias conservados. Validar todas las dependencias y rechazar registros que apunten fuera del destino esperado.
6. Comprobar conteos y huellas por tabla, totales de pedidos, pagos y movimientos, saldos de cartera, inventario, claves de idempotencia y relaciones. Probar explícitamente que un usuario de una empresa/sede no puede leer ni escribir en otra.
7. Preparar un corte controlado de escrituras o una sincronización de cambios; una copia tomada mientras siguen entrando ventas no basta para cambiar las conexiones. Comprobar los cambios posteriores a la copia antes del corte.
8. Cambiar una sede verificada y observar su funcionamiento antes de ampliar. Mantener el origen preservado. Si el destino recibe nuevas operaciones, volver a la base anterior exige conciliar y trasladar esas operaciones; cambiar solo la URL perdería las escrituras nuevas.

## Entregas aún pendientes

El enrutamiento y la migración física por sede, crédito desde el POS con cobros por caja, devoluciones parciales/reembolsos y sus efectos en inventario, puntos, caja y reportes no están terminados. No deben presentarse como publicados por las entregas de Excel, antigüedad, órdenes de compra o costos históricos.
