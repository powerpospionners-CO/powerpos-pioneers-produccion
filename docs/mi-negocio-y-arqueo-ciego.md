# Mi negocio, control por usuario y arqueo ciego

## Mi negocio

Pantalla para el administrador (todas las sedes) y el gerente (solo su sede). Está pensada para el celular y se abre desde el acceso directo **Mi negocio** de la app instalada (mantener presionado el ícono de PowerPOS).

- **Del día** (o del día que se elija):
  - Ventas, número de ventas, ticket promedio y cajas abiertas.
  - Comparación con el mismo día de la semana anterior.
  - Ventas por hora de cada sede.
- **Alertas:**
  - Cierres de caja con diferencia mayor a $1.000.
  - Ventas anuladas.
  - Productos o insumos en su mínimo.
  - Sedes cuyos datos no se pudieron leer: una sede sin conexión no impide ver las demás.
- **Actualización:** el día de hoy se actualiza solo cada minuto.
- **Bases de datos:** con aislamiento por sede, se lee la base de cada sede activa. Solo lectura.

## Control por usuario

Para un periodo de hasta 92 días, por persona y sumando todas sus sedes (con aislamiento, la persona se identifica por su correo):

- **Ventas, total vendido y descuentos:** de quien vendió.
- **Anulaciones:** de quien anuló, con el monto.
- **Devoluciones:** de quien la registró.
- **Correcciones de pago y aperturas irregulares de caja**.
- **Cierres con diferencia:** del cajero que cerró, con la diferencia acumulada.

Las alertas son señales para revisar, no prueba de error o fraude:

- Anulaciones por más del 5 % de lo vendido, con al menos 3 anulaciones.
- Descuentos mayores al 10 %.
- Devoluciones mayores al 5 %.
- Faltantes de caja acumulados de más de $20.000.
- Aperturas irregulares de caja.

El reporte se puede exportar a CSV.

## Arqueo ciego

En **Configuración → Arqueo ciego**, el administrador o el gerente lo activa para su sede. Al cerrar la caja:

- **Qué no ve el cajero:**
  - Lo esperado, el efectivo vendido ni la lista de ventas de la caja abierta. Estos datos no llegan a su pantalla: el API no los envía.
  - El monto de las propinas: solo sabe si hubo propinas para repartir.
- **El conteo:** la calculadora de billetes muestra solo el total contado.
- **La diferencia:** se calcula igual y la ve el administrador en el historial de cajas.

Límites:

- No se aplica si la sede tiene recaudo semanal, porque el retiro necesita conocer el efectivo vendido.
- El cajero sigue viendo sus ventas del turno en el POS y la colilla impresa del cierre.

El ajuste se guarda en la tabla aditiva `ajustes_registros`, que es opcional en los respaldos.
