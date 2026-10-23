-- CreateTable
CREATE TABLE `bases_sede` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `estado` LONGTEXT NOT NULL DEFAULT 'PREPARANDO',
    `conexionCifrada` LONGTEXT NOT NULL,
    `identidadBase` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NULL,
    `agenteHash` VARCHAR(191) NULL,
    `verificacion` JSON NULL,
    `verificadoEn` DATETIME(3) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bases_sede_sucursalId_key`(`sucursalId`),
    UNIQUE INDEX `bases_sede_identidadBase_key`(`identidadBase`),
    UNIQUE INDEX `bases_sede_slug_key`(`slug`),
    UNIQUE INDEX `bases_sede_agenteHash_key`(`agenteHash`),
    UNIQUE INDEX `bases_sede_empresaId_sucursalId_key`(`empresaId`, `sucursalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `control_aislamiento` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `activo` BOOLEAN NOT NULL DEFAULT false,
    `escriturasSuspendidas` BOOLEAN NOT NULL DEFAULT false,
    `actualizadoEn` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `escrituras_en_curso` (
    `id` VARCHAR(191) NOT NULL,
    `origen` LONGTEXT NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sello_base_sede` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `verificadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empresas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` LONGTEXT NOT NULL,
    `nit` VARCHAR(191) NOT NULL,
    `email` LONGTEXT NOT NULL,
    `telefono` LONGTEXT NULL,
    `direccion` LONGTEXT NULL,
    `logo` LONGTEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `impresionAgenteToken` VARCHAR(191) NULL,
    `tipoNegocio` ENUM('RESTAURANTE', 'SUPERMERCADO', 'TIENDA', 'COMERCIO') NOT NULL DEFAULT 'RESTAURANTE',
    `plan` ENUM('BASICO', 'MEDIUM', 'PREMIUM') NOT NULL DEFAULT 'BASICO',
    `permisos` JSON NOT NULL,
    `modoPreparacion` ENUM('KDS', 'COMANDAS') NOT NULL DEFAULT 'KDS',
    `facturacionElectronicaHabilitada` BOOLEAN NOT NULL DEFAULT false,
    `consumoEmpleadosHabilitado` BOOLEAN NOT NULL DEFAULT false,
    `catalogoHabilitado` BOOLEAN NOT NULL DEFAULT false,
    `catalogoFotosPublicas` BOOLEAN NOT NULL DEFAULT true,
    `recaudoEfectivoHabilitado` BOOLEAN NOT NULL DEFAULT false,
    `distribuidoresHabilitado` BOOLEAN NOT NULL DEFAULT false,
    `suscripcionVenceEn` DATETIME(3) NULL,
    `pagoExonerado` BOOLEAN NOT NULL DEFAULT false,
    `motivoExoneracion` LONGTEXT NULL,
    `soporteIncluidoHasta` DATETIME(3) NULL,
    `soportePagadoHasta` DATETIME(3) NULL,
    `tiendaSlug` VARCHAR(191) NOT NULL,
    `tiendaConfig` JSON NOT NULL,
    `fidelizacionConfig` JSON NOT NULL,
    `anunciosPantalla` JSON NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `empresas_nit_key`(`nit`),
    UNIQUE INDEX `empresas_impresionAgenteToken_key`(`impresionAgenteToken`),
    UNIQUE INDEX `empresas_tiendaSlug_key`(`tiendaSlug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion_planes` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `inicialMensual` INTEGER NOT NULL DEFAULT 29900,
    `mediumMensual` INTEGER NOT NULL DEFAULT 49900,
    `premiumMensual` INTEGER NOT NULL DEFAULT 89900,
    `soporteMensual` INTEGER NOT NULL DEFAULT 19900,
    `descuentoAnualMeses` INTEGER NOT NULL DEFAULT 1,
    `actualizadoEn` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagos_plan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `plan` ENUM('BASICO', 'MEDIUM', 'PREMIUM') NOT NULL,
    `periodicidad` ENUM('MENSUAL', 'ANUAL') NOT NULL,
    `monto` INTEGER NOT NULL,
    `estado` ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
    `referencia` VARCHAR(191) NOT NULL,
    `transaccionId` VARCHAR(191) NULL,
    `incluyePlan` BOOLEAN NOT NULL DEFAULT true,
    `incluyeSoporte` BOOLEAN NOT NULL DEFAULT false,
    `periodoDesde` DATETIME(3) NOT NULL,
    `periodoHasta` DATETIME(3) NOT NULL,
    `soporteDesde` DATETIME(3) NULL,
    `soporteHasta` DATETIME(3) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pagadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `pagos_plan_referencia_key`(`referencia`),
    UNIQUE INDEX `pagos_plan_transaccionId_key`(`transaccionId`),
    INDEX `pagos_plan_empresaId_creadoEn_idx`(`empresaId`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalogo_productos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `presentacion` LONGTEXT NULL,
    `descripcion` LONGTEXT NULL,
    `precio` DECIMAL(10, 2) NULL,
    `categoria` LONGTEXT NULL,
    `imagen` LONGTEXT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `origen` LONGTEXT NULL,
    `usos` JSON NOT NULL,
    `ocultoWeb` BOOLEAN NOT NULL DEFAULT false,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    INDEX `catalogo_productos_empresaId_idx`(`empresaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sucursales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `direccion` LONGTEXT NULL,
    `telefono` LONGTEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `baseEfectivoCaja` DECIMAL(10, 2) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NULL,
    `sucursalId` INTEGER NULL,
    `nombre` LONGTEXT NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` LONGTEXT NOT NULL,
    `rol` ENUM('SUPERADMIN', 'ADMIN_EMPRESA', 'GERENTE', 'CAJERO', 'COCINERO', 'DOMICILIARIO', 'DISTRIBUIDOR') NOT NULL,
    `permisos` JSON NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,
    `distribuidorId` INTEGER NULL,

    UNIQUE INDEX `usuarios_email_key`(`email`),
    UNIQUE INDEX `usuarios_distribuidorId_key`(`distribuidorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categorias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `parentId` INTEGER NULL,
    `nombre` LONGTEXT NOT NULL,
    `descripcion` LONGTEXT NULL,
    `icono` LONGTEXT NULL,
    `color` LONGTEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `categoriaId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `descripcion` LONGTEXT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `costo` DECIMAL(10, 2) NULL,
    `codigoBarras` VARCHAR(191) NULL,
    `controlaStock` BOOLEAN NOT NULL DEFAULT false,
    `stockActual` INTEGER NOT NULL DEFAULT 0,
    `stockMinimo` INTEGER NOT NULL DEFAULT 0,
    `ventaGranel` BOOLEAN NOT NULL DEFAULT false,
    `unidadGranel` LONGTEXT NULL,
    `esCombo` BOOLEAN NOT NULL DEFAULT false,
    `imagen` LONGTEXT NULL,
    `disponible` BOOLEAN NOT NULL DEFAULT true,
    `aceptaAdicionales` BOOLEAN NOT NULL DEFAULT true,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `productos_empresaId_codigoBarras_key`(`empresaId`, `codigoBarras`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `producto_codigos_barras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `codigoBarras` VARCHAR(191) NOT NULL,
    `sabor` LONGTEXT NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `producto_codigos_barras_productoId_idx`(`productoId`),
    UNIQUE INDEX `producto_codigos_barras_empresaId_codigoBarras_key`(`empresaId`, `codigoBarras`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `combo_componentes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `comboId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,

    UNIQUE INDEX `combo_componentes_comboId_productoId_key`(`comboId`, `productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lotes_producto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productoId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `cantidadRestante` INTEGER NOT NULL,
    `fechaVencimiento` DATETIME(3) NULL,
    `costo` DECIMAL(10, 2) NULL,
    `notas` LONGTEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    INDEX `lotes_producto_productoId_fechaVencimiento_idx`(`productoId`, `fechaVencimiento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `producto_presentaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productoId` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `factorUnidades` INTEGER NOT NULL DEFAULT 1,
    `precio` DECIMAL(10, 2) NOT NULL,
    `codigoBarras` LONGTEXT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `producto_presentaciones_productoId_nombre_key`(`productoId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ingredientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `unidad` LONGTEXT NOT NULL,
    `unidadCompra` LONGTEXT NULL,
    `factorConversion` DECIMAL(10, 3) NULL,
    `costoUnitario` DECIMAL(10, 4) NULL,
    `stock` DECIMAL(10, 3) NOT NULL,
    `stockMinimo` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ingredientes_empresaId_activo_idx`(`empresaId`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_inventario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ingredienteId` INTEGER NULL,
    `productoId` INTEGER NULL,
    `usuarioId` INTEGER NOT NULL,
    `tipo` LONGTEXT NOT NULL,
    `cantidadMovida` DECIMAL(10, 3) NOT NULL,
    `unidadCompra` LONGTEXT NULL,
    `factorAplicado` DECIMAL(10, 3) NULL,
    `stockAnterior` DECIMAL(10, 3) NOT NULL,
    `stockNuevo` DECIMAL(10, 3) NOT NULL,
    `descripcion` LONGTEXT NULL,
    `motivoMerma` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `movimientos_inventario_productoId_creadoEn_idx`(`productoId`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `producto_ingredientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productoId` INTEGER NOT NULL,
    `ingredienteId` INTEGER NOT NULL,
    `cantidad` DECIMAL(10, 3) NOT NULL,

    UNIQUE INDEX `producto_ingredientes_productoId_ingredienteId_key`(`productoId`, `ingredienteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `preparaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `descripcion` LONGTEXT NULL,
    `unidad` LONGTEXT NOT NULL DEFAULT 'porciones',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `preparacion_ingredientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `preparacionId` INTEGER NOT NULL,
    `ingredienteId` INTEGER NOT NULL,
    `cantidad` DECIMAL(10, 3) NOT NULL,
    `unidad` LONGTEXT NULL,
    `observacion` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lotes_preparacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `preparacionId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `loteNumero` LONGTEXT NULL,
    `cantidadProducida` DECIMAL(10, 3) NOT NULL,
    `pesoTotal` DECIMAL(10, 3) NULL,
    `pesoPorBolsa` DECIMAL(10, 3) NULL,
    `porcionesPorBolsa` DECIMAL(10, 3) NULL,
    `porcionesTotales` DECIMAL(10, 3) NULL,
    `observacion` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lote_preparacion_ingredientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `loteId` INTEGER NOT NULL,
    `ingredienteId` INTEGER NOT NULL,
    `cantidadUsada` DECIMAL(10, 3) NOT NULL,
    `unidad` LONGTEXT NULL,
    `observacion` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `producto_preparaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productoId` INTEGER NOT NULL,
    `preparacionId` INTEGER NOT NULL,
    `cantidad` DECIMAL(10, 3) NOT NULL DEFAULT 1,
    `unidad` LONGTEXT NOT NULL DEFAULT 'porciones',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `producto_preparaciones_productoId_preparacionId_key`(`productoId`, `preparacionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `adicionales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `ingredienteId` INTEGER NULL,
    `cantidad` DECIMAL(10, 3) NULL,
    `disponible` BOOLEAN NOT NULL DEFAULT true,
    `empaqueParaLlevar` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `producto_adicionales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productoId` INTEGER NOT NULL,
    `adicionalId` INTEGER NOT NULL,

    UNIQUE INDEX `producto_adicionales_productoId_adicionalId_key`(`productoId`, `adicionalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `documento` VARCHAR(191) NULL,
    `telefono` LONGTEXT NULL,
    `email` LONGTEXT NULL,
    `direccion` LONGTEXT NULL,
    `fechaNacimiento` DATETIME(3) NULL,
    `puntos` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `clientes_empresaId_documento_key`(`empresaId`, `documento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sucursalId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `clienteId` INTEGER NULL,
    `cajaId` INTEGER NULL,
    `numero` VARCHAR(191) NOT NULL,
    `estado` ENUM('PENDIENTE', 'EN_COCINA', 'LISTO', 'ENTREGADO', 'ANULADO') NOT NULL DEFAULT 'PENDIENTE',
    `metodoPago` ENUM('CREDITO', 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'MIXTO') NOT NULL DEFAULT 'EFECTIVO',
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `descuento` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL,
    `observacion` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,
    `puntosGanados` INTEGER NOT NULL DEFAULT 0,
    `puntosCanjeados` INTEGER NOT NULL DEFAULT 0,
    `valorPuntoAplicado` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `costoDomicilio` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `cambio` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `claveIdempotencia` VARCHAR(191) NULL,
    `consumoInventario` JSON NULL,
    `costoVentaHistorico` DECIMAL(14, 4) NULL,
    `puntosCreditoPendientes` INTEGER NOT NULL DEFAULT 0,
    `devueltoTotal` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `pedidos_numero_key`(`numero`),
    UNIQUE INDEX `pedidos_claveIdempotencia_key`(`claveIdempotencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proveedores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `documento` VARCHAR(191) NOT NULL,
    `email` LONGTEXT NULL,
    `telefono` LONGTEXT NULL,
    `direccion` LONGTEXT NULL,
    `plazoDias` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `proveedores_id_empresaId_key`(`id`, `empresaId`),
    UNIQUE INDEX `proveedores_empresaId_documento_key`(`empresaId`, `documento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cuentas_administrativas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `categoria` ENUM('VENTA', 'COSTO_VENTA', 'COMPRA_INSUMOS', 'COMPRA_MERCANCIA', 'NOMINA', 'SERVICIOS', 'ARRIENDO', 'MANTENIMIENTO', 'IMPUESTOS', 'COMISION_DISTRIBUIDOR', 'OTROS') NOT NULL DEFAULT 'OTROS',
    `compraGastoId` INTEGER NULL,
    `pedidoId` INTEGER NULL,
    `gastoRecurrenteId` INTEGER NULL,
    `periodoRecurrente` VARCHAR(191) NULL,
    `tercero` LONGTEXT NOT NULL,
    `documento` VARCHAR(191) NOT NULL,
    `descripcion` LONGTEXT NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `saldo` DECIMAL(12, 2) NOT NULL,
    `vencimiento` DATETIME(3) NOT NULL,
    `anulada` BOOLEAN NOT NULL DEFAULT false,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cuentas_administrativas_compraGastoId_key`(`compraGastoId`),
    UNIQUE INDEX `cuentas_administrativas_pedidoId_key`(`pedidoId`),
    INDEX `cuentas_administrativas_empresaId_tipo_vencimiento_idx`(`empresaId`, `tipo`, `vencimiento`),
    UNIQUE INDEX `cuentas_administrativas_gastoRecurrenteId_periodoRecurrente_key`(`gastoRecurrenteId`, `periodoRecurrente`),
    UNIQUE INDEX `cuentas_administrativas_empresaId_tipo_documento_key`(`empresaId`, `tipo`, `documento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gastos_recurrentes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `tercero` LONGTEXT NOT NULL,
    `categoria` ENUM('VENTA', 'COSTO_VENTA', 'COMPRA_INSUMOS', 'COMPRA_MERCANCIA', 'NOMINA', 'SERVICIOS', 'ARRIENDO', 'MANTENIMIENTO', 'IMPUESTOS', 'COMISION_DISTRIBUIDOR', 'OTROS') NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `diaVencimiento` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `gastos_recurrentes_empresaId_activo_idx`(`empresaId`, `activo`),
    UNIQUE INDEX `gastos_recurrentes_empresaId_nombre_key`(`empresaId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conteos_inventario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `aprobadorId` INTEGER NULL,
    `descripcion` LONGTEXT NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'PENDIENTE',
    `motivoResolucion` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resueltoEn` DATETIME(3) NULL,

    INDEX `conteos_inventario_empresaId_estado_creadoEn_idx`(`empresaId`, `estado`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalles_conteo_inventario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conteoId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `productoNombre` LONGTEXT NOT NULL,
    `stockEsperado` INTEGER NOT NULL,
    `stockContado` INTEGER NOT NULL,

    UNIQUE INDEX `detalles_conteo_inventario_conteoId_productoId_key`(`conteoId`, `productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `abonos_administrativos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cuentaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `referencia` LONGTEXT NOT NULL,
    `clave` VARCHAR(191) NOT NULL,
    `movimientoId` INTEGER NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `abonos_administrativos_clave_key`(`clave`),
    UNIQUE INDEX `abonos_administrativos_movimientoId_key`(`movimientoId`),
    INDEX `abonos_administrativos_cuentaId_idx`(`cuentaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conciliaciones_administrativas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `movimientoId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `referencia` LONGTEXT NOT NULL,
    `fechaBanco` DATETIME(3) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `conciliaciones_administrativas_movimientoId_key`(`movimientoId`),
    INDEX `conciliaciones_administrativas_empresaId_fechaBanco_idx`(`empresaId`, `fechaBanco`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `presupuestos_administrativos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `periodo` VARCHAR(191) NOT NULL,
    `categoria` ENUM('VENTA', 'COSTO_VENTA', 'COMPRA_INSUMOS', 'COMPRA_MERCANCIA', 'NOMINA', 'SERVICIOS', 'ARRIENDO', 'MANTENIMIENTO', 'IMPUESTOS', 'COMISION_DISTRIBUIDOR', 'OTROS') NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `usuarioId` INTEGER NOT NULL,

    UNIQUE INDEX `presupuestos_administrativos_empresaId_periodo_categoria_key`(`empresaId`, `periodo`, `categoria`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagos_pedido` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `metodoPago` ENUM('CREDITO', 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'MIXTO') NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pagos_pedido_pedidoId_idx`(`pedidoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_pedidos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precioUnitario` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `exclusiones` JSON NOT NULL,
    `observacion` LONGTEXT NULL,
    `costoVentaHistorico` DECIMAL(14, 4) NULL,
    `consumoInventario` JSON NULL,
    `presentacionId` INTEGER NULL,
    `presentacionNombre` LONGTEXT NULL,
    `varianteSabor` LONGTEXT NULL,
    `factorUnidades` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_pedido_adicionales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `detallePedidoId` INTEGER NOT NULL,
    `adicionalId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `cantidad` INTEGER NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `distribuidores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `zona` LONGTEXT NULL,
    `porcentajeComision` DECIMAL(5, 2) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `distribuidores_empresaId_codigo_key`(`empresaId`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos_distribuidor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero` VARCHAR(191) NOT NULL,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `distribuidorId` INTEGER NOT NULL,
    `clienteReferencia` LONGTEXT NULL,
    `estado` ENUM('ENTREGADO', 'ANULADO') NOT NULL DEFAULT 'ENTREGADO',
    `total` DECIMAL(10, 2) NOT NULL,
    `comisionPorcentaje` DECIMAL(5, 2) NOT NULL,
    `comisionMonto` DECIMAL(10, 2) NOT NULL,
    `liquidacionId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pedidos_distribuidor_numero_key`(`numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_pedidos_distribuidor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precioUnitario` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `presentacionId` INTEGER NULL,
    `presentacionNombre` LONGTEXT NULL,
    `factorUnidades` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `liquidaciones_distribuidor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `distribuidorId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `periodoDesde` DATETIME(3) NOT NULL,
    `periodoHasta` DATETIME(3) NOT NULL,
    `cantidadPedidos` INTEGER NOT NULL,
    `totalVentas` DECIMAL(10, 2) NOT NULL,
    `totalComision` DECIMAL(10, 2) NOT NULL,
    `movimientoFinancieroId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `liquidaciones_distribuidor_movimientoFinancieroId_key`(`movimientoFinancieroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cajas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sucursalId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `estado` ENUM('ABIERTA', 'CERRADA') NOT NULL DEFAULT 'ABIERTA',
    `montoInicial` DECIMAL(10, 2) NOT NULL,
    `montoFinal` DECIMAL(10, 2) NULL,
    `diferencia` DECIMAL(10, 2) NULL,
    `abiertaEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cerradaEn` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operaciones_venta_caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `pedidoId` INTEGER NOT NULL,
    `cajaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `clave` VARCHAR(191) NOT NULL,
    `tipo` LONGTEXT NOT NULL,
    `metodoPago` ENUM('CREDITO', 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'MIXTO') NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `motivo` LONGTEXT NOT NULL,
    `detalle` JSON NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `operaciones_venta_caja_clave_key`(`clave`),
    INDEX `operaciones_venta_caja_empresaId_pedidoId_idx`(`empresaId`, `pedidoId`),
    INDEX `operaciones_venta_caja_cajaId_idx`(`cajaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `retiros_efectivo_caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `cajaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `montoEsperado` DECIMAL(10, 2) NOT NULL,
    `montoRetirado` DECIMAL(10, 2) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `retiros_efectivo_caja_cajaId_key`(`cajaId`),
    INDEX `retiros_efectivo_caja_sucursalId_creadoEn_idx`(`sucursalId`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consignaciones_efectivo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `periodoInicio` DATE NOT NULL,
    `periodoFin` DATE NOT NULL,
    `ventasEfectivo` DECIMAL(10, 2) NOT NULL,
    `efectivoRecaudado` DECIMAL(10, 2) NOT NULL,
    `montoConsignado` DECIMAL(10, 2) NOT NULL,
    `fechaConsignacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `referencia` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consignaciones_efectivo_empresaId_periodoInicio_idx`(`empresaId`, `periodoInicio`),
    UNIQUE INDEX `consignaciones_efectivo_sucursalId_periodoInicio_key`(`sucursalId`, `periodoInicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos_caja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cajaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `tipo` ENUM('APERTURA', 'CIERRE', 'APERTURA_IRREGULAR', 'DIFERENCIA', 'MOVIMIENTO', 'EDICION_PAGO', 'ANULACION', 'CORRECCION') NOT NULL,
    `descripcion` LONGTEXT NOT NULL,
    `esAlerta` BOOLEAN NOT NULL DEFAULT false,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_financieros` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `tipo` ENUM('INGRESO', 'EGRESO') NOT NULL,
    `categoria` ENUM('VENTA', 'COSTO_VENTA', 'COMPRA_INSUMOS', 'COMPRA_MERCANCIA', 'NOMINA', 'SERVICIOS', 'ARRIENDO', 'MANTENIMIENTO', 'IMPUESTOS', 'COMISION_DISTRIBUIDOR', 'OTROS') NOT NULL,
    `descripcion` LONGTEXT NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pedidoId` INTEGER NULL,
    `comprobante` LONGTEXT NULL,
    `compraGastoId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `movimientos_financieros_compraGastoId_key`(`compraGastoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saldos_iniciales_cuenta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `desde` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `saldos_iniciales_cuenta_empresaId_key`(`empresaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compras_gastos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `categoria` ENUM('VENTA', 'COSTO_VENTA', 'COMPRA_INSUMOS', 'COMPRA_MERCANCIA', 'NOMINA', 'SERVICIOS', 'ARRIENDO', 'MANTENIMIENTO', 'IMPUESTOS', 'COMISION_DISTRIBUIDOR', 'OTROS') NOT NULL,
    `descripcion` LONGTEXT NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `proveedorId` INTEGER NULL,
    `condicionPago` LONGTEXT NOT NULL DEFAULT 'CONTADO',

    INDEX `compras_gastos_empresaId_fecha_idx`(`empresaId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordenes_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `proveedorId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `referencia` VARCHAR(191) NOT NULL,
    `descripcion` LONGTEXT NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'PENDIENTE',
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aprobadoPor` INTEGER NULL,
    `motivoCierre` LONGTEXT NULL,

    INDEX `ordenes_compra_empresaId_estado_idx`(`empresaId`, `estado`),
    UNIQUE INDEX `ordenes_compra_empresaId_referencia_key`(`empresaId`, `referencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalles_orden_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ordenId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `nombre` LONGTEXT NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `recibida` INTEGER NOT NULL DEFAULT 0,
    `costoUnitario` DECIMAL(12, 2) NOT NULL,

    UNIQUE INDEX `detalles_orden_compra_ordenId_productoId_key`(`ordenId`, `productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recepciones_orden_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `ordenId` INTEGER NOT NULL,
    `compraId` INTEGER NOT NULL,
    `clave` VARCHAR(191) NOT NULL,
    `solicitud` JSON NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `recepciones_orden_compra_compraId_key`(`compraId`),
    UNIQUE INDEX `recepciones_orden_compra_empresaId_clave_key`(`empresaId`, `clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalles_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `compraGastoId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `productoNombre` LONGTEXT NOT NULL,
    `cantidad` DECIMAL(10, 3) NOT NULL,
    `unidadCompra` LONGTEXT NOT NULL,
    `factorAplicado` INTEGER NOT NULL,
    `cantidadInventario` INTEGER NOT NULL,
    `costoUnitario` DECIMAL(12, 2) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,

    INDEX `detalles_compra_productoId_idx`(`productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consumos_empleados` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `empleadoNombre` LONGTEXT NOT NULL,
    `observacion` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consumo_empleado_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `consumoEmpleadoId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precioReferencia` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditorias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NULL,
    `usuarioId` INTEGER NULL,
    `accion` LONGTEXT NOT NULL,
    `entidad` LONGTEXT NOT NULL,
    `entidadId` INTEGER NULL,
    `detalle` JSON NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `auditorias_empresaId_creadoEn_idx`(`empresaId`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos_web` (
    `id` VARCHAR(191) NOT NULL,
    `empresaId` INTEGER NOT NULL,
    `sucursalId` INTEGER NOT NULL,
    `clave` VARCHAR(191) NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'RECIBIDO',
    `nombre` LONGTEXT NOT NULL,
    `telefono` LONGTEXT NOT NULL,
    `direccion` LONGTEXT NOT NULL,
    `zona` LONGTEXT NOT NULL,
    `observacion` LONGTEXT NULL,
    `items` JSON NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `costoDomicilio` DECIMAL(10, 2) NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `metodoPago` ENUM('CREDITO', 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'MIXTO') NOT NULL DEFAULT 'EFECTIVO',
    `pedidoId` INTEGER NULL,
    `repartidorId` INTEGER NULL,
    `motivo` LONGTEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pedidos_web_pedidoId_key`(`pedidoId`),
    INDEX `pedidos_web_empresaId_estado_creadoEn_idx`(`empresaId`, `estado`, `creadoEn`),
    UNIQUE INDEX `pedidos_web_empresaId_clave_key`(`empresaId`, `clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_powerpos_transaction_locks` (
    `namespace` VARCHAR(32) NOT NULL,
    `scope` VARCHAR(32) NOT NULL,

    PRIMARY KEY (`namespace`, `scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pagos_plan` ADD CONSTRAINT `pagos_plan_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalogo_productos` ADD CONSTRAINT `catalogo_productos_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sucursales` ADD CONSTRAINT `sucursales_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_distribuidorId_fkey` FOREIGN KEY (`distribuidorId`) REFERENCES `distribuidores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categorias` ADD CONSTRAINT `categorias_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categorias` ADD CONSTRAINT `categorias_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `categorias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `categorias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto_codigos_barras` ADD CONSTRAINT `producto_codigos_barras_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combo_componentes` ADD CONSTRAINT `combo_componentes_comboId_fkey` FOREIGN KEY (`comboId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combo_componentes` ADD CONSTRAINT `combo_componentes_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lotes_producto` ADD CONSTRAINT `lotes_producto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto_presentaciones` ADD CONSTRAINT `producto_presentaciones_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ingredientes` ADD CONSTRAINT `ingredientes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_ingredienteId_fkey` FOREIGN KEY (`ingredienteId`) REFERENCES `ingredientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto_ingredientes` ADD CONSTRAINT `producto_ingredientes_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto_ingredientes` ADD CONSTRAINT `producto_ingredientes_ingredienteId_fkey` FOREIGN KEY (`ingredienteId`) REFERENCES `ingredientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `preparaciones` ADD CONSTRAINT `preparaciones_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `preparacion_ingredientes` ADD CONSTRAINT `preparacion_ingredientes_preparacionId_fkey` FOREIGN KEY (`preparacionId`) REFERENCES `preparaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `preparacion_ingredientes` ADD CONSTRAINT `preparacion_ingredientes_ingredienteId_fkey` FOREIGN KEY (`ingredienteId`) REFERENCES `ingredientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lotes_preparacion` ADD CONSTRAINT `lotes_preparacion_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lotes_preparacion` ADD CONSTRAINT `lotes_preparacion_preparacionId_fkey` FOREIGN KEY (`preparacionId`) REFERENCES `preparaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lotes_preparacion` ADD CONSTRAINT `lotes_preparacion_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lote_preparacion_ingredientes` ADD CONSTRAINT `lote_preparacion_ingredientes_loteId_fkey` FOREIGN KEY (`loteId`) REFERENCES `lotes_preparacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lote_preparacion_ingredientes` ADD CONSTRAINT `lote_preparacion_ingredientes_ingredienteId_fkey` FOREIGN KEY (`ingredienteId`) REFERENCES `ingredientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto_preparaciones` ADD CONSTRAINT `producto_preparaciones_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto_preparaciones` ADD CONSTRAINT `producto_preparaciones_preparacionId_fkey` FOREIGN KEY (`preparacionId`) REFERENCES `preparaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adicionales` ADD CONSTRAINT `adicionales_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adicionales` ADD CONSTRAINT `adicionales_ingredienteId_fkey` FOREIGN KEY (`ingredienteId`) REFERENCES `ingredientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto_adicionales` ADD CONSTRAINT `producto_adicionales_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producto_adicionales` ADD CONSTRAINT `producto_adicionales_adicionalId_fkey` FOREIGN KEY (`adicionalId`) REFERENCES `adicionales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_cajaId_fkey` FOREIGN KEY (`cajaId`) REFERENCES `cajas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `proveedores` ADD CONSTRAINT `proveedores_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuentas_administrativas` ADD CONSTRAINT `cuentas_administrativas_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuentas_administrativas` ADD CONSTRAINT `cuentas_administrativas_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuentas_administrativas` ADD CONSTRAINT `cuentas_administrativas_compraGastoId_fkey` FOREIGN KEY (`compraGastoId`) REFERENCES `compras_gastos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuentas_administrativas` ADD CONSTRAINT `cuentas_administrativas_gastoRecurrenteId_fkey` FOREIGN KEY (`gastoRecurrenteId`) REFERENCES `gastos_recurrentes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos_recurrentes` ADD CONSTRAINT `gastos_recurrentes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conteos_inventario` ADD CONSTRAINT `conteos_inventario_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_conteo_inventario` ADD CONSTRAINT `detalles_conteo_inventario_conteoId_fkey` FOREIGN KEY (`conteoId`) REFERENCES `conteos_inventario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_conteo_inventario` ADD CONSTRAINT `detalles_conteo_inventario_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `abonos_administrativos` ADD CONSTRAINT `abonos_administrativos_cuentaId_fkey` FOREIGN KEY (`cuentaId`) REFERENCES `cuentas_administrativas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `abonos_administrativos` ADD CONSTRAINT `abonos_administrativos_movimientoId_fkey` FOREIGN KEY (`movimientoId`) REFERENCES `movimientos_financieros`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conciliaciones_administrativas` ADD CONSTRAINT `conciliaciones_administrativas_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conciliaciones_administrativas` ADD CONSTRAINT `conciliaciones_administrativas_movimientoId_fkey` FOREIGN KEY (`movimientoId`) REFERENCES `movimientos_financieros`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `presupuestos_administrativos` ADD CONSTRAINT `presupuestos_administrativos_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_pedido` ADD CONSTRAINT `pagos_pedido_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedidos` ADD CONSTRAINT `detalle_pedidos_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedidos` ADD CONSTRAINT `detalle_pedidos_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedidos` ADD CONSTRAINT `detalle_pedidos_presentacionId_fkey` FOREIGN KEY (`presentacionId`) REFERENCES `producto_presentaciones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedido_adicionales` ADD CONSTRAINT `detalle_pedido_adicionales_detallePedidoId_fkey` FOREIGN KEY (`detallePedidoId`) REFERENCES `detalle_pedidos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedido_adicionales` ADD CONSTRAINT `detalle_pedido_adicionales_adicionalId_fkey` FOREIGN KEY (`adicionalId`) REFERENCES `adicionales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `distribuidores` ADD CONSTRAINT `distribuidores_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `distribuidores` ADD CONSTRAINT `distribuidores_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_distribuidor` ADD CONSTRAINT `pedidos_distribuidor_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_distribuidor` ADD CONSTRAINT `pedidos_distribuidor_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_distribuidor` ADD CONSTRAINT `pedidos_distribuidor_distribuidorId_fkey` FOREIGN KEY (`distribuidorId`) REFERENCES `distribuidores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_distribuidor` ADD CONSTRAINT `pedidos_distribuidor_liquidacionId_fkey` FOREIGN KEY (`liquidacionId`) REFERENCES `liquidaciones_distribuidor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedidos_distribuidor` ADD CONSTRAINT `detalle_pedidos_distribuidor_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos_distribuidor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedidos_distribuidor` ADD CONSTRAINT `detalle_pedidos_distribuidor_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liquidaciones_distribuidor` ADD CONSTRAINT `liquidaciones_distribuidor_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liquidaciones_distribuidor` ADD CONSTRAINT `liquidaciones_distribuidor_distribuidorId_fkey` FOREIGN KEY (`distribuidorId`) REFERENCES `distribuidores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liquidaciones_distribuidor` ADD CONSTRAINT `liquidaciones_distribuidor_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liquidaciones_distribuidor` ADD CONSTRAINT `liquidaciones_distribuidor_movimientoFinancieroId_fkey` FOREIGN KEY (`movimientoFinancieroId`) REFERENCES `movimientos_financieros`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cajas` ADD CONSTRAINT `cajas_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cajas` ADD CONSTRAINT `cajas_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operaciones_venta_caja` ADD CONSTRAINT `operaciones_venta_caja_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operaciones_venta_caja` ADD CONSTRAINT `operaciones_venta_caja_cajaId_fkey` FOREIGN KEY (`cajaId`) REFERENCES `cajas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retiros_efectivo_caja` ADD CONSTRAINT `retiros_efectivo_caja_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retiros_efectivo_caja` ADD CONSTRAINT `retiros_efectivo_caja_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retiros_efectivo_caja` ADD CONSTRAINT `retiros_efectivo_caja_cajaId_fkey` FOREIGN KEY (`cajaId`) REFERENCES `cajas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retiros_efectivo_caja` ADD CONSTRAINT `retiros_efectivo_caja_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consignaciones_efectivo` ADD CONSTRAINT `consignaciones_efectivo_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consignaciones_efectivo` ADD CONSTRAINT `consignaciones_efectivo_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consignaciones_efectivo` ADD CONSTRAINT `consignaciones_efectivo_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_caja` ADD CONSTRAINT `eventos_caja_cajaId_fkey` FOREIGN KEY (`cajaId`) REFERENCES `cajas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_caja` ADD CONSTRAINT `eventos_caja_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_financieros` ADD CONSTRAINT `movimientos_financieros_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_financieros` ADD CONSTRAINT `movimientos_financieros_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_financieros` ADD CONSTRAINT `movimientos_financieros_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_financieros` ADD CONSTRAINT `movimientos_financieros_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_financieros` ADD CONSTRAINT `movimientos_financieros_compraGastoId_fkey` FOREIGN KEY (`compraGastoId`) REFERENCES `compras_gastos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saldos_iniciales_cuenta` ADD CONSTRAINT `saldos_iniciales_cuenta_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saldos_iniciales_cuenta` ADD CONSTRAINT `saldos_iniciales_cuenta_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras_gastos` ADD CONSTRAINT `compras_gastos_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras_gastos` ADD CONSTRAINT `compras_gastos_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras_gastos` ADD CONSTRAINT `compras_gastos_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras_gastos` ADD CONSTRAINT `compras_gastos_proveedorId_empresaId_fkey` FOREIGN KEY (`proveedorId`, `empresaId`) REFERENCES `proveedores`(`id`, `empresaId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_orden_compra` ADD CONSTRAINT `detalles_orden_compra_ordenId_fkey` FOREIGN KEY (`ordenId`) REFERENCES `ordenes_compra`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recepciones_orden_compra` ADD CONSTRAINT `recepciones_orden_compra_ordenId_fkey` FOREIGN KEY (`ordenId`) REFERENCES `ordenes_compra`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recepciones_orden_compra` ADD CONSTRAINT `recepciones_orden_compra_compraId_fkey` FOREIGN KEY (`compraId`) REFERENCES `compras_gastos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_compra` ADD CONSTRAINT `detalles_compra_compraGastoId_fkey` FOREIGN KEY (`compraGastoId`) REFERENCES `compras_gastos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_compra` ADD CONSTRAINT `detalles_compra_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumos_empleados` ADD CONSTRAINT `consumos_empleados_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumos_empleados` ADD CONSTRAINT `consumos_empleados_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumos_empleados` ADD CONSTRAINT `consumos_empleados_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumo_empleado_items` ADD CONSTRAINT `consumo_empleado_items_consumoEmpleadoId_fkey` FOREIGN KEY (`consumoEmpleadoId`) REFERENCES `consumos_empleados`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumo_empleado_items` ADD CONSTRAINT `consumo_empleado_items_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditorias` ADD CONSTRAINT `auditorias_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditorias` ADD CONSTRAINT `auditorias_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_web` ADD CONSTRAINT `pedidos_web_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_web` ADD CONSTRAINT `pedidos_web_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_web` ADD CONSTRAINT `pedidos_web_sucursalId_fkey` FOREIGN KEY (`sucursalId`) REFERENCES `sucursales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_web` ADD CONSTRAINT `pedidos_web_repartidorId_fkey` FOREIGN KEY (`repartidorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Aplicar una vez en control y en cada sede, antes de EVENTOS_COMPARTIDOS=true.
CREATE TABLE `eventos_sistema` (
  `id` VARCHAR(191) NOT NULL,
  `empresaId` INTEGER NOT NULL,
  `sucursalId` INTEGER NULL,
  `canal` VARCHAR(191) NOT NULL,
  `datos` JSON NOT NULL,
  `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `venceEn` DATETIME(3) NOT NULL,
  `reclamadoEn` DATETIME(3) NULL,
  `confirmacion` JSON NULL,
  PRIMARY KEY (`id`),
  INDEX `eventos_sistema_empresaId_sucursalId_canal_creadoEn_idx` (`empresaId`, `sucursalId`, `canal`, `creadoEn`),
  INDEX `eventos_sistema_venceEn_idx` (`venceEn`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
