CREATE TABLE IF NOT EXISTS cuentas_puc (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  empresaId INT NOT NULL,
  codigo VARCHAR(16) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  creadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY cuentas_puc_empresa_codigo_key (empresaId, codigo),
  CONSTRAINT cuentas_puc_empresa_fkey FOREIGN KEY (empresaId) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS asignaciones_puc (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  empresaId INT NOT NULL,
  origen VARCHAR(16) NOT NULL,
  registroId INT NOT NULL,
  codigo VARCHAR(16) NOT NULL,
  usuarioId INT NOT NULL,
  actualizadoEn DATETIME(3) NOT NULL,
  UNIQUE KEY asignaciones_puc_empresa_origen_registro_key (empresaId, origen, registroId),
  CONSTRAINT asignaciones_puc_empresa_fkey FOREIGN KEY (empresaId) REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT asignaciones_puc_cuenta_fkey FOREIGN KEY (empresaId, codigo) REFERENCES cuentas_puc(empresaId, codigo) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
