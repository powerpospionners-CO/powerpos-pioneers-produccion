# Campañas por correo

Las encuentras en **Mi tienda → Campañas por correo**. Solo las ve el administrador y solo aparecen si el boletín de la tienda está activo.

## Quién recibe
Solo los **suscriptores del boletín** que dejaron su correo. Son quienes autorizaron recibir novedades (Ley 1581 de 2012), y su consentimiento queda guardado con fecha. Los clientes del POS que no lo autorizaron no reciben campañas. Las felicitaciones de cumpleaños siguen siendo automáticas y van por aparte.

Grupos:
- Todos los suscriptores.
- Suscritos en los últimos N días.
- Suscritos hace más de N días.

Un mismo correo recibe un solo mensaje.

## Cómo se envía
- **Plantillas sugeridas:** "Te extrañamos", "Promoción" y "Novedad". El texto se puede editar y admite `{nombre}` y `{empresa}`.
- **Cupón opcional:** se puede adjuntar uno de los cupones activos de la tienda.
- **Contenido del correo:** usa la plantilla de PowerPOS e incluye un botón **"Ir a la tienda"** y el enlace **"Darme de baja de este boletín"**. Ese enlace abre la tienda con el formulario del boletín en modo baja y el correo ya escrito.
- **Antes de enviar:** se ve cuántas personas lo recibirán y se pide confirmar.
- **Límites:** máximo 2.000 correos por campaña y una campaña cada 12 horas por empresa. Se envían en lotes de 5.
- **Historial:** cada campaña queda registrada (tipo `CAMPANA` en `tienda_registros`) con el asunto, el grupo, los destinatarios, los enviados y los que fallaron. El historial no guarda los correos.
- Requiere que el correo del sistema (SMTP) esté configurado.
