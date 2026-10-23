# Operación y validación — 23 de octubre de 2026

## Cambios preparados en el repositorio

- Autenticación entrega `permisos` de empresa y `permisosUsuario` por separado. La API vuelve a consultar el usuario en cada autenticación JWT; los permisos individuales solo restringen lectura/edición. El plan y los roles siguen siendo obligatorios. La navegación oculta módulos individualmente denegados; la API es la autoridad incluso con sesiones antiguas.
- Para el cajero, consultar el catálogo del POS, configuración de comandas y búsqueda de clientes usa el permiso de POS. Esto conserva las dependencias de la venta sin conceder edición de productos ni acceso administrativo; los límites del plan siguen aplicándose.
- Login y registro rechazan estructuras incorrectas, campos inesperados y entradas fuera de límite. El registro exige contraseña de al menos 10 caracteres y máximo 72 bytes por bcrypt. Login conserva espacios de la contraseña. Los límites son 30 accesos y 5 registros por IP cada 15 minutos.
- Sin canal compartido el limitador es local al proceso. Con `EVENTOS_COMPARTIDOS=true` utiliza transacciones y bloqueos de la base central para contar intentos entre procesos.
- `TRUSTED_PROXIES` admite una lista explícita de IPs/redes confiables. No configurar `true` ni confiar arbitrariamente en `X-Forwarded-For`. Sin configuración se utiliza la dirección de la conexión y varios usuarios detrás de un proxy pueden compartir límite; confirmar la red del proxy en el servidor.
- `/health` comprueba el proceso. `/health/ready` comprueba conexión central, estado de mantenimiento y disponibilidad de la tabla de eventos cuando está habilitada. No demuestra disponibilidad de todas las sedes ni de una impresora física.
- La cola offline rechaza almacenamiento ilegible sin sobrescribirlo. Conserva los datos del navegador para recuperarlos; no limpiar el perfil del puesto como primera solución. El modo offline cubre interrupciones breves y sigue dependiendo del almacenamiento local.
- Las reglas de pagos/costos y calendario de caja se separan de los servicios grandes para facilitar mantenimiento.

## Activar el canal compartido

El valor predeterminado conserva el canal local para permitir un despliegue compatible antes de migrar. No activar múltiples procesos mientras esté deshabilitado. `WEB_CONCURRENCY>1` se rechaza si falta `EVENTOS_COMPARTIDOS=true`; el administrador debe declarar el número real de procesos, incluido el del gestor externo.

1. Verificar copia de bases y archivos y ensayar restauración en un destino aislado. Mantener el origen operativo hasta programar el corte.
2. Aplicar la tabla `eventos_sistema` en control y en cada base de sede. En PostgreSQL corresponde a `20261023010000_eventos_compartidos/migration.sql`; en MariaDB corresponde a `api/prisma/mysql/eventos-compartidos.sql`. No ejecutar el historial de otro motor. Las sedes PostgreSQL deben recibir el mismo conjunto de migraciones; un `migrate deploy` contra control no migra otras conexiones.
3. Desplegar el cliente Prisma regenerado. `npm run build:mysql` prepara el cliente MariaDB; `npm run build` selecciona motor con `DATABASE_ENGINE`.
4. Activar `EVENTOS_COMPARTIDOS=true` en todos los procesos que atienden el mismo sistema. No mezclar procesos con canal local y compartido. Comprobar `/health/ready`, venta/cocina y confirmación del agente por sede.
5. Mantener los trabajos programados en un solo proceso (`BACKGROUND_JOBS_ENABLED=true`); usar `false` en las réplicas. El proceso programado limpia eventos vencidos con más de 24 horas.

Los consumidores consultan cada 500 ms el canal de su empresa y sede. Cocina recibe los eventos vivos durante 60 segundos; al reconectar debe recargar el listado de pedidos. La impresión reclama cada trabajo con actualización atómica y no lo reentrega al reconectar si ya fue reclamado. La confirmación se conserva en la base compartida y admite que otro proceso la reciba. Una impresora física no permite garantizar exactamente una impresión ante un corte posterior al envío: los casos inciertos requieren revisar papel antes de reintentar.

El canal reduce la dependencia de un proceso, pero no reemplaza el inventario ni la venta transaccional. Si publicar un evento de pedido falla después del commit, la venta se conserva y se registra el error; refrescar el listado recupera su estado. Supervisar ese error. Evitar réplicas lectoras con retraso para este canal.

## Comprobar servicio y respaldos

`npm run verificar:operacion` lee `POWERPOS_HEALTH_URL` (terminada en `/health/ready`) y/o `BACKUP_MANIFEST_PATH`. Devuelve JSON y código de salida 1 si falla, para conectarlo al monitor del servidor. `BACKUP_MAX_HOURS` permite cambiar el máximo predeterminado de 36 horas.

El manifiesto debe acompañar los archivos cifrados y tener este formato:

```json
{
  "creadoEn": "2026-10-23T12:00:00.000Z",
  "archivos": [
    { "ruta": "control.enc", "bytes": 12345, "sha256": "HASH_SHA256_DE_64_CARACTERES" }
  ]
}
```

Generarlo al finalizar el respaldo con tamaños y hashes reales. Se comprueban antigüedad, existencia, tamaño e integridad. No se descifran archivos ni se imprime su contenido. Esto no acredita una restauración exitosa: ensayar la restauración por separado. La programación, destino de alertas, frecuencia y ubicación privada del manifiesto deben configurarse en el servidor; el repositorio no las activa automáticamente ni envía mensajes a terceros.

## Pruebas

- `api`: `npm test -- --runInBand`, `npm run test:e2e -- --runInBand`, `npm run test:operacion`, `npm run build:mysql`.
- `web`: `npm run lint`, `npm run build`.
- `desktop`: `npm test`, `npm run smoke`; si el equipo no soporta capturas usar `POWERPOS_SMOKE_CAPTURE=0`, que sigue comprobando ventana, IPC y aislamiento.
- `npm run test:pos` requiere `POS_TEST_DATABASE_URL` apuntando exclusivamente a `powerpos_pos_test` en `127.0.0.1:55439` (PostgreSQL) o `127.0.0.1:55440` (MariaDB), con esquema ya creado. Rechaza destinos remotos y no lee el `.env` productivo. Crea datos nuevos y conserva los resultados hasta descartar la base efímera; no usar una base de trabajo.

El flujo POS incluye apertura, venta, reintento idempotente, crédito, cobro, devolución con reposición, cierre y comparación de efectivo. También comprueba permisos y eventos/impresión entre dos instancias contra la misma base. En este equipo no hay un daemon Docker disponible: preparar CI no acredita que el flujo con ambos motores haya sido ejecutado localmente.

### Resultado local de esta revisión

Pasaron 59 suites / 318 pruebas de backend, 2 contratos HTTP, 2 pruebas del verificador de operación, 6 pruebas de escritorio, compilación MySQL y compilación web. La comprobación oculta de Electron pasó con `POWERPOS_SMOKE_CAPTURE=0`: la captura gráfica de este equipo devolvía `UnknownVizError`, pero ventana, puente, sandbox y aislamiento pudieron comprobarse.

El lint web terminó con cero errores y 33 advertencias. Los archivos nuevos del backend pasaron lint sin errores ni advertencias. El lint completo del backend sigue fallando: 7822 errores y 478 advertencias; 6724 errores están en archivos no modificados en esta revisión. Corregir toda esa deuda requiere una intervención adicional sobre los módulos existentes; no se desactivaron reglas para ocultarla.

La integración con bases reales está preparada para CI, pero no se ejecutó localmente por falta del servicio de bases efímeras. Tampoco se ejecutó el workflow remoto ni se desplegaron estos cambios, migraron bases de producción, programaron monitores o probaron impresoras físicas.

## Aplicación Windows

El código está en `desktop/`. Existe `desktop/dist/PowerPOS-Instalar-1.0.0.exe` (112329639 bytes). Su SHA-256 comprobado es `32fd3ec2de399f582e6eebc2ff74415286718fa5d6d9d2c11c43dd5a1c7dbc68`, coincidente con el archivo `.sha256` guardado.

Carga el POS HTTPS de la empresa y solicita bytes de impresión a la API; no contiene una base local completa. Impresoras TCP privadas por puerto 9100, cola local y verificación de origen/empresa. No requiere instalar el agente separado. El instalador no está firmado comercialmente y no tiene actualización automática del ejecutable. La interfaz web se actualiza desde el servidor. Ver `desktop/README.md` para instalación y pruebas físicas.

El instalador existente no se modifica por los cambios web/API. Antes de distribuir una nueva versión del ejecutable hay que compilarla, calcular su hash y comprobar el paquete. No afirmar impresión física o apertura detectada sin comprobar los dispositivos del negocio.
