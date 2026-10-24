# Acceso limitado a códigos de barras y auditoría

En Configuración → Usuarios, un ADMIN_EMPRESA puede generar o revocar el código
de un CAJERO activo de su empresa. Cada código nuevo invalida las sesiones
anteriores. El código tiene ocho dígitos, se muestra una vez y se guarda con
bcrypt. Cinco intentos en quince minutos; el límite vive en la base, compartido
entre procesos. Las sesiones adicionales duran treinta minutos y sus tokens
aleatorios solo se guardan como hash. El navegador los conserva únicamente en
memoria: al salir de la pantalla se vuelve a pedir el código.

La pantalla Productos · Códigos permite buscar productos activos, filtrar los
que no tienen código y escanear con una pistola que escribe como teclado.
La API acepta exclusivamente codigoBarras y el valor anterior. Valida empresa,
sesión, duplicados de productos/sabores/presentaciones y cambios concurrentes.
No permite editar nombre, precio, costo, existencias ni eliminar productos.
El cambio y su auditoría local se confirman en una transacción.

La autorización y las sesiones se representan como eventos versionados en la
tabla de auditoría existente de la sede; no requieren una migración de esquema.
Sus hashes se excluyen de los listados de auditoría. No se modifica el rol ni
se conceden permisos generales de productos al cajero.

La vista Auditoría del ADMIN_EMPRESA consulta exclusivamente su empresa en el
registro central ActividadSistema. Incluye solicitudes autenticadas que llegan
a los interceptores, consultas, navegación, inicios de sesión confirmados y
cierres de sesión explícitos. Las denegaciones de guardas previas al interceptor,
las tareas automáticas sin usuario y cierres de navegador no generan esta
telemetría. No reconstruye actividad anterior a su activación. Los eventos
guardan identidad, sede, ruta sin query, método, resultado y nombres de campos;
nunca cuerpos completos, contraseñas, PIN ni cabeceras de autenticación. Para
códigos de barras también registra valor anterior y nuevo. Un fallo al guardar
telemetría HTTP se registra en el log y no repite la operación de negocio.

Verificación: pruebas de autorización, caducidad, límite de intentos y aislamiento;
flujo HTTP real en bases desechables PostgreSQL y MariaDB mediante
api/test/pos-integracion.cjs. Nunca usar ese script contra producción.
