# Revisión y cierre de pedidos de distribuidores

Anular la venta de caja no borra el pedido original del distribuidor. El pedido queda **En revisión**, sin comisión liquidable, para que el administrador confirme su cierre. Una venta anulada no se presenta como un nuevo saldo por cobrar.

## Uso

1. Entrar como **ADMIN_EMPRESA** en la sede del pedido.
2. Desde **Distribuidores → Ver ventas y pedidos**, o desde **POS → Pedidos de distribuidores**, pulsar **Revisar y cancelar pedido**.
3. Revisar mercancía, cliente, importe, comisión y venta vinculada, incluidos pagos, crédito y devoluciones.
4. Si la cancelación está permitida, escribir un motivo de al menos diez caracteres, confirmar la revisión y pulsar **Cancelar pedido del distribuidor**.

El pedido queda ANULADO, desaparece de los pendientes y permanece en el historial. La acción guarda usuario, fecha, motivo y estado de la venta en auditoría. La página se actualiza después de confirmar el cierre.

## Controles

- Solo el administrador de la empresa puede utilizar estas rutas. La consulta y el cierre exigen empresa y sede de la sesión.
- Se permite cerrar un pedido pendiente sin retiro, o uno cuya venta esté anulada o completamente devuelta y sin saldo de crédito.
- No se crean movimientos financieros ni se repone inventario: la anulación o devolución de la venta ya gestiona esos efectos. El cierre funciona aunque la caja original esté cerrada.
- Una venta activa, una devolución parcial, una venta no encontrada, un crédito con saldo o una comisión ya liquidada requieren completar su gestión o conciliación antes del cierre. Los pedidos históricos sin control de caja no se cancelan presumiendo qué mercancía o dinero se recibió.
- Si la venta o el pedido cambian después de abrir la revisión, se exige actualizarla. El bloqueo compartido con caja y liquidaciones evita carreras entre entrega, devolución y cancelación. Los reintentos no duplican cancelaciones ni efectos contables.

## Validación

Las pruebas unitarias verifican permisos, ámbito, revisión desactualizada y ausencia de nuevos efectos sobre inventario o dinero. La integración de POS reproduce una entrega real en la base efímera, anula su venta, cierra la caja y cancela dos veces concurrentemente el pedido del distribuidor: conserva las existencias y los movimientos de la anulación original, genera una sola auditoría y excluye la comisión. Se ejecuta en PostgreSQL y MariaDB.
