# Tienda pública e identidad del logo

La plantilla pública compartida se inspira en el boceto de Figma Make aportado el 12 de noviembre de 2026: encabezado con navegación y búsqueda, portada, categorías, catálogo, detalle, pedido, presentación y contacto. Usa datos reales del negocio; no copia el catálogo de ejemplo, sus precios ni afirmaciones comerciales. El flujo actual de pedidos y seguimiento permanece conectado a la API.

Al crear una empresa se mantiene su enlace automático de tienda. El administrador sube el logo desde **Tu tienda web → Diseño e información**, o desde **Configuración de empresa**. La tienda usa inicialmente un color neutro de respaldo hasta recibir el logo; no se exige una imagen para impedir operaciones de caja.

El servidor reduce la imagen, ignora los píxeles transparentes y el fondo blanco, y agrupa colores para seleccionar un principal y un secundario. No usa servicios externos ni envía el logo a un proveedor de IA. Los colores se guardan con el logo y la configuración de la empresa, en una transacción de su base operativa. No requiere migración: utiliza `tiendaConfig`.

**Usar automáticamente los colores de mi logo** viene activado. Cambiar el logo recalcula la paleta. Desactivarlo permite seleccionar un color manual; un logo posterior conserva esa elección. El navegador elige texto blanco u oscuro según contraste y genera un fondo claro del color principal. El logo siempre conserva sus proporciones. El encabezado y pie muestran el logo; la portada usa la imagen configurada, el primer producto con imagen o la identidad de la empresa si todavía no hay productos.

La paleta tiene carácter aproximado: un logo fotográfico, multicolor o monocromático puede requerir ajuste manual. Los logos existentes se analizan al volver a subirlos; no se descargan archivos históricos automáticamente. La paleta enviada desde el navegador no sustituye la que calculó el servidor.

La plantilla incluye búsqueda por nombre/descripción, categorías reales, orden por nombre/precio y detalle de producto accesible mediante diálogo nativo. No agrega un chatbot de IA ni modifica el cobro, las tarifas de entrega o las condiciones del negocio.

Validación local: 5 pruebas backend de extracción/persistencia y 56 pruebas web aprobadas; TypeScript de API y web y compilación completa web aprobados. Revisión visual con datos ficticios en escritorio y móvil de 390 px, con paletas naranja y azul, apertura de detalle y agregado al carrito. Los cambios no están publicados en producción.
