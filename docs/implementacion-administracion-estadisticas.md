# Administración y estadísticas: alcance y activación

Cambios preparados el 15 de octubre de 2026. Publicación autorizada por el usuario mediante GitHub hacia Vercel y Railway; verificar el estado efectivo de cada despliegue en esos servicios.

## Implementado en esta etapa

- `/administracion`: proveedores, obligaciones por pagar/cobrar, vencimientos, abonos, conciliación bancaria manual y presupuesto mensual contra egresos.
- Gastos recurrentes mensuales: plantillas de arriendo, servicios y otros gastos; generación manual de una obligación por plantilla y mes, sin pagos automáticos. Permite cambiar el valor para meses futuros y desactivar plantillas. Un vencimiento en día 31 se ajusta al último día de los meses más cortos. Las obligaciones existentes conservan su valor y repetir la generación no las duplica, incluidas las anuladas.
- Conteos físicos de productos: solicitud con existencias esperadas y contadas, resolución por ADMIN_EMPRESA e historial de ajustes dentro de una transacción. Registrar o rechazar un conteo no cambia existencias. La aprobación se rechaza si cambió el stock después de contar. Se conserva el inventario actual de la única sede por empresa que confirmó el usuario; no se redistribuyó entre sedes.
- `/compras`: proveedor opcional y compras a crédito, únicamente para empresas habilitadas. Una compra a crédito recibe inventario y crea una obligación sin generar un pago; cada abono registra su egreso. El flujo de contado conserva su comportamiento.
- `/estadisticas`: filtros de fechas y sucursal/consolidado, ventas, ticket promedio, descuentos, anulaciones, distribución horaria y diaria, comparación con el periodo anterior de igual duración, medios de pago y diez productos por subtotal.
- Reintentos de ventas aislados por empresa; edición del pago protegida por el mismo bloqueo del cierre y auditoría dentro de su transacción.
- Consumo de inventario guardado en cada venta nueva para restituir las cantidades originales al anular, aunque después cambien recetas o combos.
- Cola offline: conserva ventas agregadas durante la sincronización; mantiene pendientes los errores transitorios; falla explícitamente si el almacenamiento no permite respaldar una venta.
- Registro de empresa, sucursal y administrador en una sola transacción.

## Límites explícitos

La cartera manual registra saldos que aún no fueron contabilizados como pagos/recaudos. No convierte ventas históricas pagadas en ventas a crédito, ni recibe inventario. La cuenta por pagar creada desde Compras sí queda vinculada a su compra. No se puede anular esa obligación aisladamente de la mercancía recibida. Los abonos y movimientos conciliados no se pueden editar o eliminar desde Financiero: requieren un procedimiento posterior de reversión documentada.

Los abonos manuales se clasifican como OTROS; los de compras conservan la categoría de la compra. Los indicadores financieros existentes siguen siendo operativos, no contabilidad de causación ni estados financieros certificados. Los presupuestos comparan egresos registrados, no cuentas pendientes de pago. No se importan extractos ni se concilia automáticamente.

Las ventas históricas no tienen el nuevo consumo guardado. Conservan el procedimiento anterior de anulación; no se inventa un historial de recetas que la base no contiene. Las recetas y combos cambiados antes de esta actualización requieren revisión al anular ventas antiguas.

La cola offline usa almacenamiento del navegador. La sincronización tiene bloqueo entre pestañas cuando el navegador soporta Web Locks y evita envíos concurrentes dentro de la misma pestaña. Esto no sustituye una base local durable con control de concurrencia completo. No borrar datos del navegador con ventas pendientes.

La pantalla administrativa muestra hasta 500 proveedores/cuentas y 1.000 movimientos por consulta; los totales de obligaciones se calculan sobre todas las cuentas. Las estadísticas admiten hasta 93 días y rechazan consultas con más de 50.000 ventas entre el periodo seleccionado y el anterior; no truncan el resultado silenciosamente. Requiere acceso Reportes, y el endpoint está restringido a ADMIN_EMPRESA y GERENTE.

Las estadísticas usan días de Colombia e incluyen días sin ventas en los promedios. Las anulaciones se agrupan por la fecha original de la venta, no por la fecha de anulación. Productos muestra subtotales antes del descuento general, incluidos adicionales y sin domicilio. La cantidad de granel se conserva en la unidad base registrada. No se presenta margen histórico por producto usando su costo actual, ni se etiqueta una venta como factura electrónica validada.

## Activación controlada

1. Respaldar la base y comprobar que se puede restaurar. Preparar una copia aislada de producción, sin conexiones a impresoras, correos o pagos reales.
2. Revisar y aplicar **en esa copia** la migración `20261015200000_controles_administrativos`, junto con las migraciones anteriores que aún no estén aplicadas. No usar `db push`, `migrate reset` ni modificar migraciones ya aplicadas.
3. La migración agrega tablas, campos opcionales y `condicionPago=CONTADO` a compras existentes. No borra registros ni redistribuye inventario. Aun así, ALTER TABLE toma bloqueos: medir la duración en la copia antes de programarla en producción.
4. Generar el cliente Prisma y compilar la API y la web. La nueva API requiere la migración antes de arrancar, aunque el módulo administrativo permanezca apagado.
5. Para el piloto, definir `ADMINISTRACION_HABILITADA=true` en el servidor de pruebas. En Superadmin habilitar Controles administrativos y Financiero para una sola empresa; conservar los demás permisos. Volver a iniciar sesión para refrescar la navegación.
6. Verificar aislamiento con dos empresas y roles distintos; venta, reintento, pago mixto, cierre, anulación, compra de contado y crédito, abono parcial/total, sobrepago, conciliación y presupuesto. Comparar estadísticas contra pedidos y pagos conocidos, incluidos límites de medianoche.
7. Solo después de validar el piloto, preparar un despliegue separado con respaldo, ventana de migración, versión anterior disponible y seguimiento de errores. No habilitar masivamente por cambiar el plan a PREMIUM.

Desactivación: quitar el permiso `administracion` de las empresas o cambiar la variable a `false`. Esto suspende las operaciones nuevas; no elimina obligaciones ni abonos. Antes de retroceder a una versión antigua de la API, considerar que esa versión no conoce los bloqueos sobre movimientos administrativos. No eliminar las tablas para revertir la aplicación.

## Validación realizada

- Esquema Prisma validado y cliente generado localmente.
- Comprobación TypeScript de API y web.
- Pruebas de regresión y nuevas pruebas de aislamiento, anulaciones con consumo guardado, cierre/edición de pago, cola offline, obligaciones/abonos, compras a crédito y estadísticas.
- Análisis de ESLint de las dos pantallas nuevas.
- 104 pruebas aprobadas en 19 suites y 2 pruebas de impresión aprobadas en una ejecución separada con permiso de conexión local. La ejecución general usó `--forceExit` por manejadores abiertos; queda pendiente identificar su origen.
- Compilación optimizada de Next.js con webpack aprobada fuera del aislamiento; detectó caché local dañada, pero completó compilación, TypeScript y las 30 páginas. Compilación NestJS aprobada. Permanece el aviso existente de migrar `middleware` a `proxy`.
- El usuario confirmó que Neon es la base de producción y que tiene recuperación disponible. Se verificó que la única migración pendiente es `20261015200000_controles_administrativos` y que Railway ejecuta `npx prisma migrate deploy` antes del arranque.

Estas verificaciones no sustituyen la aplicación de la migración, pruebas de concurrencia con PostgreSQL real, ensayo con copia de producción y revisión visual/operativa del piloto. No se utilizó la base de producción para probar.

## Siguientes entregas del alcance administrativo original

| Entrega | Estado / dependencia |
|---|---|
| Facturación electrónica | Pendiente de elegir proveedor autorizado, documentación de API, contrato y credenciales de pruebas. |
| Crédito desde el POS | Pendiente de diseñar cobro diferido sin simular una venta pagada; la cartera manual no sustituye este flujo. |
| Devoluciones parciales, cambios y reembolsos | Pendiente; coordinar inventario, caja, puntos, documentos fiscales y notas crédito. |
| Stock por sucursal y traslados | Pendiente de definir distribución inicial real del stock global y aprobación de saldos; no repartir existencias por suposición. |
| Conteos físicos y ajustes aprobados | Implementados para productos con stock en el inventario actual de la empresa. No incluyen ingredientes, stock por sucursal ni bloqueo operativo de ventas durante el conteo. |
| Órdenes de compra y recepción parcial | Pendiente; la compra actual recibe mercancía al registrarse. |
| Aprobaciones por operación | Pendiente de definir responsables, límites y separación entre quien solicita y quien aprueba. |
| Gastos recurrentes | Implementados con generación manual e idempotente de obligaciones mensuales; no ejecutan pagos automáticos. |
| Personal, turnos, anticipos y nómina | Pendiente de reglas laborales, permisos y proveedor/integración de nómina. |
| Contabilidad completa | Pendiente de plan de cuentas, reglas de causación, periodos y elección de integración con contador. |
| Reversiones administrativas | Pendiente de flujo formal para abonos y conciliaciones erróneos; se bloquea su modificación destructiva. |

## Preparación de facturación con proveedor

La selección técnica debe confirmar soporte multiempresa por NIT, ambiente de pruebas, numeración, firma/certificados, facturas y notas, documento equivalente POS si se ofrece, idempotencia, consulta de estado, autenticidad de notificaciones, XML/respuestas/representaciones, conservación y exportación, contingencia y precios por empresa/documento.

La integración deberá conservar una configuración protegida por empresa, documentos inmutables relacionados con ventas, estados separados de venta y factura, cola persistente y reintentos. No activar `facturacionElectronicaHabilitada` hasta que la empresa y sus documentos estén habilitados y probados. El interruptor existente sigue sin constituir un emisor electrónico.

## Registro de publicación

La entrega `f431177` quedó publicada en `main`, con estado exitoso tanto en Vercel como en Railway. La web confirmó ese commit mediante `/api/version` y la API respondió HTTP 200. Neon confirmó aplicada `20261015200000_controles_administrativos`. Se habilitó `ADMINISTRACION_HABILITADA=true` en Railway; cada empresa sigue requiriendo el permiso explícito `administracion` y acceso Financiero en Superadmin. No se habilitaron empresas masivamente ni se registraron ventas o pagos de prueba en producción.

La ampliación de gastos recurrentes utiliza la migración aditiva separada `20261015210000_gastos_recurrentes`, que debe ejecutarse antes de arrancar su versión de API. Agrega una tabla y campos opcionales a cuentas existentes; no modifica saldos históricos.

La ampliación de conteos utiliza `20261015220000_conteos_inventario`, que solo agrega sus tablas e índices. Los ajustes se ejecutan únicamente al aprobar un conteo desde la aplicación. Hay que suspender los movimientos de esos productos mientras se realiza y aprueba el conteo; si cambian las existencias, se debe rechazar y volver a contar. Permite hasta 200 productos por solicitud y muestra los últimos 100 conteos. El administrador puede registrar y resolver; no se impone un aprobador distinto del solicitante, pero ambos quedan identificados en auditoría.

Se detectó que PgBouncer conservaba el bloqueo de Prisma de una migración terminada y hacía fallar la siguiente publicación. Se verificó la sesión inactiva sin transacción abierta antes de cerrarla. El comando de migración recomendado es ahora `node scripts/prisma-migrate.cjs deploy`: respeta `DIRECT_DATABASE_URL` cuando existe y, para Neon, deriva el endpoint directo del mismo destino configurado. No imprime credenciales ni cambia `DATABASE_URL` de la API. Debe reemplazar el comando anterior en Pre-deploy de Railway. No desactiva los bloqueos de seguridad de Prisma. Las recomendaciones de conexiones directas están en la [guía oficial de Neon para Prisma](https://github.com/neondatabase/website/blob/main/content/docs/guides/prisma.md).

## Referencia de estadísticas

Se tomó como referencia la captura aportada de Vector POS: ventas por hora, sucursal/consolidado y desglose de pagos. El enlace del video no pudo recuperarse durante la revisión; no se atribuyeron funcionalidades adicionales al video. Comparaciones de cuatro viernes anteriores, propinas, cortesías y estado fiscal quedan para una ampliación con datos y definiciones verificables.

## Exportaciones Excel

Administración incorpora Antigüedad de cuentas: saldos actuales por cobrar/pagar al día, 1–30, 31–60, 61–90 y más de 90 días, con cantidades, totales, gráfica y Excel. Agrega todas las cuentas abiertas de la empresa, sin el límite de 500 de la lista operativa, excluye anuladas y saldadas y considera vencimiento al finalizar el día de Colombia. Las consultas usan una instantánea consistente y mantienen los permisos administrativos. No reconstruye saldos históricos ni registra movimientos. No requiere migración.

Reportes avanzados, Financiero y Estadísticas permiten descargar libros XLSX con encabezados PowerPOS, fecha de generación en Colombia, tablas con filtros, filas alternadas, encabezados inmovilizados y valores monetarios numéricos en COP. Las gráficas se incluyen como imágenes; no son gráficas nativas que se recalculen al editar el libro. Las tablas contienen todos los registros devueltos por los reportes; los rankings gráficos muestran hasta 12 categorías y lo indican. Horas incluye las 24 horas y diario hasta los 93 días admitidos.

Estadísticas exporta los filtros aplicados a los datos cargados (no los cambios del formulario pendientes de consultar). Financiero utiliza el periodo del resumen, también para la hoja de movimientos, independiente del filtro secundario de movimientos de la pantalla. Reportes avanzados conserva el alcance de la pantalla: empleados y clientes históricos, comparativas de semana/mes y rentabilidad estimada con costos actuales. Las exportaciones solo consultan datos, mantienen el alcance por empresa y requieren administrador o gerente. No agregan migraciones.
