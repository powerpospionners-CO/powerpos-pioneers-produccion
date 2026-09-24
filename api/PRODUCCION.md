# Correcciones de caja y catálogo — septiembre 2026

- `JWT_SECRET` es obligatorio y se conserva su valor actual en Railway. No se requiere rotarlo ni cerrar sesiones. La API falla al iniciar si falta.
- El efectivo esperado es la base más las ventas en efectivo no anuladas. Tarjeta, transferencia, Nequi y Daviplata permanecen en total de ventas, pero no generan faltantes de efectivo.
- Apertura, venta, anulación y cierre usan un bloqueo transaccional por sucursal en PostgreSQL. No requiere cambios de esquema ni migraciones sobre datos existentes.
- La anulación de restaurante con caja abierta registra un egreso de reversión sin borrar el ingreso original. Las cajas cerradas y ventas con puntos o domicilios conservan la exigencia de conciliación. No se reponen automáticamente ingredientes: podrían haberse consumido al preparar el pedido.
- Los errores de notificación posteriores a una apertura o cierre confirmado no provocan que la operación parezca fallida.

## Cierre automático

El horario global fijo se elimina. Por defecto el cierre es manual. Para habilitarlo explícitamente por empresa, configurar `CIERRES_CAJA_POR_EMPRESA` en Railway con un objeto JSON como:

```json
{"123":{"hora":"22:00","zonaHoraria":"America/Bogota"}}
```

Reemplazar `123` por el ID real de la empresa que autoriza el cierre. Solo aplica a restaurantes. Se comprueba cada cinco minutos usando la zona indicada y no se cierra una caja abierta después del corte del día. No es un arqueo físico: el cierre automático utiliza el efectivo esperado.

## Catálogo de Enchila Market Pereira

El Excel `stiven.xlsx` contiene 499 presentaciones y coincide con los 499 registros públicos en precios y productos. Cuatro diferencias son normalizaciones ya existentes de nombre/categoría/presentación, sin cambios de precio. No reimportar: duplicaría el catálogo.

Las 271 rutas bajo `web/public/catalogo-imagenes/` ya están asociadas a los registros. Reemplazar los recursos conserva IDs, precios, vínculos y la disponibilidad exclusiva del catálogo por empresa. Las fotografías son de referencia; la presentación se toma de cada ficha. La selección de fuentes queda registrada en el manifiesto de imágenes.

## Verificación al publicar

1. Compilar API y web y ejecutar las pruebas del backend.
2. Publicar mediante la integración Git ya configurada en Railway y Vercel.
3. Comprobar el catálogo público, sus 499 registros y las 271 rutas de imagen.
4. Verificar la descarga PDF y el estado del servicio API. No crear ventas de prueba en la base de producción.

No se modifican cierres históricos ni se revierten anulaciones antiguas automáticamente; cualquier ajuste histórico necesita conciliación de sus movimientos.
