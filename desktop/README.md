# PowerPOS para Windows

La aplicación utiliza el sistema y las bases de Hostinger. La operación completa necesita internet; el POS comercial conserva una cola local para cortes breves, que debe sincronizarse después. El cierre por inactividad funciona también cuando se pierde la conexión. No se instala ni se inicia un agente de impresión aparte.

## Instalar en la caja

1. Ejecuta `PowerPOS-Instalar-1.0.0.exe` e instala para tu usuario de Windows.
2. Abre PowerPOS desde el acceso directo. Selecciona Trailer del Sabor o Enchila Market Pereira.
3. Pulsa **Buscar impresoras automáticamente**. Con una sola candidata se completa la IP; si aparecen varias, elige la impresora de esa caja. También puedes escribir su IP privada. El puerto utilizado es 9100.
4. Guarda e inicia sesión con el usuario habitual de la empresa.
5. En la primera venta real comprueba el recibo, las comandas y el cajón. La prueba de software comprueba el envío, pero no puede confirmar físicamente el papel ni la apertura del cajón.

Usa **Archivo → Configurar empresa e impresora** para cambiar la selección. La IP queda guardada en el perfil de Windows; si deja de responder se busca nuevamente la impresora en las redes privadas conectadas. Nunca se elige automáticamente entre varias candidatas. No se guardan credenciales de Hostinger ni contraseñas de usuario en este archivo.

La ventana utiliza aislamiento de contexto, sandbox y validación de los mensajes de impresión. No permite ejecutar Node.js desde las páginas, abrir ventanas arbitrarias, ignorar errores de certificados ni enviar trabajos a direcciones públicas. La API sigue comprobando el usuario, empresa, sede y permisos. Los trabajos pasan por una cola local y no se reintentan automáticamente si ya pudo haberse enviado contenido, para evitar duplicados.

El instalador no tiene todavía firma comercial de Windows. Distribúyelo únicamente desde un canal privado de PowerPOS junto a su hash SHA-256. No se implementó un actualizador de ejecutables: la interfaz se actualiza desde Hostinger, y una actualización del programa requiere un instalador nuevo.

## Aperturas con llave

En el POS, junto a **Cerrar caja**, aparece **Registrar apertura con llave**. Se exige un motivo y se registra la identidad autenticada, caja, sede y fecha; queda marcado como reporte manual. El aviso usa las preferencias de alertas de los administradores. Registrar el evento no abre el cajón.

Digital POS y Jtech son marcas; sin el modelo y un sensor compatible no se puede confirmar que reporten la llave. Esta versión no inventa detección física ni confunde una orden enviada con una apertura detectada.

## Desarrollo

Desde esta carpeta: `npm ci`, `npm test`, `npm run smoke` y `npm run build`. El smoke test inicia una ventana oculta y guarda una captura y el estado de sandbox en `dist/`. Los archivos generados y dependencias no se incluyen en Git.
