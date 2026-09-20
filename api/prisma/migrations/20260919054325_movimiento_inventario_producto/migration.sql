-- DropForeignKey
ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "movimientos_inventario_ingredienteId_fkey";

-- AlterTable
ALTER TABLE "movimientos_inventario" ADD COLUMN     "productoId" INTEGER,
ALTER COLUMN "ingredienteId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "movimientos_inventario_productoId_creadoEn_idx" ON "movimientos_inventario"("productoId", "creadoEn");

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_ingredienteId_fkey" FOREIGN KEY ("ingredienteId") REFERENCES "ingredientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
