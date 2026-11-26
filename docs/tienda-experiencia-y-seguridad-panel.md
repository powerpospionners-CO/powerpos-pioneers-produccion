# Tienda en línea: entregas, opciones, puntos y reseñas. Seguridad del panel

Complementa [cupones, reservas y cuentas](tienda-cupones-reservas-cuentas.md). Todo se activa por empresa en **Mi tienda → Entregas, mesas y avisos**, salvo la seguridad del panel, que es por usuario.

## Opciones de producto en la web

- La tienda ofrece las presentaciones activas y los adicionales con las mismas reglas que la caja: en el Trailer (empresa 1) los extras son globales y no se ofrecen en bebidas; en los demás restaurantes se usan los marcados en el producto o, si no hay ninguno, el catálogo global cuando el producto acepta adicionales. Los comercios no reciben adicionales.
- La web no ofrece empaques para llevar porque no envía tipo de consumo; la caja tampoco los agrega a esos pedidos.
- Cada línea guarda `precio` (precio base o de la presentación), `precioUnitario` (con adicionales), `presentacionId`, `adicionales` y `observacion`. Al aceptar, la caja verifica el precio base y la venta valida los adicionales; si el total cambió, no registra la venta.
- Un mismo producto con opciones distintas va en líneas separadas. Las existencias se suman entre esas líneas.

## Entregas

- **Recoger en tienda**: no cobra domicilio ni exige pedido mínimo. En Domicilios se marca entregado sin domiciliario.
- **Pedidos programados**: fecha y hora con al menos 45 minutos de anticipación, hasta 7 días adelante y dentro del horario semanal (incluidos los turnos que cruzan la medianoche). Llegan marcados `[PROGRAMADO fecha hora]`.
- **Mesa con QR**: Mi tienda imprime un QR firmado (HMAC) por mesa. Sin una firma válida no se aceptan pedidos para esa mesa. Funciona aunque la tienda no reciba domicilios. El pedido llega a Domicilios como `Mesa N` y, al aceptarlo, la venta pasa a cocina; luego se marca como servido.

## Avisos al cliente

- Solo se envían a quien los autoriza en el pedido o la reserva. Por correo usan el SMTP del sistema; por WhatsApp, una plantilla aprobada por Meta en `WHATSAPP_TEMPLATE_CLIENTE` con dos parámetros: `{{1}}` el negocio y `{{2}}` el mensaje. Sin esa plantilla solo se avisa por correo.
- Se avisa cuando el pedido se acepta, sale, se entrega o se cancela, y cuando la reserva se confirma, se rechaza o se cancela. El recordatorio de reservas confirmadas corre cada hora entre 9:00 y 19:00 de Colombia, solo el día anterior y una sola vez. Respeta `BACKGROUND_JOBS_ENABLED`.
- Un aviso fallido nunca bloquea la operación.
- Mi tienda muestra si WhatsApp y correo están conectados; no muestra claves. WhatsApp de clientes no depende de tener aprobada la plantilla de alertas internas. Comparte el límite diario por empresa con esas alertas, deduplica mensajes y registra el identificador de Meta para recibir estados de entrega. Un timeout queda para revisión, sin reintentos automáticos ni promesas de entrega.
- Para conectar: disponer de WhatsApp Business Platform en Meta, número remitente habilitado, token de acceso y secreto de la app en variables privadas del servidor; aprobar la plantilla `WHATSAPP_TEMPLATE_CLIENTE` (dos parámetros de cuerpo: empresa y actualización), configurar idioma y versión Graph vigentes en Meta, habilitar `WHATSAPP_ENABLED` y establecer `WHATSAPP_LIMITE_DIARIO`. Registrar el webhook HTTPS `/webhooks/whatsapp`, su token privado de verificación y la suscripción a estados de mensajes. Nunca introducir secretos en la tienda pública o en el chat. Meta puede cobrar por mensajes.
- La aprobación de una plantilla y la conexión real se realizan en Meta; activar la casilla de avisos por sí sola no conecta WhatsApp. Enchila Market mantiene reservas desactivadas.

## Puntos de fidelización en la cuenta web

- En Clientes → puntos, la caja genera un código de 8 caracteres, válido 30 minutos y de un solo uso. El cliente lo escribe en Mi cuenta. Así nadie vincula puntos ajenos con solo conocer un teléfono.
- El canje en la web se valida contra el saldo y el valor del punto, y nunca supera los productos menos el cupón. Los puntos se descuentan al aceptar la venta en caja, con el cliente vinculado.
- Los pedidos de una cuenta vinculada suman puntos al cliente del POS al aceptarse.

## Favoritos y reseñas

- Los favoritos se guardan cifrados dentro de la cuenta del cliente.
- Una reseña requiere una cuenta y un pedido **entregado** que incluya el producto. Queda pendiente hasta que la empresa la publique. Se muestra con el primer nombre y alimenta `aggregateRating` en los datos para Google de la página del producto.

## Estadísticas web

Mi tienda muestra, para 7, 30 o 90 días: ventas aceptadas, ticket promedio, tasa de aceptación, pedidos por tipo de entrega, uso y costo de cupones, productos más pedidos, reservas, cuentas nuevas y suscriptores nuevos.

## Seguridad del panel

- **Verificación en dos pasos** (TOTP, RFC 6238) desde el ícono de escudo de la barra. El secreto se guarda cifrado con AES-256-GCM. Un código no se acepta dos veces. Hay 10 códigos de recuperación de un solo uso, guardados como hash. Tras 5 códigos fallidos el acceso se bloquea 15 minutos.
- Con 2FA activa, la contraseña solo entrega un desafío de 5 minutos con otra firma y otro formato, que nunca sirve como sesión.
- **Sesiones**: cada inicio de sesión queda registrado y la ficha JWT lleva su `sid`. Se pueden cerrar sesiones una por una o todas las demás. Las fichas emitidas antes de este cambio no traen `sid` y siguen valiendo hasta vencer (8 horas).
- **Alerta de acceso nuevo**: llega un correo cuando el inicio de sesión viene de un navegador y una red (/24) que no aparecen en los últimos 90 días.
- Los datos viven en `seguridad_registros`, una tabla aditiva que se crea en la base de cada usuario y que los respaldos tratan como opcional.

- **2FA exigida por la empresa**: el administrador, con su propia 2FA activa, marca en Seguridad → *Seguridad del equipo* "Exigir la verificación en dos pasos a administradores y gerentes" y confirma con su contraseña y su código. La política se guarda en `seguridad_registros` (usuario 0, tipo `POLITICA`) de todas las sedes activas. Mientras un administrador o gerente no la active, el API responde `403 DOS_PASOS_REQUERIDO` a todo excepto `/auth/seguridad/*` y la web lo lleva a Seguridad. Con la política activa no se puede desactivar la propia 2FA. Los cajeros, cocineros y domiciliarios no se ven afectados.
- **Restablecer la 2FA de otro usuario**: para quien perdió el teléfono y los códigos. Solo el administrador de la empresa con su propia 2FA activa, nunca sobre sí mismo ni sobre usuarios de otra empresa, confirmando contraseña y código propios (5 contraseñas fallidas bloquean 15 minutos). Quita la 2FA del usuario y cierra sus sesiones en todas las sedes donde exista su correo, y le avisa por correo.

La política de 2FA se identifica por empresa incluso cuando varias empresas comparten una base; activarla para una no obliga a los usuarios de otra.

El superadmin debe activar la verificación en dos pasos obligatoriamente, aunque no pertenezca a una empresa. Mientras no lo haga solo accede a Seguridad. No puede desactivarla; conserva sus diez códigos de recuperación para iniciar sesión si pierde el teléfono.

Los avisos de acceso nuevo y restablecimiento de 2FA usan exclusivamente el correo personal de Seguridad (cifrado por usuario), o el correo personal previamente configurado en Alertas de administradores para esa empresa y usuario. Nunca usan el identificador de acceso como alternativa. Todos los roles, incluido superadmin, pueden guardar su correo en Seguridad confirmando contraseña y su segundo factor si lo tienen activo. No se vinculan automáticamente expedientes laborales ni se inventan direcciones.
