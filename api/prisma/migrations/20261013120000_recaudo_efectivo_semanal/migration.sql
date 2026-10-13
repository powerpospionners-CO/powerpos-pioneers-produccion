ALTER TABLE "empresas"
ADD COLUMN "recaudoEfectivoHabilitado" BOOLEAN NOT NULL DEFAULT false;

UPDATE "empresas"
SET "recaudoEfectivoHabilitado" = true
WHERE UPPER(TRIM("nombre")) = 'ENCHILA MARKET PEREIRA';

ALTER TABLE "sucursales"
ADD COLUMN "baseEfectivoCaja" DECIMAL(10,2);

UPDATE "sucursales"
SET "baseEfectivoCaja" = 150000
WHERE "empresaId" IN (
    SELECT "id"
    FROM "empresas"
    WHERE UPPER(TRIM("nombre")) = 'ENCHILA MARKET PEREIRA'
);

CREATE TABLE "retiros_efectivo_caja" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "cajaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "montoEsperado" DECIMAL(10,2) NOT NULL,
    "montoRetirado" DECIMAL(10,2) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retiros_efectivo_caja_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consignaciones_efectivo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "periodoInicio" DATE NOT NULL,
    "periodoFin" DATE NOT NULL,
    "ventasEfectivo" DECIMAL(10,2) NOT NULL,
    "efectivoRecaudado" DECIMAL(10,2) NOT NULL,
    "montoConsignado" DECIMAL(10,2) NOT NULL,
    "fechaConsignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referencia" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consignaciones_efectivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "retiros_efectivo_caja_cajaId_key"
ON "retiros_efectivo_caja"("cajaId");
CREATE INDEX "retiros_efectivo_caja_sucursalId_creadoEn_idx"
ON "retiros_efectivo_caja"("sucursalId", "creadoEn");
CREATE UNIQUE INDEX "consignaciones_efectivo_sucursalId_periodoInicio_key"
ON "consignaciones_efectivo"("sucursalId", "periodoInicio");
CREATE INDEX "consignaciones_efectivo_empresaId_periodoInicio_idx"
ON "consignaciones_efectivo"("empresaId", "periodoInicio");

ALTER TABLE "retiros_efectivo_caja"
ADD CONSTRAINT "retiros_efectivo_caja_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retiros_efectivo_caja"
ADD CONSTRAINT "retiros_efectivo_caja_sucursalId_fkey"
FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retiros_efectivo_caja"
ADD CONSTRAINT "retiros_efectivo_caja_cajaId_fkey"
FOREIGN KEY ("cajaId") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retiros_efectivo_caja"
ADD CONSTRAINT "retiros_efectivo_caja_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consignaciones_efectivo"
ADD CONSTRAINT "consignaciones_efectivo_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consignaciones_efectivo"
ADD CONSTRAINT "consignaciones_efectivo_sucursalId_fkey"
FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consignaciones_efectivo"
ADD CONSTRAINT "consignaciones_efectivo_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
