# Registro de pagos de suscripción

En Superadmin, selecciona una empresa y abre **Suscripción y soporte → Registro de pagos del plan**. Elige un mes o un año y el estado:

- **Pagado — dinero recibido:** confirma únicamente un pago que ya recibiste. Guarda el comprobante interno, el valor vigente del plan, el superadmin responsable y el período. El próximo vencimiento se calcula automáticamente desde la confirmación, sin escribir fechas.
- **Pendiente — aún no recibido:** registra el cobro sin renovar el período ni acreditar dinero. Cuando llegue, usa **Confirmar recibido** en ese registro. El período se calcula desde esa confirmación.

Las empresas con un período vigente muestran **Al día — no tienes pagos pendientes**, saldo del plan de cero y próximo vencimiento. No se genera otro cobro del plan durante ese período. El soporte opcional sigue siendo una compra independiente. Un pago rechazado o pendiente no acredita cobertura; los cinco días de gracia permiten acceso, pero no significan que el mes esté pagado.

La referencia de cada operación permite reintentar una solicitud sin registrar dos pagos. La confirmación actualiza pago, vencimiento y auditoría dentro de una transacción. Si otra operación cambió el vencimiento, no se sobrescribe silenciosamente. La confirmación manual solo acepta referencias manuales de la misma empresa; Wompi conserva su verificación propia.

Los campos de fecha quedan en **Ajustes excepcionales de fechas y soporte**. Cambiar una fecha no crea un comprobante de pago. Guardar exoneración u otros ajustes sin cambiar la fecha conserva la hora exacta del vencimiento.

Cuando hay bases independientes por sede, el acceso consulta el vencimiento y la exoneración de la empresa en la base central. No se requiere modificar fechas en cada sede.

## Publicación y validación

Este cambio requiere publicar la API y la web juntas; no agrega tablas ni modifica los pagos existentes. El escritorio carga la web publicada y no necesita un instalador nuevo por esta función. No registrar pagos ficticios ni modificar fechas de producción para probarlo.

Las pruebas cubren pago mensual, anual, fin de mes, pendientes, confirmaciones repetidas, referencias de otras empresas, concurrencia, vencimiento, soporte separado y lectura del pago central desde una sede.
