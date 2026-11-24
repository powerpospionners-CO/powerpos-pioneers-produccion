# Cuenta de nómina y comprobante después del pago

En **Personal y pagos → Empleados**, el administrador registra banco (por ejemplo Davivienda), tipo de cuenta (ahorros o corriente) y número. El titular es el propio empleado. Los datos se almacenan cifrados en su expediente; las cuentas anteriores no se sustituyen dentro de los pagos ya registrados. El sistema no verifica titularidad contra el banco ni realiza transferencias, y no requiere claves bancarias.

Los conceptos de **Periodos y pagos** se liquidan y revisan antes de registrar el giro. Se incluyen salario, auxilios y recargos como devengados, y cada deducción como concepto separado con fundamento y soporte. No se calculan automáticamente las obligaciones de nómina ni se descuentan nuevamente al registrar el pago. Los aportes del empleador no se introducen como deducciones del empleado.

## Flujo

1. Realizar el giro por el canal bancario de la empresa.
2. En **Registrar giro y enviar comprobante de nómina**, seleccionar el período. La interfaz muestra devengados, deducciones, neto y saldo.
3. Revisar destino enmascarado, indicar referencia bancaria, importe efectivamente transferido, fecha y soporte PDF hasta 5 MB. Confirmar que la operación ya se realizó.
4. Registrar el pago. El servidor comprueba la versión de la cuenta del empleado, límites del saldo y ámbito de empresa/sede. Un cambio de cuenta obliga a actualizar y verificar el destino.
5. Tras confirmar la transacción de pago, se solicita el envío al correo del empleado mediante SMTP. El correo adjunta el comprobante PDF desglosado e incluye el enlace privado para confirmar recepción o presentar diferencias.

El comprobante muestra identidad de las partes, período, cada devengado, cada deducción y fundamento, totales, neto del período, valor del abono, pagos anteriores, saldo, medio, referencia bancaria y solo los últimos cuatro dígitos del destino. No expone el número completo ni identifica la creación del comprobante como una firma del trabajador. Se mantiene la advertencia sobre nómina electrónica DIAN no conectada.

## Reintentos y evidencias

Se conserva una clave de idempotencia del pago. La interfaz bloquea cambios tras iniciar una solicitud incierta y reintenta exactamente la misma operación. El servidor impide repetir el movimiento financiero y reserva una sola notificación automática por pago bajo bloqueo del registro. No mantiene abierta una transacción de base de datos durante SMTP.

Si el correo falla, el pago permanece registrado y el estado de envío lo indica. **Enviar al empleado** reintenta el envío, no el pago, y actualiza su estado. Una interrupción durante el envío puede dejarlo pendiente; debe revisarse antes de reenviar. Las copias posteriores a la confirmación del empleado mantienen su procedimiento existente.

El endpoint anterior de pagos permanece compatible para clientes previos; la interfaz actual usa el flujo de registro y envío. Las cuentas bancarias completas no se copian a contratos ni a nuevos períodos laborales. La cuenta resumida y la referencia quedan en la fotografía del pago.

## Verificación

Pruebas unitarias de validación, ceros iniciales, enmascaramiento, revisión de destino, totalización y generación de PDF. La integración sobre bases efímeras PostgreSQL y MariaDB verifica permisos, cambio de cuenta, deducciones, abonos concurrentes/idempotentes, un correo automático con PDF, fallo y reenvío sin duplicar movimientos. Los correos y datos son ficticios; no se opera contra Davivienda.
