# Costos e inventario

Pantalla **Costos**, para el administrador y el gerente, con el permiso de inventario. Solo lee ventas, movimientos y recetas que ya existen; no cambia existencias.

## Costo por plato

- **Costo de cada producto:** se calcula con la receta (cantidad de cada insumo × su costo unitario). Si el producto no tiene receta, se usa el costo cargado en el producto.
- **Margen actual:** (precio − costo) / precio. Se marca *Margen bajo* cuando queda por debajo del mínimo elegido (30 % por defecto), y *Falta el costo* cuando la receta tiene insumos sin costo o el producto no tiene costo.
- **Margen real y utilidad del periodo** (7, 30 o 90 días): se calculan con el costo que guardó cada venta al momento de venderse. Las ventas anteriores a ese registro no cuentan para el margen real.
- Se puede exportar a CSV.

## Kardex

- Funciona por producto o por insumo, en un periodo de hasta 92 días.
- Reúne las entradas, salidas y ajustes de conteo, las mermas con su motivo y las ventas no anuladas, todas con su consumo real de inventario.
- El saldo se reconstruye hacia atrás desde las existencias actuales. Si una existencia se cambió por fuera de esos registros, la diferencia aparece en el saldo inicial.
- El valor del saldo usa el costo unitario actual.

## Compra sugerida

- **Fórmula:** consumo diario promedio de los últimos 7, 14, 28 o 56 días × los días a cubrir + el mínimo − la existencia.
- **Qué incluye:** insumos activos y productos que controlan existencias. Solo aparece lo que hay que comprar o lo que no alcanza para los días pedidos, ordenado por los días que alcanza.
- **Unidad de compra:** se convierte a la unidad de compra cuando el insumo la tiene (por ejemplo, gramos a kilos).
- **Costo estimado:** se calcula con el costo actual.
- **Exportar:** se puede exportar para enviarla al proveedor.
- **Es una guía:** no conoce promociones ni temporadas.

## Vencimientos y mermas

Reúne en un solo lugar dos datos que ya existían:

- Los lotes por vencer en 3, 7, 15 o 30 días.
- El reporte de mermas por producto y motivo, con su costo estimado.

Las mermas se siguen registrando en Productos.
