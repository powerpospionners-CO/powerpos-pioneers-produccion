# Plantillas y políticas laborales por empresa y sede

En **Personal y pagos → Plantillas y políticas**, el administrador de la empresa puede redactar documentos o cargar políticas y avisos en PDF (hasta 5 MB). Las guías editables son puntos de partida, no documentos jurídicamente aprobados. Los modelos de cláusulas de contrato aparecen en **Contratos → Aplicar modelo de la empresa**; siguen sujetos al llenado, revisión y firma individual existentes.

Cada documento tiene nombre, versión visible, responsable legal, NIT, domicilio, dirección, teléfono y correo. Crear una versión desde otra conserva el original. Los datos se almacenan cifrados en el expediente de la empresa y sede autenticadas. No se comparten automáticamente entre empresas ni entre bases de sedes.

## Política completa y aviso

1. Crear una política laboral, completar todos los campos de la guía o adjuntar el PDF revisado.
2. Descargar y revisar el documento. Adoptar la versión indicando revisor y fecha de vigencia, y confirmar la ejecución de sus procedimientos y canales.
3. Opcionalmente, publicar **solo esa política** mediante confirmación explícita de que no contiene datos privados ni firmas. El enlace público sirve un PDF con controles `no-store` y `noindex`. Puede retirarse sin borrar el documento ni sus entregas.
4. En **Privacidad**, escribir el aviso resumido y vincular la política adoptada; alternativamente, indicar un enlace externo HTTPS. No se consulta ni descarga el enlace externo desde el servidor. Un aviso guardado como plantilla puede aplicarse a ese formulario.
5. Guardar la configuración revisada. Las nuevas invitaciones conservan la referencia a esa versión; el empleado puede descargarla tras verificar su correo, aunque después se retire el enlace público o se adopte otra versión. Las invitaciones previas mantienen el aviso que recibieron.

Las configuraciones históricas sin política vinculada siguen disponibles. Al volver a guardar Privacidad se requiere vincular una política completa o un enlace HTTPS. No se adoptan ni publican documentos reales automáticamente durante el despliegue.

## Constancia de entrega

En la biblioteca se registra empleado, versión, fecha real, medio y observación de una entrega ya realizada. Este registro **no envía correos, no firma por el empleado y no sustituye autorizaciones de tratamiento**. El PDF y la referencia a la versión permanecen disponibles y la actuación se audita. Los consentimientos que correspondan deben gestionarse separadamente.

## Verificación

La integración de Personal, ejecutada sobre bases efímeras PostgreSQL y MariaDB, verifica permisos, aislamiento entre empresas, borradores privados, publicación y retiro explícitos, persistencia de versiones, incorporación de modelos al editor, entregas sin firma y descarga de la política por sesión OTP. Las pruebas unitarias verifican enlaces seguros, bloqueo público por tipo/estado y generación de PDF paginado.

La creación del texto no implementa por sí misma la política: el empleador debe habilitar canales, definir conservación por clase documental, controlar accesos y cumplir los procedimientos adoptados. La revisión laboral de contratos, nómina y modificaciones salariales se mantiene separada.
