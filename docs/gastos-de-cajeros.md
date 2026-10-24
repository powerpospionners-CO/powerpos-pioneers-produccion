# Registro de gastos por cajeros autorizados

Configuración → Usuarios permite al administrador generar o revocar un código
de Gastos para un cajero activo de su empresa. El código es independiente del
de códigos de barras. Ambos usan el mecanismo compartido AccesoTemporal, con
sus prefijos de eventos anteriores conservados: ocho dígitos, bcrypt, cinco
intentos por quince minutos en la base, sesiones de treinta minutos y tokens
aleatorios almacenados únicamente como hash. Renovar o revocar invalida sesiones.

Registrar gasto muestra únicamente el formulario: categoría, descripción, monto,
fecha y marca de pago con recaudo. La API deriva empresa, sucursal y usuario de
la sesión; rechaza claves adicionales, ingresos, costos de venta y compras de
mercancía que requieren inventario. No expone lectura de saldos ni edición o
eliminación. El módulo financiero debe estar habilitado en el plan de la empresa;
la autorización especial no otorga acceso al módulo general de Finanzas.

Un identificador UUID por envío y un bloqueo transaccional del usuario evitan
duplicar gastos ante reintentos concurrentes, incluso en distintas instancias.
Reutilizar una clave con otro contenido se rechaza. Movimiento financiero,
marca del recaudo y comprobante de idempotencia se guardan en la misma
transacción. La auditoría de actividad identifica a la persona y muestra el
gasto, importe, fecha y origen del dinero; no guarda el PIN ni el token de acceso.

La autorización de Paula se aplica mediante la API administrativa del destino
correcto, sin crear gastos de ejemplo en producción. El flujo se valida con
bases PostgreSQL/MariaDB desechables en api/test/pos-integracion.cjs.
