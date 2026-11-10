# Creación de empresas y bases independientes

El acceso administrativo permanece en el portal desde el que se inicia sesión, por ejemplo `https://app.powerpospioneers.com/login`. El identificador de tienda no se interpreta como un dominio configurado. Los dominios comerciales existentes siguen pudiendo usarse directamente; crear una empresa no requiere configurar DNS para iniciar sesión.

En MySQL con aislamiento activo, configurar estas variables privadas en la API antes de crear empresas:

```env
HOSTINGER_ACCOUNT=u123456789
HOSTINGER_WEBSITE_DOMAIN=api.ejemplo.com
HOSTINGER_API_TOKEN=TOKEN_PRIVADO_DE_HOSTINGER
```

La cuenta debe coincidir con el prefijo de la base central en `DATABASE_URL`. Conservar también `SEDE_DATABASE_ENCRYPTION_KEY`, la clave existente de las conexiones. Nunca cambiar esa clave para activar esta función. El token se obtiene desde la cuenta de Hostinger, se guarda solo en el servidor y debe permitir gestionar bases de esa cuenta.

La API comprueba la configuración antes de guardar una nueva empresa. Después guarda empresa y administradores en una transacción, reserva una conexión cifrada con nombre y contraseña aleatorios, crea una base con usuario propio mediante la API oficial de Hostinger y carga el esquema y los administradores. La sede solo se activa después de verificar sus datos. Las bases que ya están conectadas se conservan.

Si la llamada al proveedor o la carga inicial falla, la respuesta identifica `pendienteActivacion: true`. La empresa y sus administradores están guardados. En Superadmin, abrir los administradores de esa empresa y usar **Preparar sedes pendientes**. El reintento conserva las credenciales y consulta si la base ya existe antes de solicitar otra. Nunca volver a crear la misma empresa para resolver una activación pendiente.

La arquitectura conserva una base de control y una base operativa independiente por sede. La primera sede de cada empresa recibe su propia base; las sedes adicionales también quedan separadas. No se habilitan conexiones MySQL remotas desde cualquier dirección ni se comparten credenciales con el navegador.

La compilación `npm run build:mysql` genera y empaqueta el esquema inicial. Publicar tanto API como web y comprobar primero que las empresas existentes siguen accesibles. Para validar creación real, usar una empresa de ensayo autorizada y comprobar que su registro de sede queda ACTIVA y que el administrador entra desde el portal central. Las pruebas con proveedor simulado no sustituyen esa comprobación.

Contrato del proveedor: [crear bases y usuarios en Hostinger](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingDatabasesApi.md), [campos de la solicitud](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingV1DatabasesCreateDatabaseRequest.md).
