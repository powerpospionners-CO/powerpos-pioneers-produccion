# Crédito y devoluciones en el POS

## Corregir el medio de pago de una venta con caja cerrada

El administrador de la empresa puede abrir el Dashboard, elegir la fecha de la venta y usar **Editar medio de pago**. Debe seleccionar el medio o desglose correcto, escribir un motivo de entre 5 y 250 caracteres y guardar. No necesita abrir la caja de ese día ni la caja actual. Cajeros y gerentes conservan la restricción sobre cajas cerradas.

La corrección conserva el total y la fecha de la venta. Si $50.000 pasan de efectivo a transferencia, el efectivo esperado del cierre baja $50.000 y el valor de transferencia aumenta $50.000. También se recalculan la diferencia del cierre y el efectivo esperado del retiro semanal. El efectivo que se contó, el que realmente se retiró y la fecha del cierre se conservan. Por eso puede quedar una diferencia que requiere revisar el conteo o el retiro registrado; cambiar el pago no inventa un movimiento de dinero.

La actualización de los pagos, el cierre, el esperado del retiro y la auditoría se guarda en una sola transacción. Quedan registrados administrador, motivo, pago anterior, pago corregido y efecto sobre el cierre. Las ventas a crédito, anuladas o con devoluciones conservan sus flujos específicos y no se modifican mediante esta opción.

Los roles CAJERO, GERENTE y ADMIN_EMPRESA pueden vender a crédito, registrar abonos y devoluciones. Se mantiene el control de empresa, sede y caja abierta. El cajero requiere una caja propia en la sede de la venta. Cada operación conserva usuario, motivo, fecha, caja y clave para impedir duplicados por reintentos.

En el cobro se elige cliente y vencimiento. El crédito entrega mercancía y crea una cuenta por cobrar, sin registrar efectivo recibido. No admite canje de puntos ni domicilio. Los puntos de acumulación se asignan al liquidar la deuda. Los abonos posteriores se registran en el turno donde se recibe el dinero, sin modificar cierres anteriores.

El apartado **Créditos y devoluciones** del POS permite buscar por número de recibo, consultar créditos y registrar abonos. Para devolver, se seleccionan productos, cantidades, motivo, medio y si corresponde reponer inventario. Los descuentos se distribuyen conservando centavos. En ventas a crédito, la devolución reduce primero el saldo pendiente y reembolsa solo el excedente ya pagado. Una devolución total conserva la venta original y marca su devolución, para mantener el dinero original en el turno donde se cobró.

Los nuevos pedidos conservan consumo de inventario por línea, incluyendo presentaciones, combos, recetas, exclusiones y adicionales. Una venta antigua sin ese detalle permite devolución completa con su consumo global conservado. Su devolución parcial debe hacerse sin reposición automática y conciliar existencias mediante conteo aprobado. No se inventa el consumo histórico.

Los domicilios se rechazan en este flujo hasta contar con conciliación de entrega. Una devolución que implique retirar puntos ya utilizados también exige conciliación de puntos. Estas restricciones evitan duplicar reposiciones o afectar saldos sin respaldo.

Caja suma cobros y resta reembolsos por medio; no trata una deuda como efectivo. Estadísticas distingue ventas brutas, devoluciones del periodo, ventas netas y crédito. Financiero distingue ingresos cobrados de ingresos devengados: cobrar un crédito antiguo no genera otra utilidad. El costo repuesto revierte costo de venta y no cuenta como entrada de dinero. La rentabilidad histórica aplica devoluciones hasta el cierre del periodo a las ventas originales.

La migración `20261016020000_credito_devoluciones` agrega campos, enum, relación de cartera y tabla de operaciones. No reescribe ventas ni existencias anteriores. Fue aplicada en la copia de Neon y se compararon huellas de las 54 tablas existentes: no cambiaron. También pasó un recorrido real completo con crédito, dos abonos, devolución parcial y total, comprobando saldos, inventario e idempotencia. Las escrituras de ese recorrido se revirtieron.

El aislamiento físico por sede sigue siendo una entrega distinta. El registro de conexiones está preparado y probado, pero todavía no cambia PrismaService ni mueve datos productivos. No confundir esta ampliación con bases separadas ya activas.
