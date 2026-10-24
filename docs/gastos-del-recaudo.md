# Gastos pagados con dinero del recaudo

Finanzas y Compras permiten marcar «Pagado con dinero del recaudo» al registrar
un egreso pagado. La marca empieza desactivada. En Finanzas también se puede
cambiar al editar un egreso manual. Una compra a crédito sin pagar no admite la
marca. Los movimientos vinculados a Compras conservan sus restricciones de edición.

El resumen semanal descuenta únicamente los movimientos marcados, de la misma
empresa y sucursal, cuya fecha corresponde a lunes 00:00–lunes siguiente 00:00
en Bogotá. Excluye costos de venta, ventas y devoluciones vinculadas a pedidos,
que ya intervienen en los cálculos de caja. No crea un segundo egreso financiero.
La casilla corresponde al efectivo ya retirado de caja, no a la base fija ni a
dinero que ya se haya restado del retiro informado al cerrar el turno.

Disponible = efectivo retirado − gastos marcados. Si el saldo es negativo,
el disponible para consignar es cero y se muestra el faltante por cubrir.
Los gastos antiguos sin marca no se descuentan automáticamente.

La marca se guarda en eventos versionados GastoPagadoConRecaudo de la auditoría
de la sede, dentro de la transacción del gasto. No requiere migración de esquema.
Al consignar se guarda, en la misma transacción, una copia del bruto, gastos,
movimientos descontados y neto esperado en ConsignacionRecaudoResumen. La tabla
de consignaciones conserva su importe bruto original; las diferencias nuevas
se comparan con el neto de esa copia. Cambios posteriores en gastos no reescriben
el cierre ya registrado. Consignaciones anteriores sin copia mantienen su
comparación original; no se recalculan ni se alteran retrospectivamente.
