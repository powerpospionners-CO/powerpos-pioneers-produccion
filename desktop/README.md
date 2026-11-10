# PowerPOS para Windows — 1.2.0

La aplicación utiliza el sistema y las bases de Hostinger. La operación completa necesita internet; el POS comercial conserva una cola local para cortes breves, que debe sincronizarse después. El cierre por inactividad funciona también cuando se pierde la conexión. No se instala ni se inicia un agente de impresión aparte.

## Instalar en la caja

1. Cierra PowerPOS y ejecuta `PowerPOS-Instalar-1.2.0.exe`. Instala para el mismo usuario de Windows. No necesitas desinstalar la versión anterior; se conserva la configuración del mismo perfil.
2. Abre PowerPOS desde el acceso directo. No se muestra un listado de clientes: el usuario y contraseña identifican la empresa y sede.
3. Puedes elegir **Configurar impresora después** para entrar sin IP. Para imprimir, selecciona **Red por IP** y busca la impresora o escribe su IP privada (puerto 9100). Si aparecen varias, elige la de esa caja. También puedes seleccionar **Instalada en Windows** para una térmica USB o una cola de Windows: instala primero el controlador del fabricante y elige su nombre en la lista. Debe ser compatible con ESC/POS RAW; una impresora cualquiera no es suficiente.
4. Pulsa **Imprimir tirilla de prueba** y confirma que salió papel. No registra ventas ni abre el cajón.
5. Guarda e inicia sesión con el usuario habitual de la empresa. En la primera venta real comprueba el recibo, las comandas y el cajón. El envío a TCP o la aceptación de Windows no confirma físicamente el papel ni la apertura del cajón.

Usa **Archivo → Configurar impresora** para cambiar la impresora. Al guardar una impresora de red encendida se registra su identificación MAC junto a la IP. Ambas quedan en el perfil de Windows. No se guardan credenciales de Hostinger ni contraseñas de usuario en este archivo.

### Si la impresora cambia de IP

PowerPOS comprueba la impresora al iniciar, al cambiar el día (hora de Colombia), al reanudar Windows y antes de enviar documentos. Si la IP anterior dejó de corresponder a la MAC registrada, busca la misma impresora en las redes privadas conectadas y guarda automáticamente su nueva IP. Reconoce la MAC incluso si hay otras impresoras o si otro equipo recibió la dirección anterior; nunca lo sustituye por la primera candidata.

Si está apagada o no está en la red, conserva la identidad y vuelve a comprobar al minuto siguiente mientras PowerPOS esté abierto. El estado aparece en **Archivo → Acerca de PowerPOS**. No imprime ni abre el cajón para comprobar la conexión. Los trabajos cuyo envío fue incierto siguen sin repetirse automáticamente.

La identificación requiere acceso a la impresora en la misma red local mediante la tabla ARP de Windows. Si actualizas desde una versión sin MAC guardada y la IP antigua ya cambió, selecciona y guarda una vez la impresora correcta. Si sustituyes físicamente la impresora, vuelve a seleccionarla y guardar para registrar la nueva MAC.

La ventana utiliza aislamiento de contexto, sandbox y validación de los mensajes de impresión. No permite ejecutar Node.js desde las páginas, abrir ventanas arbitrarias, ignorar errores de certificados ni enviar trabajos a direcciones TCP públicas. Las pantallas secundarias no reciben el puente de impresión ni configuración. La API sigue comprobando el usuario, empresa, sede y permisos. Los trabajos pasan por una cola local y no se reintentan automáticamente si ya pudo haberse enviado contenido, para evitar duplicados. Los cierres guardados se conservan si falla la impresión.

La impresión de Windows usa el spooler RAW con argumentos separados, sin construir comandos con el nombre de la impresora. El script se ejecuta en un proceso oculto; no cambia permanentemente la política de ejecución de Windows.

## Recepción automática sin agente separado

La impresión de ventas y cierres solicitados desde la aplicación usa la sesión normal. Para recibir también los trabajos iniciados por el servidor (por ejemplo, un cierre automático):

1. Un administrador obtiene el token de la empresa y sede correctas en **Configuración → Impresora en red → Generar token**. Regenerarlo invalida el anterior; coordina el cambio con la caja.
2. En **Archivo → Configurar impresora → Recepción automática de impresión**, pega el token y guarda. Se cifra con la protección de datos del usuario de Windows y no vuelve a mostrarse.
3. Cierra el agente anterior y retira su inicio automático si ya no se utiliza. Usa una sola aplicación receptora por sede: el canal local del servidor puede entregar un trabajo a varios receptores.
4. Mantén PowerPOS abierto, con internet y la impresora encendida. En **Archivo → Acerca de PowerPOS** puedes consultar versión, impresora y estado de recepción. El servidor debe tener `IMPRESION_MODO=agente` e impresión ESC/POS habilitada; la aplicación no modifica esas opciones del servidor.

El receptor se reconecta tras cortes, comparte la cola con la caja y recuerda los IDs recibidos para evitar repetir trabajos al perder la confirmación. No reenvía documentos cuyo envío sea incierto. Al migrar una instalación con dominio anterior se retira el token receptor; vuelve a configurar el de la sede correcta. Si cambias de empresa en el mismo equipo, desactiva o sustituye el receptor anterior. Marca **Desactivar recepción automática** para retirarlo del equipo. Si copias el perfil a otro usuario o equipo, vuelve a introducir el token.

## Integración con el sistema actual

- El acceso usa siempre el portal central al iniciar, salir y vencer la sesión.
- Las pantallas de cliente y llamado abren ventanas independientes del mismo dominio; se cierran al salir por el login o abrir la configuración.
- Los recibos de respaldo pueden abrir la ventana de impresión. Los archivos exportados muestran un diálogo para guardarlos.
- Los enlaces externos HTTPS, incluido Wompi, abren el navegador de Windows y conservan la ventana de PowerPOS. Después del pago, vuelve a PowerPOS y actualiza para consultar el resultado.
- Las empresas nuevas acceden con sus credenciales sin modificar ni reinstalar el programa; no existe un catálogo de clientes incorporado.

Los módulos y novedades web llegan desde Hostinger al publicarse. Estas correcciones de escritorio no necesitan desplegar cambios en web/API. No limpies el perfil si hay ventas offline sin sincronizar.

El instalador no tiene todavía firma comercial de Windows. Distribúyelo únicamente desde un canal privado de PowerPOS junto a su hash SHA-256. No se implementó un actualizador de ejecutables: la interfaz se actualiza desde Hostinger, y una actualización del programa requiere un instalador nuevo.

## Aperturas con llave

En el POS, junto a **Cerrar caja**, aparece **Registrar apertura con llave**. Se exige un motivo y se registra la identidad autenticada, caja, sede y fecha; queda marcado como reporte manual. El aviso usa las preferencias de alertas de los administradores. Registrar el evento no abre el cajón.

Digital POS y Jtech son marcas; sin el modelo y un sensor compatible no se puede confirmar que reporten la llave. Esta versión no inventa detección física ni confunde una orden enviada con una apertura detectada.

## Desarrollo

Desde esta carpeta: `npm ci`, `npm test`, `npm run smoke`, `npm run build` y `npm run verificar:paquete`. Si el equipo no soporta capturas, define `$env:POWERPOS_SMOKE_CAPTURE='0'` antes del smoke.

El smoke usa un perfil aislado y páginas/API simuladas. Comprueba el puente, aislamiento, login central/retorno, pantallas, recibos, descargas, enlaces externos y conservación del cierre ante un fallo de impresión. No usa credenciales productivas, registra ventas ni imprime físicamente. Guarda los resultados en `dist/comprobacion-escritorio.json`.

Para comprobar el ejecutable empaquetado, define `POWERPOS_SMOKE_DIR` con una ruta absoluta escribible y `POWERPOS_SMOKE_CAPTURE=0`, y ejecuta `dist/win-unpacked/PowerPOS.exe --smoke-test`. El verificador compara el paquete con el código, valida la versión y genera el hash del instalador y un manifiesto. Las pruebas de red simulan cambios de IP, reasignación de la IP anterior, varias impresoras, dispositivos apagados y el cambio de día de Bogotá. Los archivos generados y dependencias no se incluyen en Git.
