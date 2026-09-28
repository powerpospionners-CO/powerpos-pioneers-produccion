-- CreateTable
CREATE TABLE "producto_presentaciones" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "factorUnidades" INTEGER NOT NULL DEFAULT 1,
    "precio" DECIMAL(10,2) NOT NULL,
    "codigoBarras" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_presentaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producto_presentaciones_productoId_nombre_key" ON "producto_presentaciones"("productoId", "nombre");

-- AddForeignKey
ALTER TABLE "producto_presentaciones" ADD CONSTRAINT "producto_presentaciones_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "detalle_pedidos" ADD COLUMN "presentacionId" INTEGER;
ALTER TABLE "detalle_pedidos" ADD COLUMN "presentacionNombre" TEXT;
ALTER TABLE "detalle_pedidos" ADD COLUMN "factorUnidades" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "detalle_pedidos_presentacionId_fkey" FOREIGN KEY ("presentacionId") REFERENCES "producto_presentaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
