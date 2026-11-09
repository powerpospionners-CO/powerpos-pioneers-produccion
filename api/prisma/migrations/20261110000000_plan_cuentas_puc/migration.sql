CREATE TABLE "cuentas_puc" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "empresaId" INTEGER NOT NULL,
  "codigo" VARCHAR(16) NOT NULL,
  "nombre" VARCHAR(150) NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cuentas_puc_empresa_codigo_key" UNIQUE ("empresaId", "codigo"),
  CONSTRAINT "cuentas_puc_empresa_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "asignaciones_puc" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "empresaId" INTEGER NOT NULL,
  "origen" VARCHAR(16) NOT NULL,
  "registroId" INTEGER NOT NULL,
  "codigo" VARCHAR(16) NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asignaciones_puc_empresa_origen_registro_key" UNIQUE ("empresaId", "origen", "registroId"),
  CONSTRAINT "asignaciones_puc_empresa_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "asignaciones_puc_cuenta_fkey" FOREIGN KEY ("empresaId", "codigo") REFERENCES "cuentas_puc"("empresaId", "codigo") ON DELETE RESTRICT ON UPDATE CASCADE
);
