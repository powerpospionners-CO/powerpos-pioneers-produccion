# Preparación de MySQL en Hostinger

Estado al 21 de octubre de 2026: Hostinger contratado y acceso confirmado. Producción sigue utilizando PostgreSQL en Neon; no se ha cambiado DNS ni el destino productivo. El usuario no autoriza contratar una ampliación en Neon. No ejecutar el historial PostgreSQL contra MySQL.

## Comprobación del destino

### Avance posterior: copia real y ensayo

Se autorizó acceso temporal únicamente desde la IP pública del computador del usuario,
sin habilitar «Cualquier host». Las tres conexiones remotas verificaron TLS con validación
estricta. Una copia nueva quedó en `.tools/respaldos/migracion-2026-10-21T08-30-09-134Z`.
Sus tres bases se importaron en Hostinger y pasaron comparación completa de filas y claves
foráneas: control 3207, Trailer 758 y Enchila 3854 registros, 59 tablas de datos por base.
Los informes privados por tabla están junto al respaldo. Las 60 tablas y las 112 relaciones
se comprobaron por conexión directa en cada destino.

Después de la comparación, el control nuevo se suspendió y sus dos rutas quedaron
VERIFICADA, sin activación. Sus conexiones se volvieron a cifrar para el servidor interno
127.0.0.1 de Hostinger usando la clave privada preservada. Estas modificaciones del
registro central son intencionales y posteriores a la comparación con el origen.

Se verificaron el sello de cada sede, su única empresa y sucursal y los autoincrementos.
El cliente pudo leer los 60 modelos. La API adaptada comprobó modo estricto, UTC y rollback
en una transacción real. En cada sede pasó un ensayo real de venta, crédito, descuento de
existencias e idempotencia, revertido íntegramente; no se enviaron correos ni impresiones.
Los IDs autoincrementales pueden tener huecos por esas transacciones revertidas.
Se copiaron 477 imágenes públicas referenciadas, con manifiesto SHA-256; falta colocarlas
en el almacenamiento de la aplicación nueva y verificar su persistencia.

El usuario confirmó que ambas empresas estaban cerradas. Aun así, el origen no se ha
suspendido: no se hará hasta tener lista y comprobada la aplicación destino para reducir
la indisponibilidad. Antes del corte hay que verificar que el origen siga coincidiendo,
copiar la configuración privada vigente, probar el servicio completo y resolver cualquier
cambio posterior al respaldo. La consola de Railway permite ver el proyecto en el listado,
pero al abrirlo devuelve 404; se requiere recuperar el acceso o copiar sus variables al
archivo local privado `.tools/railway-produccion.private.env`.

Las pruebas de regresión actuales de prisma, caja, pedidos, notificaciones y tareas pasan:
21 suites, 140 pruebas. La compilación MySQL pasa. Ni el DNS ni producción han cambiado.

### Apertura de Enchila y archivos persistentes

Ante la apertura próxima se comprobó de nuevo producción: raíz de API HTTP 200, POS de
Enchila HTTP 200, control PostgreSQL accesible con aislamiento activo y escrituras NO
suspendidas. Las dos sedes productivas respondieron con sellos correctos (Enchila 509
productos, Trailer 51). `/health` devuelve 404 en la API vigente: esa ruta no está
implementada y no equivale a caída del servicio. No se realizó corte ni pausa del origen.

El usuario tampoco puede entrar al proyecto de Railway: aparece 404. Sigue pendiente
recuperar su configuración privada. No se debe sustituir por claves inventadas ni omitir
el correo para declarar terminada la migración.

Las 477 imágenes originales ocupan aproximadamente 1 GB. Se inició la subida del archivo
`uploads-hostinger.zip` en la raíz NO pública del administrador de archivos del sitio.
La carga aún no ha finalizado; conservar su pestaña. Después hay que extraer únicamente
`uploads/` en `public_html/`, verificar las huellas y configurar `UPLOADS_PATH` como
`/home/u748056473/domains/mediumslateblue-pheasant-593602.hostingersite.com/public_html/uploads`.
La aplicación Node corre en `hbuilds/current/nodejs`, una ubicación de despliegue mutable,
según su `.htaccess`; las imágenes deben permanecer fuera de ella. El servidor estático y
los cuatro destinos de subida utilizan ahora la misma raíz configurable, con el valor
anterior como predeterminado. Pasan 7 suites / 30 pruebas de almacenamiento, empresa,
productos y catálogo, además de la compilación MySQL.

Si Enchila vuelve a operar, el respaldo importado queda como ensayo: hay que incorporar
sus operaciones nuevas con un corte verificado posteriormente. Nunca activar esta copia
como si incluyera ventas posteriores al respaldo.

Actualización de archivos: la subida de `uploads-hostinger.zip` terminó. Se extrajo sin
sobrescritura en la carpeta privada `imagenes-migracion` y se movió su carpeta `uploads`
a `public_html/uploads`; se confirmó su presencia en el administrador de archivos.
El ZIP original permanece fuera de `public_html`. Tres imágenes de muestra responden HTTP
200 con tipo JPEG a través del dominio temporal. Sus bytes difieren del respaldo y el
servidor indica `hcdn`: puede intervenir la optimización de imágenes, pero todavía no se
ha confirmado la igualdad de hashes en disco. Una comprobación directa TLS contra la IP
del servidor MySQL falló EPROTO; no se desactivó la validación TLS ni se asumió que esa IP
fuera el origen web. Falta configurar UPLOADS_PATH y verificar el almacenamiento completo.

### Preparación inicial (histórico)

El usuario creó `u748056473_ppcontrol`, `u748056473_pptrailer` y `u748056473_ppenchila`, cada una con un usuario independiente. Las contraseñas no se registran en este documento.

Hostinger utiliza MariaDB 11.8.9 e InnoDB. Tras comprobar que los destinos estaban vacíos, se creó la estructura inicial en las tres bases. Control y Enchila tienen 60 tablas InnoDB con `utf8mb4_unicode_ci` y 112 claves foráneas, verificadas en information_schema. La ejecución DDL del Trailer terminó sin error; falta comprobar sus conteos con una nueva sesión propia. Se cambió el valor predeterminado de caracteres de las bases nuevas a utf8mb4. No se importaron filas de producción.

La configuración inicial del servidor no incluía modo estricto y usaba utf8mb3 por defecto. La sesión de creación activó STRICT_TRANS_TABLES; esto no configura las conexiones futuras de la API. Antes de importar o habilitar el servicio hay que garantizar modo estricto y validar las conexiones reales del cliente.

La aplicación temporal de Hostinger ejecuta únicamente `hostinger-preparacion`, sin acceso a bases ni operaciones productivas. `/health` informa que la migración no está completada.

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

Las dos pruebas del exportador pasan con datos simulados. Se completaron y verificaron
dos conjuntos de copias cifradas de las tres bases. El más reciente está en
`.tools/respaldos/migracion-2026-10-21T06-39-37-983Z`: control 3207 filas, Trailer 758
y Enchila 3854, con 59 tablas por base. Las claves permanecen privadas y excluidas de Git.
Estos respaldos no incluyen los archivos binarios de imágenes; deben copiarse por separado.
`api/scripts/import-migracion-mysql.cjs` valida los tres respaldos actuales sin conexión:
esquema, columnas, IDs, tipos, precisión temporal y referencias. Sus seis pruebas más las
dos del exportador pasan. El modo de aplicación requiere `MYSQL_DATABASE_URL` privada y
`--apply`; rechaza destinos con filas, tablas ajenas, motores sin transacciones o comparación
incompatible. Carga y compara todas las filas en una transacción, revisa huérfanos y restaura
las comprobaciones de claves foráneas incluso ante error. No habilita la API. No se ha
ejecutado ese modo contra MariaDB; aún requiere prueba real, permisos de conexión, preparar
el registro central de sedes y verificar el autoincremento. El archivo local de credenciales
`.tools/migracion-hostinger.private.json` está excluido de Git y pendiente de completar por el
usuario. No habilitar acceso desde cualquier host.

Hace falta otra copia final con las escrituras detenidas antes del corte.

## Corte y recuperación

Crear bases nuevas vacías para ensayo; conservar Neon y su respaldo. Comparar conteos y huellas de datos por tabla, saldos y totales por empresa/sede. Preparar un corte controlado de escrituras o sincronización del último cambio antes de cambiar el destino. Mantener el origen preservado. Si hay escrituras en el nuevo destino, una reversión exige recuperar también esas operaciones; no basta con volver a la URL anterior.

Hasta aquí solo se creó estructura vacía en las tres bases nuevas; no se importaron datos de producción ni se cambió DNS.
