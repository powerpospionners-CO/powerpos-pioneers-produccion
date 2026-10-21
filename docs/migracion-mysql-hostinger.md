# Preparación de MySQL en Hostinger

Estado al 20 de octubre de 2026: migración solicitada; compra de Hostinger en proceso, sin acceso al destino confirmado. Esquema validado, sin migración de datos ni cambio de producción. Producción sigue utilizando PostgreSQL en Neon, cuyo proyecto muestra agotada la transferencia mensual. El usuario no autoriza contratar una ampliación en Neon. No cambiar `DATABASE_URL` ni ejecutar el historial PostgreSQL contra MySQL.

## Preparado

`api/scripts/prepare-mysql-schema.cjs` genera un esquema independiente en `api/prisma/mysql/schema.prisma`, con `MYSQL_DATABASE_URL` y un cliente separado. Mantiene el esquema PostgreSQL que usa producción. Convierte los dos campos de listas de texto (`usos`, `exclusiones`) en JSON y los textos no indexados en LongText para evitar la conversión implícita a VARCHAR(191). El esquema valida con Prisma 5.22. El SQL de creación inicial, sin datos, está en `api/prisma/mysql/schema-inicial.sql`.

El borrador no significa que la aplicación ya pueda funcionar contra MySQL. Antes de la carga hay que comprobar la versión y capacidades reales del servidor (incluido si el servicio utiliza MariaDB), zona horaria UTC, utf8mb4, comparación de texto, tamaño máximo de bases, conexiones y paquetes, acceso remoto seguro y compatibilidad de la API Node.js.

## Adaptaciones pendientes

- Sustituir bloqueos `pg_advisory_xact_lock`, conversiones `::integer` y comillas de identificadores. Las ventas y los cierres de caja deben continuar serializados en la misma transacción, también con varias instancias. Un bloqueo MySQL por conexión sin liberación asegurada no es un reemplazo suficiente.
- Adaptar el cliente Prisma de la aplicación y sus tipos para campos JSON que antes eran listas. Revisar filtros, valores nulos y cargas de listas. No sobrescribir el cliente productivo durante las pruebas.
- Comprobar longitudes de todos los campos indexados y colisiones por comparación de texto: MySQL puede tratar mayúsculas/acentos de forma distinta. Ninguna fila puede truncarse ni descartarse para hacer caber el esquema.
- Migrar IDs, referencias, fechas, decimales, JSON, listas, imágenes/rutas y secuencias de autoincremento. Verificar relaciones y totales; conservar las contraseñas cifradas existentes sin pedirlas ni recrear usuarios.
- Definir bases y credenciales operativas independientes por sede y una gestión central coherente de identidad, permisos y suscripciones. La copia de datos y el cambio de motor no sustituyen el aislamiento por sede.
- Probar ventas, caja, inventario, compras, crédito, devoluciones, puntos, reportes, eventos, impresión y tareas programadas contra el destino real antes de activar la migración.

## Exportación preparada

`node api/scripts/export-migracion-mysql.cjs --plan` muestra la cobertura sin conectarse.
El exportador incluye las 59 tablas del modelo actual, incluidos el registro de bases y
las tablas de control. Cada base independiente debe exportarse por separado.
Para exportar una base accesible, configurar `MIGRACION_ORIGEN_URL` de forma privada y
ejecutar el script con `control` o `sede-EMPRESA-SUCURSAL` como argumento. Si no se indica
esa variable, usa la conexión de `api/.env`. No poner conexiones en argumentos ni en Git.

La exportación lee una transacción PostgreSQL RepeatableRead de solo lectura,
conserva decimales y timestamps como texto, cifra con AES-256-GCM, escribe archivos nuevos
en `.tools/respaldos/` y comprueba que la copia se descifre sin cambios. Guardar la clave
`.private` en un lugar privado separado del respaldo cifrado. No es una importación MySQL,
no congela ventas y no sustituye el corte final. No imprimir contenido de los respaldos.
El código de carga debe adaptar las conexiones cifradas del registro central al destino;
copiarlas literalmente mantendría referencias a Neon.

Las dos pruebas del exportador pasan con datos simulados. No hay un respaldo completo
reciente encontrado en `.tools/respaldos`; las copias puntuales de cierres y una venta
no son suficientes para migrar. Una conexión local de prueba falló. Es imprescindible
obtener una exportación actual de Neon o un respaldo completo comprobado; comprar otro
hosting no desbloquea el origen ni permite recuperar por inferencia ventas ausentes.

## Corte y recuperación

Crear bases nuevas vacías para ensayo; conservar Neon y su respaldo. Comparar conteos y huellas de datos por tabla, saldos y totales por empresa/sede. Preparar un corte controlado de escrituras o sincronización del último cambio antes de cambiar el destino. Mantener el origen preservado. Si hay escrituras en el nuevo destino, una reversión exige recuperar también esas operaciones; no basta con volver a la URL anterior.

No se compra ningún servicio, se importan datos ni se cambia DNS como parte de esta preparación.
