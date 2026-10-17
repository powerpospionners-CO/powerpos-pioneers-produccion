# Bodega y empaque

Acceso para administrador y gerente: **Inventario → Bodega y empaque**, ruta `/inventario/empaques`.

1. Registrar la materia prima y el saldo físico actual **sin empacar**, en kg. Se guarda como ingrediente en gramos, con conversión de compra de 1 kg = 1000 g. No se cambia ningún paquete existente.
2. Registrar las compras recibidas sumando su peso real en kg y una referencia. No se presume el peso del bulto. El formulario de conteo reemplaza únicamente el saldo de esa materia prima y exige un motivo.
3. En el empaque seleccionar la materia prima y los productos existentes, gramos por paquete y número de paquetes terminados. Los destinos deben controlar stock por unidad; no pueden ser productos a granel ni combos.
4. El consumo es la suma de gramos por paquete × unidades, más la merma indicada en gramos. Por ejemplo, 10 × 30 g + 10 × 125 g = 1550 g antes de merma.
5. Al confirmar se descuenta la materia prima y se suman las unidades a los productos terminados. Al vender, el POS comercial descuenta las unidades del producto y no vuelve a consumir esa materia prima.

Cada operación deja movimientos de inventario y una auditoría `BodegaEmpaque` con responsable, sede, clave de operación y cantidades históricas. La pantalla muestra los últimos 100 registros de la sede. Se reutiliza el esquema existente: no hay migración, carga inicial automática ni recálculo de stock. Los costos de venta configurados en los productos no se sobrescriben; esta entrega no calcula bolsas, mano de obra ni costos de fabricación.

Las escrituras usan una transacción PostgreSQL, bloqueo por empresa y bloqueos de fila de materia prima/productos. Los destinos se bloquean en orden de id. El servidor valida saldo suficiente, pertenencia a la empresa, límites de cantidades y sede activa. Los reintentos con la misma clave y contenido devuelven la auditoría original; reutilizar la clave para otra operación se rechaza.

El navegador conserva la petición pendiente por empresa/sede/usuario antes de enviarla. Si no llega confirmación se congela la operación y se ofrece reintentar el mismo contenido. No registra empaques sin conexión. Los errores de validación permiten corregir los datos. No se debe registrar manualmente de nuevo un empaque pendiente desde otro equipo.

Para errores humanos ya confirmados, el historial se conserva. No hay eliminación o anulación automática de empaques en esta entrega; los ajustes posteriores requieren un conteo o ajuste auditado de cada existencia afectada. No se infiere que existencias negativas o faltantes históricos sean materia prima disponible.
