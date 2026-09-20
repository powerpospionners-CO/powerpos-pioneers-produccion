CREATE TYPE "TipoNegocio" AS ENUM ('RESTAURANTE', 'SUPERMERCADO', 'TIENDA', 'COMERCIO');

ALTER TABLE "empresas" ADD COLUMN "tipoNegocio" "TipoNegocio" NOT NULL DEFAULT 'RESTAURANTE';

ALTER TABLE "productos" ADD COLUMN "codigoBarras" TEXT;
ALTER TABLE "productos" ADD COLUMN "controlaStock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "productos" ADD COLUMN "stockActual" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "productos" ADD COLUMN "stockMinimo" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "productos_empresaId_codigoBarras_key" ON "productos"("empresaId", "codigoBarras");
