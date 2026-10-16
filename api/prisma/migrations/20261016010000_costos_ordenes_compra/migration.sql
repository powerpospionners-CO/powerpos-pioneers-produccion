-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "costoVentaHistorico" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "detalle_pedidos" ADD COLUMN     "costoVentaHistorico" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "referencia" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobadoPor" INTEGER,
    "motivoCierre" TEXT,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_orden_compra" (
    "id" SERIAL NOT NULL,
    "ordenId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "recibida" INTEGER NOT NULL DEFAULT 0,
    "costoUnitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalles_orden_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepciones_orden_compra" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "ordenId" INTEGER NOT NULL,
    "compraId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "solicitud" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recepciones_orden_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ordenes_compra_empresaId_estado_idx" ON "ordenes_compra"("empresaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_empresaId_referencia_key" ON "ordenes_compra"("empresaId", "referencia");

-- CreateIndex
CREATE UNIQUE INDEX "detalles_orden_compra_ordenId_productoId_key" ON "detalles_orden_compra"("ordenId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_orden_compra_compraId_key" ON "recepciones_orden_compra"("compraId");

-- CreateIndex
CREATE UNIQUE INDEX "recepciones_orden_compra_empresaId_clave_key" ON "recepciones_orden_compra"("empresaId", "clave");

-- AddForeignKey
ALTER TABLE "detalles_orden_compra" ADD CONSTRAINT "detalles_orden_compra_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_orden_compra" ADD CONSTRAINT "recepciones_orden_compra_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_orden_compra" ADD CONSTRAINT "recepciones_orden_compra_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "compras_gastos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
