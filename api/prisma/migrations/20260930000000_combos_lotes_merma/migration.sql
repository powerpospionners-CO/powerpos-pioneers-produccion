-- AlterTable
ALTER TABLE "productos" ADD COLUMN "esCombo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "movimientos_inventario" ADD COLUMN "motivoMerma" TEXT;

-- CreateTable
CREATE TABLE "combo_componentes" (
    "id" SERIAL NOT NULL,
    "comboId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "combo_componentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_producto" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "cantidadRestante" INTEGER NOT NULL,
    "fechaVencimiento" TIMESTAMP(3),
    "costo" DECIMAL(10,2),
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lotes_producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "combo_componentes_comboId_productoId_key" ON "combo_componentes"("comboId", "productoId");

-- CreateIndex
CREATE INDEX "lotes_producto_productoId_fechaVencimiento_idx" ON "lotes_producto"("productoId", "fechaVencimiento");

-- AddForeignKey
ALTER TABLE "combo_componentes" ADD CONSTRAINT "combo_componentes_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_componentes" ADD CONSTRAINT "combo_componentes_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_producto" ADD CONSTRAINT "lotes_producto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
