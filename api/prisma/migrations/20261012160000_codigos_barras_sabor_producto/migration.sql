-- CreateTable
CREATE TABLE "producto_codigos_barras" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "codigoBarras" TEXT NOT NULL,
    "sabor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_codigos_barras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producto_codigos_barras_empresaId_codigoBarras_key" ON "producto_codigos_barras"("empresaId", "codigoBarras");
CREATE INDEX "producto_codigos_barras_productoId_idx" ON "producto_codigos_barras"("productoId");

-- AddForeignKey
ALTER TABLE "producto_codigos_barras" ADD CONSTRAINT "producto_codigos_barras_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "detalle_pedidos" ADD COLUMN "varianteSabor" TEXT;
