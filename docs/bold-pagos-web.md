# Botón de pagos Bold en la tienda

Integración del checkout alojado de Bold para pedidos web. Deshabilitada hasta que el administrador configure las credenciales del comercio y el webhook. No activa ni controla el dispositivo Sono QR.

## Activación por empresa y sucursal

1. Entrar como administrador en la sucursal que recibe los pedidos de la tienda. En **Mi tienda**, habilitar pedidos y configurar zonas y tarifas de domicilio.
2. En **Pagos en línea con Bold**, ingresar el ID del comercio (`merchant_id`) y las dos llaves de **Botón de pagos, producción** desde el panel oficial de Bold. No usar llaves de API Datáfono ni compartir secretos en el chat, repositorio o capturas.
3. Guardar primero con el botón deshabilitado. Registrar en **Bold → Integraciones → Webhooks** la URL que muestra PowerPOS. Marcar que el webhook está registrado y habilitar los pagos.
4. Confirmar que en el checkout público aparece **Pagar en línea con Bold**. Las pruebas con dinero real requieren que el titular complete el pago y revise su recepción en Bold; publicar el código no acredita esa prueba.

Credenciales cifradas con AES-256-GCM y AAD de empresa, sucursal y registro. Se deriva una clave exclusiva de Bold con HKDF-SHA256 desde `BOLD_ENCRYPTION_KEY` (64 caracteres hexadecimales); si no se define, se utiliza como raíz privada `PERSONAL_ENCRYPTION_KEY`, ya existente en producción. La clave derivada es distinta de la utilizada para expedientes. Respaldar la raíz de forma privada; cambiarla requiere recifrar previamente las configuraciones. Nunca se devuelve la llave secreta al navegador. La llave de identidad pública aparece solamente en el checkout, como exige Bold.

Las versiones de configuración son inmutables; los pagos pendientes verifican la firma con la versión que originó su checkout. La tabla `bold_registros` se crea de forma aditiva al abrir la configuración autenticada de esa sede; las peticiones públicas no crean tablas. El esquema Prisma también la incluye para sedes nuevas. La disponibilidad pública se consulta con caché de 15 segundos.

## Flujo de una compra

- PowerPOS valida precios, existencias, zona y domicilio antes de guardar la solicitud. Para Bold exige un total entero de al menos $1.000 COP, sin redondear importes silenciosamente.
- El comprador conserva en su sesión una clave privada para recuperar el checkout. El total, la referencia única, el vencimiento y SHA-256 de integridad se generan en el servidor. Los datos de tarjeta se ingresan exclusivamente en Bold.
- El webhook valida HMAC-SHA256 del cuerpo original codificado en Base64, comercio, referencia, moneda y total. Los parámetros de redirección no acreditan pagos. No se aceptan firmas con clave vacía del ambiente de pruebas.
- Una notificación válida actualiza únicamente el registro del pago. **APROBADO** significa dinero confirmado por Bold, todavía pendiente de que la tienda acepte el pedido en **Domicilios**. **APLICADO** indica que se registró la venta.
- Al aceptar, venta, inventario, movimiento financiero y aplicación del pago se confirman en una sola transacción. Solicitudes concurrentes no duplican la venta. El medio financiero se obtiene del método confirmado por Bold: tarjeta, Nequi o transferencia (PSE/QR/Bancolombia).

## Conciliación y límites

Las notificaciones de Bold pueden tardar hasta diez minutos. El comprador ve el pago pendiente y debe esperar antes de pagar otra vez. El checkout vence a los veinte minutos; un enlace vencido requiere contactar a la tienda. El webhook sigue registrando confirmaciones tardías.

Los pedidos web no reservan inventario. Si el pago fue aprobado y luego faltan existencias, cambia el precio o no hay caja abierta, la aceptación falla y el pago permanece **APROBADO**, visible en **Mi tienda → Últimos pagos web**, para que el comercio cumpla el pedido o gestione la devolución en Bold. Nunca se pierde el registro de aprobación ni se registra una venta parcial.

En Domicilios se puede cancelar una solicitud RECIBIDO cuyo intento esté PENDIENTE o RECHAZADO. El intento queda CANCELADO y no puede abrirse otro checkout para ese pedido. Esto cancela la solicitud local, no una operación que ya se esté procesando en Bold. Si llega una aprobación tardía, se guarda su referencia y queda REVISION, sin venta ni descuento de inventario. Los pagos ya APROBADOS, APLICADOS o en REVISION requieren gestionar el cobro/devolución en Bold antes de cancelar. Una anulación anterior a la aceptación impide registrar la venta. Una anulación posterior a la venta, o un segundo pago diferente, queda **REVISION**; no revierte inventario ni crea reembolsos automáticamente. La comisión de Bold, la conciliación del abono bancario y las devoluciones se gestionan separadamente; el ingreso de la venta corresponde al total pagado por el comprador.

Evitar cambiar el enlace o la sucursal receptora mientras haya cobros pendientes. Si cambia el enlace, actualizar la URL registrada en Bold. No existe cobro remoto a Sono QR con esta implementación.

## Validación

`api/src/tienda/bold.spec.ts`: cifrado, firma, montos, aislamiento, idempotencia, orden de eventos, anulaciones y cierre de venta. `api/test/pos-integracion.cjs`: circuito HTTP y transacciones reales tanto en PostgreSQL como MariaDB, con credenciales y pagos ficticios en bases efímeras. No utiliza servicios externos de Bold.

Documentación oficial: [botón de pagos](https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual), [webhook](https://developers.bold.co/webhook), [ambiente de pruebas](https://developers.bold.co/pagos-en-linea/boton-de-pagos/ambiente-pruebas).
