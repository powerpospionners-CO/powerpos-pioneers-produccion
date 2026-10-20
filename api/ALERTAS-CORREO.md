# Alertas por correo

En Configuración → Usuarios → Alertas por correo, un administrador o gerente
puede guardar un correo personal para cada administrador/gerente activo de su
empresa y sede. No cambia el correo de acceso. Vaciarlo desactiva los envíos.
Las preferencias quedan versionadas en la auditoría de la base de esa sede;
no se modifica el esquema ni se copian datos entre empresas.

## Remitente de PowerPOS

Configurar estas variables privadas en el servicio API de Railway:

| Variable | Gmail |
| --- | --- |
| SMTP_HOST | smtp.gmail.com |
| SMTP_PORT | 587 |
| SMTP_USER | Correo Gmail de PowerPOS |
| SMTP_PASS | Contraseña de aplicación de Google, no la contraseña habitual |

Gmail requiere verificación en dos pasos para generar una contraseña de
aplicación. Algunas cuentas tienen restricciones. No guardar claves en Git,
capturas ni mensajes de chat. Después del despliegue usar «Enviar prueba».
La pantalla distingue configuración pendiente de remitente configurado;
tener variables configuradas no garantiza la entrega: debe comprobarse.

## Comportamiento

- Solo destinatarios personales configurados de administradores/gerentes
  activos de la empresa autenticada. No utiliza EMAIL_ADMIN, el correo de
  acceso ni destinatarios de otras empresas como alternativa.
- Stock de ingredientes y productos con control de existencias: revisión
  cada cinco minutos en cada base activa. Bajo: stock ≤ mínimo; crítico:
  stock ≤ la mitad del mínimo, incluyendo agotados con mínimo cero.
  Un resumen por nivel y artículo cada 24 horas mientras continúe la alerta.
  No se marca notificado si falla el envío a algún destinatario.
- Caja: apertura, cierre, cierre automático, diferencia superior a $1.000,
  apertura irregular registrada y anulación de venta por el flujo de pedidos.
- Un correo independiente por destinatario; contenido escapado y hora Bogotá.
  Los avisos de caja no bloquean la venta. Un fallo de correo no revierte caja,
  inventario ni ventas. No existe cola persistente de reintentos para caja;
  los eventos originales continúan guardados en su auditoría habitual.
- Una apertura física con llave no puede detectarse sin sensor o aviso del
  agente. El endpoint de apertura irregular notifica un evento registrado;
  no supone vigilancia física del cajón.
- Prueba limitada a una por minuto por administrador; disponible solo para
  administradores/gerentes y correos guardados en su propia empresa.

## WhatsApp

La alternativa oficial sin Twilio es WhatsApp Cloud API de Meta. Requiere
configuración de cuenta/número, credenciales y plantillas aprobadas para
avisos proactivos. Esta entrega no activa WhatsApp ni instala automatizaciones
de WhatsApp Web. Ver https://developers.facebook.com/docs/whatsapp/cloud-api/overview
