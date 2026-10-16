# Preparación de MySQL en Hostinger

Estado: borrador compatible de esquema, sin migración de datos ni cambio de producción. El usuario todavía no ha comprado el plan. Producción sigue utilizando PostgreSQL en Neon. No se debe cambiar `DATABASE_URL` ni ejecutar el historial PostgreSQL contra MySQL.

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

## Corte y recuperación

Crear bases nuevas vacías para ensayo; conservar Neon y su respaldo. Comparar conteos y huellas de datos por tabla, saldos y totales por empresa/sede. Preparar un corte controlado de escrituras o sincronización del último cambio antes de cambiar el destino. Mantener el origen preservado. Si hay escrituras en el nuevo destino, una reversión exige recuperar también esas operaciones; no basta con volver a la URL anterior.

No se compra ningún servicio, se importan datos ni se cambia DNS como parte de esta preparación.
