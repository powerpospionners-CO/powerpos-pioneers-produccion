# Tienda en línea: cupones, reservas, boletín y cuentas de cliente

Cada empresa activa estas funciones en **Mi tienda → Funciones de la tienda en línea** y guarda los cambios. Al guardar con alguna función activa se crea, en la base de la sede, la tabla aditiva `tienda_registros`. Ninguna petición pública crea tablas.

## Requisitos del servidor

- `BOLD_ENCRYPTION_KEY` o `PERSONAL_ENCRYPTION_KEY` (64 caracteres hexadecimales). De esa raíz se derivan claves distintas para los datos, los índices de búsqueda y las sesiones de clientes. Sin esa variable, las funciones responden como no disponibles.
- SMTP configurado para enviar el código de restablecimiento de contraseña. Sin SMTP, la cuenta funciona, pero el cliente no recibe el código.

## Cupones

- Pueden ser un porcentaje entero (de 1 a 90) o un valor fijo. Tienen vigencia en fechas de Colombia, una compra mínima y un límite total de usos (0 significa sin límite).
- Descuentan solo los productos; el domicilio no se descuenta. Se acepta un cupón por pedido.
- El cupón se valida otra vez dentro de la transacción que crea el pedido. Si cambió o se agotó, el pedido no se crea.
- Al **aceptar** el pedido en Domicilios, la venta registra el descuento y la observación `CUPÓN <código>`. El total de la venta debe coincidir con el del pedido web.
- Al **rechazar** el pedido, el uso vuelve al cupón.
- Un cupón que ya se usó no se elimina; se desactiva.

## Reservas

- El cliente elige fecha, hora y número de personas. Se valida el horario semanal de la tienda (el lunes es el día 0), una anticipación mínima de 30 minutos, el máximo de días de anticipación y el máximo de personas configurados.
- La página **Reservas** del panel la usan administrador, gerente y cajero. Desde ahí se confirma o se rechaza (con motivo); una reserva confirmada se marca como asistió, no asistió o cancelada (con motivo).
- El seguimiento público solo muestra estado, fecha, hora y personas.
- Los datos de reservas con más de 180 días se eliminan al gestionar una reserva (operación de escritura) y nunca se muestran en la lista.

## Boletín

- La suscripción es por correo o WhatsApp y exige autorización expresa.
- La respuesta es la misma aunque la persona ya estuviera suscrita, para no revelar quién está en la lista. La baja borra el registro.
- El administrador ve la lista y la exporta en CSV. El CSV neutraliza fórmulas para que Excel no las ejecute. El sistema no envía campañas.

## Cuentas de cliente

- La contraseña debe tener entre 10 y 72 caracteres (sin exceder 72 bytes UTF-8 para evitar truncamiento de bcrypt) y combinar letras y números. Se guarda con bcrypt (costo 12).
- El correo, el nombre y el teléfono se guardan cifrados con AES-256-GCM. La búsqueda por correo usa un índice HMAC, así que el correo nunca se guarda en claro.
- Las sesiones duran 7 días y usan una firma propia con el prefijo `cli.`. El panel nunca las acepta como sesión del personal.
- Después de 5 intentos fallidos, la cuenta se bloquea 15 minutos. Esos intentos no cierran la sesión que el cliente ya tiene abierta.
- El código de restablecimiento tiene 6 dígitos, vence en 15 minutos, admite 5 intentos y sirve una sola vez. Se envía como máximo uno por minuto. La respuesta no revela si la cuenta existe.
- Cambiar la contraseña o elegir "cerrar sesión en todos los dispositivos" invalida las demás sesiones.
- El cliente puede eliminar su cuenta; el administrador también. Los pedidos web ya enviados se conservan para la contabilidad.

## Protección contra abuso

- Cada acción pública tiene su propio límite por IP. Por ejemplo: validar cupón, 20 cada 10 minutos; reservar, 5; ingresar, 10; registrarse, 5 por hora; pedir un código, 3.
- Los formularios incluyen un campo trampa invisible y la API rechaza los envíos que lo llenan.
- La API envía `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy` y, en producción, HSTS. La web suma HSTS y `Permissions-Policy`, que bloquea cámara, micrófono y ubicación.

## Respaldos

Los scripts de respaldo, de copia entre sedes y de auditoría tratan `personal_registros`, `bold_registros`, `tienda_registros` y `seguridad_registros` como tablas opcionales. Una sede que nunca activó alguna de estas funciones se respalda completa.
