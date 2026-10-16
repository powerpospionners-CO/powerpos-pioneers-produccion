# Empaques por producto en el POS

En Productos → Adicionales, crea o edita el empaque, selecciona su ingrediente existente, cantidad a descontar por unidad (por ejemplo 1), precio 0 si está incluido, y marca **Empaque automático solo para llevar**. Asócialo explícitamente a cada producto que lo usa desde la edición del producto. No se aplica a otros productos mediante el catálogo general.

Para Trailer del Sabor: la bolsita metalizada permanece en la receta base de la hamburguesa; el porta hamburguesa se configura como empaque automático, fuera de la receta base. No se crea otro ingrediente ni se cambia el stock inicial.

Al abrir un producto con empaque en el POS, el cajero debe elegir **Comer aquí** o **Para llevar**. La elección aplica a la cantidad de esa línea. Para mezclar modalidades, agrega dos líneas. Para llevar incorpora una unidad de cada empaque asociado por cada unidad del producto; Comer aquí no incorpora esos adicionales. El precio configurado se muestra dentro del precio de la línea y se valida nuevamente en el servidor.

El pedido conserva la modalidad en su observación por detalle, visible para preparación, y el consumo exacto en la instantánea de inventario. Las anulaciones y devoluciones que reponen inventario usan esa instantánea, con el mecanismo existente, incluyendo los empaques consumidos. Los costos históricos incluyen el costo del ingrediente del empaque.

La migración agrega un campo booleano con valor false; no activa reglas, cambia recetas ni modifica existencias. Los clientes anteriores conservan su tratamiento de adicionales. Antes de activar un empaque hay que actualizar/recargar el POS de los cajeros. La automatización corresponde al POS de restaurante; no asigna modalidades a pedidos de la tienda pública ni presupone que todos los domicilios usan ese empaque.
