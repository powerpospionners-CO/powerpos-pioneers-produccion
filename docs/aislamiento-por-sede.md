# Separación física por sede

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


## Implementación preparada el 16 de octubre de 2026

El enrutamiento utiliza la empresa y sede del JWT validado y AsyncLocalStorage. Cada base tiene un usuario operativo distinto sin permisos de crear roles/bases ni conectarse a otras sedes. Un sello valida el destino. La falta de conexión o de sello bloquea la operación; nunca se utiliza el origen como alternativa. La base central conserva el origen histórico, la política de suscripciones y el directorio de sedes. Los usuarios operativos se gestionan en su base; el superadministrador consulta/edita usuarios con empresa y sede explícitas. Los perfiles globales requeridos por referencias históricas se copian inactivos, sin credenciales ni email reales.

Las conexiones se guardan cifradas con AES-256-GCM y una clave externa `SEDE_DATABASE_ENCRYPTION_KEY` de 64 caracteres hexadecimales en Railway. La identidad de empresa/sede autentica el cifrado. No publicar esta clave ni las conexiones. Conservar la clave junto a los respaldos de configuración, fuera de Git.

Las tiendas públicas, impresión, eventos de pedidos y procesos programados utilizan la misma separación. Las sedes nuevas comienzan sin inventario ni ventas y se habilitan solo después de provisionar y verificar su base. Un alta fallida conserva el registro pendiente; Configuración permite reintentar. La selección de sede ocurre al iniciar sesión si las mismas credenciales son válidas en varias bases. Para trabajar en otra sede se debe iniciar sesión en ella. No se habilitan traslados ni consolidación entre bases por inferencia.

### Evidencia de pruebas

En la rama de prueba se copiaron y compararon los valores de todas las columnas de 54 tablas operativas: 57 registros en la sede 1/1 y 3.068 en la sede 2/2. El origen conservó sus huellas. La activación verificó con conexiones reales que una credencial operativa no puede conectarse a la otra base ni leer las tablas del origen. La API completa arrancó con aislamiento activo. El recorrido HTTP probó elección de sede, login, lectura de la propia empresa y escritura de categoría, ignorando IDs ajenos enviados en el cuerpo. Las categorías/usuarios temporales se eliminaron al terminar. Preparaciones respondió 200 en ambas empresas. Estas pruebas ocurrieron exclusivamente en la rama de prueba; no prueban por sí mismas el estado de producción.

### Corte de producción

1. Desplegar el código y la migración aditiva con aislamiento deshabilitado. Configurar la clave externa y confirmar la versión activa en Railway. Las migraciones posteriores verifican control y todas las sedes activas antes de permitir el nuevo despliegue.
2. Crear un respaldo inmutable actualizado del origen en Neon. No escribir en respaldos.
3. Ejecutar `node scripts/control-aislamiento.cjs suspender --production` en el servicio de Railway. El bloqueo usa el mismo advisory lock que las escrituras HTTP y automáticas; esperar a que `operacionesEnCurso` sea cero. No eliminar registros de operaciones pendientes para forzar el corte.
4. Ejecutar `node scripts/aislar-sedes.cjs --production`. Solo admite el caso confirmado de una sede por empresa. Copia IDs, valores, saldos, fechas, JSON y secuencias; compara huellas y referencias. Nunca trunca un destino existente ni elimina origen/destinos ante un fallo.
5. Ejecutar `node scripts/control-aislamiento.cjs activar --production`. Vuelve a comparar el origen con cada destino, comprueba cobertura, sellos y permisos reales. La activación de registros y del enrutamiento ocurre en una transacción, junto con la reanudación de escrituras.
6. Reiniciar el servicio para reconectar los canales de eventos/impresión abiertos antes del corte. Verificar lecturas autenticadas por empresa y las conexiones activas. Guardar la evidencia del despliegue y del corte antes de informar que está terminado.

Si falla la copia antes de activar, `node scripts/control-aislamiento.cjs reanudar --production` devuelve las escrituras al origen sin borrar copias. Después de activar y recibir operaciones nuevas está prohibido desactivar el enrutamiento o volver a una versión anterior que use el origen: antes hay que reconciliar las nuevas operaciones. El comando rechaza una reanudación sobre el origen cuando ya existe aislamiento activo.
