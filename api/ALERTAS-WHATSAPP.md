# Alertas de administradores con Meta Cloud API

Implementación directa con Meta, sin intermediario. Se conserva el correo existente.
No incluye el alta del número, coexistencia, pagos o aprobación de plantillas: se completan en Meta.
No se ha enviado ningún mensaje real durante la implementación.

## Configuración privada del servidor

Configurar en Railway, nunca en Git ni en el navegador del POS:

```
WHATSAPP_ENABLED=false
WHATSAPP_PHONE_NUMBER_ID=<identificador del número habilitado para Cloud API>
WHATSAPP_ACCESS_TOKEN=<token de Meta con whatsapp_business_messaging>
WHATSAPP_APP_SECRET=<secreto de la aplicación Meta>
WHATSAPP_VERIFY_TOKEN=<valor aleatorio privado para verificar el webhook>
WHATSAPP_GRAPH_VERSION=<versión vigente habilitada para la aplicación, formato vNN.N>
WHATSAPP_TEMPLATE_ALERTA=powerpos_alerta_administrativa
WHATSAPP_TEMPLATE_LANGUAGE=es_CO
WHATSAPP_LIMITE_DIARIO=0
```

Sin activación explícita, credenciales y un límite entero positivo, no se reservan ni envían mensajes.
El límite cuenta reservas por empresa y sede, compartidas entre sus administradores: un mensaje a cada persona consume una reserva.
No es un tope monetario de Meta. Las tarifas y la categoría aprobada determinan el costo.
Las reservas fallidas o canceladas también consumen el cupo para evitar reintentos y costos inesperados.

## Plantilla propuesta para presentar en Meta

Nombre: `powerpos_alerta_administrativa`. Idioma: español (Colombia).
Solicitar categoría utilidad; la clasificación final depende de Meta.

Texto del cuerpo (cinco parámetros, sin encabezado ni botones):

```
PowerPOS: alerta administrativa de {{1}}.
Sede: {{2}}.
Evento: {{3}}.
Detalle: {{4}}.
Fecha: {{5}}.
Revisa el sistema para consultar la información completa.
```

Ejemplos: Empresa de ejemplo; Principal; STOCK CRÍTICO; Sal: 0 g, mínimo 500 g; 20/10/2026 10:30 a. m.
El detalle se resume a 500 caracteres y una línea; los datos completos permanecen en PowerPOS y en el correo.
No se envía texto libre ni promociones; el envío exige una plantilla aprobada con esos cinco parámetros.

## Webhook

URL: `https://api.powerpospioneers.com/webhooks/whatsapp`.
GET valida `hub.mode`, `hub.verify_token` y responde el `hub.challenge` como texto.
POST verifica `X-Hub-Signature-256` con HMAC SHA-256 sobre el cuerpo original y el secreto de la aplicación.
Se ignoran mensajes entrantes y números distintos al remitente configurado. No se guardan chats ni cuerpos completos del webhook.
Los estados se aplican solamente al identificador de mensaje previamente guardado en la sede correspondiente.
Suscribir el campo `messages` de la cuenta real y publicar la aplicación según los requisitos que muestre Meta.
Configurar la URL solo después de desplegar el servidor y guardar las variables privadas.

## Uso en PowerPOS

Configuración → Usuarios → Alertas de administradores: teléfono con indicativo, autorización del titular y categorías stock/caja.
Los administradores o gerentes activos reciben exclusivamente los avisos de su empresa y sede.
Los registros antiguos mantienen WhatsApp apagado y conservan su correo y categorías.
El consentimiento se registra en la auditoría con el usuario que lo guardó.
El titular debe haber autorizado realmente los avisos antes de marcar la casilla.

## Cola y límites prácticos

La cola utiliza la auditoría ya existente en cada base de sede, sin migraciones ni cambios de existencias.
Un bloqueo transaccional de PostgreSQL serializa deduplicación y reserva diaria entre instancias.
El procesador se ejecuta cada 15 segundos y reclama cada trabajo de forma atómica.
Se vuelve a revisar usuario activo, consentimiento y categoría antes del envío. Los trabajos de más de una hora se cancelan.
Se deduplica el mismo aviso de stock durante 24 horas y el mismo aviso de caja durante un minuto.
El correo y WhatsApp son independientes; el SMTP no es requisito de WhatsApp.

Entidad de auditoría: `WhatsAppSalida`. Estados: PENDIENTE, ENVIANDO, ACEPTADO, sent, delivered, read, failed, REVISAR, CANCELADO.
ACEPTADO significa que Meta aceptó la solicitud, no entrega al teléfono.
REVISAR indica error o resultado incierto. Un reinicio puede dejar ENVIANDO si interrumpió el proceso.
No se reenvían automáticamente estados inciertos para evitar mensajes duplicados y cobros dobles.
Antes de reintentar manualmente hay que contrastar el estado en Meta; no cambiar estas filas masivamente a PENDIENTE.
No hay pantalla de reintentos ni garantía de entrega de extremo a extremo en esta versión.

## Activación pendiente

1. Completar coexistencia del número actual si se desea mantener WhatsApp Business en el celular. Vincularlo al portafolio no completa ese proceso.
2. Obtener las credenciales y aprobar la plantilla en la cuenta real.
3. Configurar webhook y confirmar publicación/suscripción de Meta.
4. Acordar el cupo diario, registrar consentimiento del destinatario de prueba y activar.
5. Probar un evento autorizado y confirmar `delivered` antes de ampliar destinatarios.

Referencias oficiales:
- https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
