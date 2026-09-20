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
   - `impresoraHost` y `impresoraPuerto`: la IP y puerto de tu impresora térmica (normalmente el puerto es `9100`).
3. Guarda el archivo.

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
- Si dice que no pudo conectar a la impresora, confirma que `impresoraHost` sea la IP correcta y que la impresora esté encendida y en la misma red.
- Mientras el agente no esté funcionando, el sistema sigue imprimiendo por la ventana del navegador — no se pierde ninguna venta.
