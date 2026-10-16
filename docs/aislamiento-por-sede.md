# Separación física por sede: trabajo pendiente

## Alcance acordado

Cada sucursal deberá tener su propia base operativa. Actualmente existen dos empresas, cada una con una única sucursal principal (empresa/sucursal 1/1 y 2/2). La aplicación productiva todavía usa una base compartida. No se ha cambiado su conexión ni se ha activado el aislamiento físico.

La facturación electrónica queda fuera de esta ampliación. Los cajeros están autorizados para operar crédito y devoluciones. La ampliación de estos flujos se prueba por separado del cambio de conexiones. Los traslados no se habilitan mientras las empresas solo tengan su sede principal.

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

El diagnóstico `node scripts/auditar-aislamiento-sedes.cjs` lee únicamente IDs, claves de relación y campos de alcance dentro de una transacción de solo lectura. No copia ni cambia datos. Revisa referencias entre empresas, señala relaciones ambiguas y limita el volumen de registros para no cargar historias completas sin control. La ejecución del 16 de octubre revisó 55 modelos y confirmó las sedes 1/1 y 2/2 sin referencias inconsistentes en ese diagnóstico. Identificó fuera del alcance de empresa una configuración de planes, un usuario de control y 16 auditorías. Esos registros requieren tratamiento de control; no deben copiarse indiscriminadamente a las bases operativas. El diagnóstico no demuestra aislamiento físico ni sustituye verificar saldos, dependencias por sede y escrituras concurrentes.

El enrutamiento y la migración física por sede siguen pendientes. `api/src/prisma/sede-databases.ts` aporta el registro de destinos: rechaza compartir una base con el control u otra sede (también detecta aliases de pooling), exige destinos configurados y bloquea sedes sin asignación. No está conectado a PrismaService ni activa separación por sí solo. Sus pruebas no sustituyen la migración de datos, el enrutamiento autenticado, los procesos programados ni las pruebas de aislamiento reales.

Crédito y devoluciones tienen una migración aditiva independiente (`20261016020000_credito_devoluciones`). Se probó en la copia de Neon: las 54 tablas previas conservaron sus huellas. También se comprobó el recorrido real de venta a crédito, abono, devolución parcial, liquidación y devolución total, con saldos finales de inventario, cartera y caja correctos. Todos los datos de ese recorrido se revirtieron. El estado de publicación debe verificarse en los despliegues; estas pruebas no implican que el aislamiento físico esté publicado.
