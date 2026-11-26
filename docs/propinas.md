# Propinas

Propina voluntaria según la Ley 1935 de 2018: el negocio pregunta, sugiere como máximo el 10 % y la propina no es ingreso del negocio.

## Configuración

En **Configuración → Propinas**, el administrador o el gerente de un restaurante activa "Preguntar la propina al cobrar" y fija el porcentaje sugerido, entre 0 % y 10 %. La configuración vive en la base de cada sede.

## Al cobrar

- La ventana de cobro pide la respuesta del cliente: *Sin propina*, *Sí, X %* u *Otro valor*. Mientras no haya respuesta no se confirma la venta. En ventas a crédito no se ofrece.
- La propina va aparte: no cambia el total, los pagos, los puntos ni los reportes de ventas.
- Tiene su propio medio de pago. Si es en efectivo, el monto recibido debe cubrir la venta más la propina, y el cambio se calcula sobre ambos.
- Viaja con la venta, con la misma clave de reintento, así que una venta guardada sin conexión no la pierde ni la duplica.
- La tirilla muestra "Propina" y "TOTAL CON PROPINA".

## Cierre de caja

- Las propinas de ventas anuladas no cuentan.
- Las propinas en efectivo se suman a lo que debe haber en la gaveta: en el esperado del cierre, en la corrección del conteo y en la corrección del retiro de recaudo. El retiro de recaudo sigue limitado a las ventas en efectivo, porque las propinas son del personal.
- Al cerrar, el cajero marca entre quiénes se reparte. Por defecto aparecen quienes registraron ventas en el turno y el cajero. El reparto es en partes iguales, en pesos enteros; los pesos sobrantes van uno a uno a los primeros de la lista.
- En el cierre automático por horario se reparte entre esas mismas personas.
- El reparto queda fijo con el cierre: anular una venta después no lo recalcula.
- La colilla de cierre muestra las propinas, cuánto fue en efectivo y el reparto.

## Reporte

En Configuración → Propinas → *Reparto por persona* se ve, para un periodo de hasta un año, cuánto le corresponde a cada persona y en cuántos turnos participó.

## Datos

Tabla aditiva `propina_registros`, que se crea en la base de la sede solo desde acciones de escritura. Tipos de registro:

- `PROPINA`: una por venta.
- `REPARTO`: uno por caja.
- `CONFIG`: la configuración.

Los respaldos la tratan como opcional.
