# Contabilidad, centro de ayuda y QR en la pantalla del cliente

## Libro diario para el contador

**Contabilidad** (administrador o gerente, con el permiso de financiero) genera, para la sede de la sesión y un periodo de hasta 92 días, asientos de partida doble por día con cuentas del PUC colombiano (Decreto 2650 de 1993):

| Comprobante | Débito | Crédito |
| --- | --- | --- |
| VT · Ventas del día | 110505 caja (efectivo), 111005 bancos (tarjeta, transferencia, Nequi, Daviplata) y 130505 clientes (saldo a crédito) | 414005 restaurantes / 413505 comercio |
| CV · Costo de ventas | 614005 / 613505 | 143505 inventario |
| DV · Devoluciones | 417505 | Caja o bancos, según el reembolso |
| RC · Recaudo de cartera | Caja o bancos | 130505 |
| PR · Propinas | Caja o bancos | 238095 propinas por pagar (no son ingreso) |
| EG · Gasto o compra pagado | Cuenta PUC asignada o cuenta por categoría | 110505 |
| CP · Compra o gasto por pagar | Cuenta asignada; las compras van a 143505 | 220505 proveedores / 233595 otros |
| PG · Pago de cuenta por pagar | 220505 / 233595 | 110505 |
| IN · Otro ingreso | 110505 | Cuenta asignada o 429595 |

- Fechas contables en hora de Bogotá. Las ventas anuladas no se incluyen.
- Las compras a crédito y de contado son excluyentes, así que no se cuentan dos veces.
- Cada comprobante cuadra (débitos = créditos), y la pantalla lo confirma.
- Se marcan para verificar:
  - Las ventas sin costo histórico.
  - Los gastos sin cuenta asignada.
  - El medio con que se pagaron los gastos (hoy se registra como caja).
- Exportación CSV con comprobante, fecha, cuenta, débito, crédito, NIT de la empresa y la nota de verificación. El contador la importa en Siigo o World Office, o la adapta a la plantilla de su programa.
- **Límites:**
  - No discrimina IVA, porque el POS no lo registra en las ventas.
  - Es una base para el contador: no reemplaza su revisión ni la facturación electrónica.

## Centro de ayuda

- Ícono **?** en la barra superior. Abre guías paso a paso según el rol del usuario; el perfil mesero solo ve Mesas y Seguridad.
- Tiene búsqueda que no distingue tildes y un botón por guía para ir a la pantalla.
- Contacto de soporte opcional con `NEXT_PUBLIC_SOPORTE_WHATSAPP` (solo dígitos, con indicativo) y `NEXT_PUBLIC_SOPORTE_CORREO`. Si no se configuran, la sección no aparece.

## QR en la pantalla del cliente

Si la tienda en línea está publicada, la pantalla del cliente muestra un QR a `app.<dominio>/tienda/<slug>` para pedir en línea, sumar puntos y dejar reseñas. Se usa ese enlace del sistema porque siempre funciona, aunque el subdominio propio aún no tenga DNS.

## Corrección: pantallas nuevas en el dominio de la empresa

Mesas, Costos y Mi negocio no estaban en la lista de rutas del panel de `proxy.ts`. Por eso, en el dominio propio de una empresa se reescribían hacia la tienda. Ahora están en la lista junto con Contabilidad y Ayuda, y fuera de los buscadores. Una prueba verifica que toda pantalla nueva del panel quede en esa lista.
