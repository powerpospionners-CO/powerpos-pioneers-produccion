# Seguridad de usuarios y modo soporte

## Correcciones de seguridad

- **Escalada de privilegios del gerente.** El gerente solo crea, activa o desactiva y cambia permisos de cajeros, cocineros y domiciliarios. No puede crear administradores ni gerentes, ni tocarlos.
- **Cuentas propias.**
  - Nadie puede desactivarse ni cambiarse los permisos a sí mismo.
  - Una empresa nunca se queda sin administradores activos.
- **Contraseñas.**
  - Mínimo 10 caracteres, con letras y números, y máximo 72 bytes.
  - La regla aplica al crear usuarios, al editarlos, en Mi perfil, al registrar una empresa y en los administradores creados por el superadministrador. Antes, al crear un usuario no se validaba la contraseña y el superadministrador aceptaba 6 caracteres.
- **Mi perfil.**
  - Cambiar la contraseña o el correo exige la contraseña actual.
  - Al cambiar la contraseña se cierran las sesiones registradas del usuario. Lo mismo ocurre cuando el administrador le restablece la contraseña.
  - El correo nuevo se valida y debe ser único.
- **Privacidad.** El personal operativo (cajeros, cocineros, domiciliarios) solo ve nombre, rol y estado de los usuarios, sin correos ni permisos.
- **Sesión en el enlace.** `?token=` se acepta solo en `/pedidos/stream`, porque EventSource no envía cabeceras. En el resto de rutas un enlace con sesión podía quedar en registros o historiales.
- **Archivos subidos.**
  - La extensión sale del tipo de imagen aceptado, no del nombre del archivo.
  - `/uploads` se sirve con `Content-Security-Policy: sandbox` y `nosniff`, sin archivos ocultos. Así un archivo disfrazado no se ejecuta.

## Modo soporte del superadministrador

Sirve para revisar el panel de una empresa sin conocer la contraseña ni el 2FA de su administrador.

**Cómo se usa:**
1. Superadmin → empresa → **Ver el panel de la empresa (solo lectura)**.
2. Elige la sede y escribe el motivo (10 a 200 caracteres).

**Qué pasa al entrar:**
- Se entrega una ficha de 30 minutos como un administrador virtual de la empresa (id 0, "Soporte PowerPOS"), con los permisos y el plan de la empresa.
- El superadministrador conserva su sesión en esa pestaña. Al salir, o cuando la ficha vence, vuelve a ella.

**Controles:**
- **Solo lectura.** El API rechaza cualquier escritura (`SOPORTE_SOLO_LECTURA`); solo permite registrar la navegación.
- **Auditoría.**
  - En la base de control queda la entrada `SOPORTE` con el superadministrador, la sede, el motivo y el vencimiento.
  - Cada consulta queda en la Auditoría de la empresa como "Soporte PowerPOS".
- **Aviso.** Los administradores reciben un correo en su correo personal registrado, y también llega al correo de la empresa.
- **Validez.** La ficha deja de valer si el superadministrador se desactiva o la empresa queda inactiva. No sirve si la base de la sede no está activa.
- **Acceso.** Requiere una sesión de superadministrador, que ya exige verificación en dos pasos.
- **Aviso visible.** Una franja azul muestra que se está en modo soporte, la empresa, la sede, el tiempo restante y el botón para salir.

## 2FA obligatoria para administradores

La verificación en dos pasos es obligatoria siempre para el superadministrador y para **todo administrador de empresa**, sin importar la política de la empresa:
- Si no la tienen activa, al iniciar sesión se les lleva a Seguridad para activarla. Mientras tanto, el API solo les permite usar `/auth/seguridad/*`.
- No la pueden desactivar.

Para los gerentes sigue dependiendo de la opción "Exigir la verificación en dos pasos también a los gerentes" en Seguridad del equipo. Los demás roles no tienen la obligación.

## Restablecer la 2FA desde el superadministrador

En el panel del superadministrador, cada administrador de empresa tiene el botón **Restablecer 2FA**. Sirve cuando el administrador perdió el celular y los códigos de recuperación y no hay otro administrador que lo ayude.

**Para restablecer, el superadministrador debe:**
- escribir el motivo, de 10 a 200 caracteres;
- confirmar con su contraseña;
- confirmar con su propio código de verificación.

**Qué pasa al restablecer:**
- Se quita la 2FA del usuario y se cierran sus sesiones en todas las sedes de la empresa donde exista su correo.
- Queda registrado en la auditoría de control, con la acción `RESTABLECER_2FA`.
- Se le avisa al usuario a su correo personal.
- La próxima vez que el usuario entre, el sistema le pide activar la 2FA otra vez.
