-- AlterTable
ALTER TABLE "empresas" ADD COLUMN "impresionAgenteToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "empresas_impresionAgenteToken_key" ON "empresas"("impresionAgenteToken");
