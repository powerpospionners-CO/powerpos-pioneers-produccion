# Capacitación de Trailer del Sabor

Esta preparación se despliega desde `codex/capacitacion-trailer`, en dos aplicaciones y una base independientes. No fusionar esta rama en producción: el arranque de API de esta rama es exclusivo de capacitación.

## Aislamiento

- Frontend previsto: `https://capacitacion.powerpospioneers.com`.
- API prevista: `https://api-capacitacion.powerpospioneers.com`.
- Base y usuario exclusivos: `u748056473_ppcapacitacion`.
- El arranque rechaza las bases productivas y credenciales SMTP, WhatsApp y pagos externos.
- Datos ficticios: empresa 1 de capacitación, sede 1, menú pequeño, ingredientes y usuarios de práctica. El ID 1 reproduce las estaciones y el formato de tickets del Trailer en su base exclusiva.
- No se importan respaldos ni se reutilizan claves de sesión o impresión del restaurante.
- El arranque solo crea el esquema si la base está vacía. Una base con otra empresa se rechaza; reiniciar no borra las prácticas.

## Variables del sitio de API

`CAPACITACION=true`, `DATABASE_ENGINE=mysql`, `DATABASE_URL` apuntando a su base exclusiva, `MYSQL_DATABASE_URL` igual a esa conexión, `BACKGROUND_JOBS_ENABLED=false`, `IMPRESION_MODO=agente`, `ESC_POS_ENABLED=true`, `ESC_POS_BROWSER_FALLBACK=true`, `WEB_CONCURRENCY=1`, `EVENTOS_COMPARTIDOS=false`, `JWT_SECRET` nuevo de al menos 32 caracteres y `CAPACITACION_PASSWORD` nueva de al menos 16 caracteres. No copiar las variables de producción.

Compilar en `api` con `npm run build`; iniciar con `npm start`. El script de inicio prepara esquema y datos ficticios y luego inicia la API. Los archivos de subida deben permanecer en la carpeta propia de esta aplicación.

## Variables del sitio web

`NEXT_PUBLIC_CAPACITACION=true`, `NEXT_PUBLIC_API_URL=https://api-capacitacion.powerpospioneers.com`, `API_INTERNAL_URL=https://api-capacitacion.powerpospioneers.com`. Compilar en `web` con `npm run build`. La franja de capacitación aparece en las pantallas; robots bloquea rastreo y el sitemap queda vacío.

## Usuarios iniciales

- `admin@capacitacion.example.test`: administración y financiero.
- `caja@capacitacion.example.test`: ventas y caja.
- `cocina@capacitacion.example.test`: cocina.

La contraseña es la definida exclusivamente en `CAPACITACION_PASSWORD`. No es una cuenta del restaurante real.

## Impresión local

Usar una copia separada de `api/agente-impresion` en el computador del restaurante. Configurar `apiUrl` con la API de capacitación y generar el token desde Configuración dentro de esa misma aplicación. No cambiar el token ni la configuración del agente productivo.

Completar la IP privada de la impresora o el nombre compartido USB cuando esté conectada. El agente requiere Node.js instalado. Antes de usar las dos sesiones, comprobar a qué entorno está conectada cada copia del agente. Los tickets, comandas y cierres enviados por la API de pruebas llevan `PRUEBA / CAPACITACION` y `SIN VALIDEZ COMERCIAL`.

La salida física, alimentación y corte de papel solo se verifican al conectar la impresora en el negocio. El formato usa el flujo de estaciones del Trailer (plancha y fritos) y papel de 80 mm.

## Recorrido sugerido

1. Confirmar la franja de capacitación y entrar como administrador.
2. Revisar menú, receta, ingredientes, existencias, costos y adicional de queso.
3. Entrar como caja y abrir una caja con una base ficticia.
4. Registrar hamburguesa y bebida; practicar exclusiones, adicionales y observaciones.
5. Enviar las comandas a sus estaciones e imprimir el ticket de prueba.
6. Practicar cobro en efectivo, transferencia y pago mixto.
7. Registrar un gasto ficticio y revisar ingresos, egresos y reportes financieros.
8. Revisar los cambios en inventario y cerrar la caja de práctica.

Financiero ya admite restaurantes por plan y permisos. La valoración de ingredientes dentro del balance financiero requiere una revisión separada: el balance actual consulta productos con stock, no incluye directamente las existencias de ingredientes. La configuración vigente de la empresa real se confirma con su sesión administrativa; esta preparación no modifica sus permisos.
