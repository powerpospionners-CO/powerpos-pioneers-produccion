# Agente de impresión PowerPOS

Programa pequeño que corre en el computador del negocio (el mismo que está en la
red de la impresora térmica) y hace de puente entre el sistema en la nube y la
impresora. Sin este agente, el sistema imprime igual, pero abriendo una ventana
de impresión del navegador en vez de mandarlo directo a la impresora.

## Requisitos

- Node.js instalado en el computador (el mismo que ya usa PowerPOS para desarrollo).
- Que el computador tenga acceso a internet y a la impresora en la red local.

## Configuración (una sola vez)

1. Copia `config.ejemplo.json` y renómbralo a `config.json`.
2. Ábrelo con el Bloc de notas y completa:
   - `apiUrl`: la dirección de tu backend (ej. `https://api.powerpospioneers.com`).
   - `token`: el que generas desde **Configuración → Impresora en red** dentro del sistema, con un usuario ADMIN_EMPRESA. Cada vez que lo regeneras, el anterior deja de funcionar.
   - `modoImpresora`: `"red"` si tu impresora tiene IP (la forma de siempre) o `"usb"` si está conectada por cable al computador. Ver la sección siguiente para el modo USB.
   - Si es `"red"`: completa `impresoraHost` y `impresoraPuerto` (normalmente el puerto es `9100`).
   - Si es `"usb"`: completa `impresoraCompartida` (ver abajo cómo obtenerlo).
3. Guarda el archivo.

## Imprimir por USB (impresora conectada por cable al computador)

Sirve para impresoras que no tienen IP, sino que van conectadas directo por
cable USB al mismo computador donde corre el agente.

1. Conecta la impresora e instala su driver normalmente en Windows (como
   instalarías cualquier impresora). Debe aparecer en **Configuración → Bluetooth
   y dispositivos → Impresoras y escáneres** (o "Dispositivos e impresoras" en
   versiones anteriores de Windows).
2. Haz clic derecho sobre esa impresora → **Propiedades de impresora** →
   pestaña **Compartir** → marca **"Compartir esta impresora"** y ponle un
   nombre corto, sin espacios (ej. `TicketUSB`). Guarda.
3. En `config.json`, pon `"modoImpresora": "usb"` y en `impresoraCompartida`
   escribe ese mismo nombre (ej. `"TicketUSB"`).
4. Reinicia el agente (cierra la ventana negra y vuelve a abrir `iniciar.bat`).

Con esto, el sistema sigue funcionando exactamente igual que con impresora de
red — el agente recibe cada ticket/comanda y los manda directo a esa
impresora, solo que ahora por el cable en vez de por la red.

## Uso

Haz doble clic en `iniciar.bat`. Va a abrir una ventana negra que muestra:

```
=== Agente de impresión PowerPOS ===
Conectando a https://api.powerpospioneers.com ...
✓ Conectado. Esperando trabajos de impresión...
```

Déjala abierta mientras el negocio esté operando — cada venta o comanda que se
registre en el sistema va a aparecer ahí y se va a imprimir sola.

Si se cierra la conexión (por ejemplo, se va el internet un momento), el agente
reintenta conectarse solo cada 5 segundos, sin que tengas que hacer nada.

## Dejarlo encendido siempre (arranca con Windows)

1. Presiona `Win + R`, escribe `shell:startup` y da Enter — se abre una carpeta.
2. Copia un acceso directo de `iniciar.bat` dentro de esa carpeta.
3. Desde ahora, cada vez que se encienda el computador, el agente arranca solo.

## Si algo no imprime

- Revisa que la ventana del agente siga abierta y diga "Conectado".
- Si dice un error de conexión al servidor, revisa que `apiUrl` y `token` en `config.json` estén bien copiados.
- Si dice que no pudo conectar a la impresora (modo red), confirma que `impresoraHost` sea la IP correcta y que la impresora esté encendida y en la misma red.
- Si dice que no pudo imprimir en el nombre compartido (modo USB), confirma que la impresora siga compartida en Windows con ese mismo nombre y que esté encendida y conectada por cable.
- Mientras el agente no esté funcionando, el sistema sigue imprimiendo por la ventana del navegador — no se pierde ninguna venta.
