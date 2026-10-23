# PowerPOS Pioneers

## Documentación del proyecto

Consulta el [expediente académico y técnico](docs/README.md) y el [paquete de entrega al cliente](docs/cliente/README.md), con requerimientos, diagramas entidad-relación, diccionario de datos, API, instalación, manuales, pruebas y acta de entrega. Las versiones imprimibles están en [docs/entregables](docs/entregables/).

El expediente inicial describe el código del 15 de septiembre de 2026. El estado de arquitectura, las correcciones del 23 de octubre y los pasos de activación están en [operación y validación](docs/operacion-y-validacion.md).

Sistema POS multiempresa con flujos de restaurante y comercio.

## ¿Qué es PowerPOS Pioneers?

El super admin configura cada empresa como restaurante, supermercado, tienda u otro comercio. Las empresas existentes conservan el tipo restaurante mediante el valor predeterminado de la migración.

## Tipos de negocio y apariencia

- **Restaurante:** conserva el POS con recetas, adicionales, comandas y cocina KDS.
- **Supermercado, tienda y comercio:** usan un POS comercial con búsqueda por nombre o código de barras, carrito, caja, pago, recibo y existencias por producto. Las ventas quedan entregadas al cobrarse y no pasan por cocina.
- **Códigos de barras por sabor:** un producto puede tener varios códigos alternativos con su sabor (por ejemplo, Pulparindo Mango o Sandía). Al escanear se identifica el sabor en la venta y el recibo, conservando un solo producto, precio e inventario compartido; no requiere crear presentaciones.
- **Recaudo de efectivo semanal (Enchila Market Pereira):** al cerrar cada día se registra el efectivo retirado de la gaveta, se deja la base fija de cambio y se concilia el efectivo contado. El panel de recaudo suma esos retiros de lunes a domingo y permite registrar la consignación del lunes siguiente, con fecha, referencia y diferencias. La base fija se configura por sucursal y no se incluye en el valor semanal consignado.
- **Super admin:** elige el tipo al crear la empresa y puede cambiarlo en su configuración. Al cambiar una empresa existente a comercio, revisa los códigos y existencias de sus productos antes de vender.
- **Tema:** el botón de sol/luna en la barra superior permite alternar claro y oscuro; la preferencia se guarda en el navegador.

El comercio incluye devoluciones, crédito, presentaciones y venta a granel; el inventario guarda unidades base enteras (unidades, gramos o mililitros). El aislamiento físico por sede utiliza una base operativa independiente y una base central de control. Los lectores de códigos que funcionan como teclado son compatibles. La integración de balanzas y otros dispositivos especiales depende de su protocolo. La facturación electrónica DIAN no está implementada; el campo de habilitación no equivale a una integración fiscal.

La migración `20260919100000_ingredientes_por_empresa` asigna cada ingrediente a una empresa. Si detecta que un ingrediente está compartido entre empresas o no puede identificar su dueño en una base con varias empresas, se detiene para evitar una asignación incorrecta. La API filtra inventario, ventas, cajas y usuarios usando la empresa del usuario autenticado, y valida las referencias entre registros antes de guardarlas.

## Módulos implementados

- ✅ Sistema POS Web — ventas rápidas con exclusiones de ingredientes
- ✅ KDS Cocina — pantalla en tiempo real para cocineros
- ✅ Dashboard administrativo — métricas y control de pedidos
- ✅ Gestión de productos y categorías
- ✅ Inventario inteligente — descuento automático por receta
- ✅ Autenticación JWT con roles
- ✅ Arquitectura multiempresa
- ✅ Compras, proveedores, crédito, devoluciones y administración financiera
- ✅ Tienda pública, domicilios, fidelización y distribuidores
- ✅ Suscripciones y validación de pagos Wompi
- ✅ Aplicación Windows con impresión local — ver [desktop/README.md](desktop/README.md)

## Roles del sistema

| Rol | Acceso |
|-----|--------|
| SUPERADMIN | Gestión global de empresas |
| ADMIN_EMPRESA | Administración de su empresa según plan y permisos |
| GERENTE | Gestión operativa, productos y reportes según permisos |
| CAJERO | POS — registro de pedidos |
| COCINERO | KDS — pantalla de cocina |
| DOMICILIARIO | Pedidos y operación de entregas autorizada |
| DISTRIBUIDOR | Pedidos de su perfil de distribución habilitado |

## Stack tecnológico

### Backend
- NestJS + TypeScript
- PostgreSQL o MySQL/MariaDB + Prisma ORM, con clientes separados
- JWT + Passport
- Eventos SSE locales o compartidos en base de datos mediante `EVENTOS_COMPARTIDOS`
- Docker

### Frontend
- Next.js 16 + TypeScript
- Tailwind CSS
- Zustand
- Axios

## Requisitos previos

- Node.js 22 LTS
- Docker Desktop
- npm

## Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/PowerPos-Pioneers.git
cd PowerPos-Pioneers
```

### 2. Levantar base de datos

```bash
docker-compose up -d
```

### 3. Configurar el backend

```bash
cd api
npm install
```

Crea el archivo `.env` en la carpeta `api`:

```env
DATABASE_URL="postgresql://powerpos:powerpos123@localhost:5432/powerpos_dev?schema=public"
JWT_SECRET="REEMPLAZAR_POR_UN_SECRETO_ALEATORIO_PRIVADO"
```

```bash
npx prisma migrate deploy
npx prisma db seed
```

Iniciar el servidor:

```bash
npm run start:dev
```

El backend corre en `http://localhost:3000`

### 4. Configurar el frontend

```bash
cd web
npm install
npm run dev
```

El frontend corre en `http://localhost:3001`

Ejecuta `npm run dev -- --port 3001` si el backend ocupa el puerto 3000. Configura `NEXT_PUBLIC_API_URL` al desplegar fuera del equipo local.

## Producción y comprobaciones

La documentación de migración registra MariaDB en Hostinger. No ejecutes las migraciones PostgreSQL contra MariaDB: usa el cliente y SQL del motor correspondiente. La configuración local en Docker sigue siendo PostgreSQL para desarrollo; Redis es opcional y no transporta los eventos actuales.

La API expone `/health` para comprobar el proceso y `/health/ready` para comprobar la base central y el estado de mantenimiento. Los permisos individuales se aplican además del rol y del plan, y nunca amplían lo autorizado a la empresa. Login y registro validan entradas y limitan intentos.

El canal compartido requiere aplicar la nueva tabla en control y cada sede antes de activar `EVENTOS_COMPARTIDOS=true`. Ver [procedimiento de operación](docs/operacion-y-validacion.md). Las acciones pendientes de impresión no se reenvían automáticamente cuando su entrega pudo haber ocurrido.

La integración continua está en `.github/workflows/validacion.yml`; incluye pruebas unitarias, contrato HTTP, flujo POS con bases efímeras PostgreSQL/MariaDB, compilación web y comprobación de escritorio. Un workflow preparado no acredita una ejecución remota hasta que GitHub lo ejecute.

## Usuarios de prueba

Estos usuarios pertenecen al seed de desarrollo. No cargues el seed ni reutilices estas contraseñas en producción.

| Usuario | Email | Password | Rol |
|---------|-------|----------|-----|
| Juan Carlos López | juan@donjuancho.com | Admin123* | ADMIN_EMPRESA |
| María Cocinera | maria@donjuancho.com | Cocina123* | COCINERO |
| Carlos Cajero | carlos@donjuancho.com | Cajero123* | CAJERO |

## Flujo de operación

1. **Cajero** inicia sesión → va al POS → registra pedido con exclusiones de ingredientes
2. **Pedido** aparece en cocina automáticamente en tiempo real
3. **Cocinero** ve exclusiones resaltadas en rojo → prepara → marca como listo
4. **Admin** monitorea todo desde el dashboard en tiempo real

## Estructura del proyecto
PowerPos-Pioneers/

├── api/                    # Backend NestJS

│   ├── src/

│   │   ├── auth/           # Autenticación JWT

│   │   ├── categorias/     # Gestión de categorías

│   │   ├── pedidos/        # Sistema POS

│   │   ├── productos/      # Gestión de productos

│   │   ├── prisma/         # Conexión base de datos

│   │   ├── sucursales/     # Gestión de sucursales

│   │   └── usuarios/       # Gestión de usuarios

│   └── prisma/

│       ├── schema.prisma   # Modelo de datos

│       └── seed.ts         # Datos de prueba

├── web/                    # Frontend Next.js

│   └── app/

│       ├── login/          # Pantalla de login

│       ├── pos/            # Sistema POS

│       ├── cocina/         # KDS Cocina

│       ├── dashboard/      # Panel administrativo

│       └── productos/      # Gestión de productos

└── docker-compose.yml      # PostgreSQL + Redis

## Características destacadas

- **Exclusiones de ingredientes** — el cajero puede marcar qué ingredientes no quiere el cliente en cada producto
- **Inventario automático** — al registrar un pedido se descuentan los ingredientes usados respetando las exclusiones
- **Multirol** — cada usuario ve solo lo que necesita según su rol
- **Tiempo real** — cocina y dashboard se actualizan automáticamente
- **Multiempresa** — arquitectura preparada para vender como SaaS a múltiples negocios

## Desarrollado por

PowerPOS Pioneers Team — 2026
