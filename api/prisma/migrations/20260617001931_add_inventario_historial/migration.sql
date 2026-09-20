-- AlterTable
ALTER TABLE "ingredientes" ADD COLUMN     "factorConversion" DECIMAL(10,3),
ADD COLUMN     "unidadCompra" TEXT;

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" SERIAL NOT NULL,
    "ingredienteId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidadMovida" DECIMAL(10,3) NOT NULL,
    "unidadCompra" TEXT,
    "factorAplicado" DECIMAL(10,3),
    "stockAnterior" DECIMAL(10,3) NOT NULL,
    "stockNuevo" DECIMAL(10,3) NOT NULL,
    "descripcion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_ingredienteId_fkey" FOREIGN KEY ("ingredienteId") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
