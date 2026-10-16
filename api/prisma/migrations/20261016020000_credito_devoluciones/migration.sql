-- AlterEnum
ALTER TYPE "MetodoPago" ADD VALUE 'CREDITO';

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "devueltoTotal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puntosCreditoPendientes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "cuentas_administrativas" ADD COLUMN     "pedidoId" INTEGER;

-- AlterTable
ALTER TABLE "detalle_pedidos" ADD COLUMN     "consumoInventario" JSONB;

-- CreateTable
CREATE TABLE "operaciones_venta_caja" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "cajaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "metodoPago" "MetodoPago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalle" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operaciones_venta_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_venta_caja_clave_key" ON "operaciones_venta_caja"("clave");

-- CreateIndex
CREATE INDEX "operaciones_venta_caja_empresaId_pedidoId_idx" ON "operaciones_venta_caja"("empresaId", "pedidoId");

-- CreateIndex
CREATE INDEX "operaciones_venta_caja_cajaId_idx" ON "operaciones_venta_caja"("cajaId");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_administrativas_pedidoId_key" ON "cuentas_administrativas"("pedidoId");

-- AddForeignKey
ALTER TABLE "cuentas_administrativas" ADD CONSTRAINT "cuentas_administrativas_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_venta_caja" ADD CONSTRAINT "operaciones_venta_caja_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operaciones_venta_caja" ADD CONSTRAINT "operaciones_venta_caja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
