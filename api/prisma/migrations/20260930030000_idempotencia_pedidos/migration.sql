-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "claveIdempotencia" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_claveIdempotencia_key" ON "pedidos"("claveIdempotencia");
