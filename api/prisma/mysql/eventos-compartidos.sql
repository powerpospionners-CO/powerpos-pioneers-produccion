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
