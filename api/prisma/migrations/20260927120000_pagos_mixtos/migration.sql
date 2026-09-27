-- AlterEnum
ALTER TYPE "MetodoPago" ADD VALUE 'MIXTO';

-- AlterEnum
ALTER TYPE "TipoEventoCaja" ADD VALUE 'EDICION_PAGO';
ALTER TYPE "TipoEventoCaja" ADD VALUE 'ANULACION';

-- CreateTable
CREATE TABLE "pagos_pedido" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "metodoPago" "MetodoPago" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagos_pedido_pedidoId_idx" ON "pagos_pedido"("pedidoId");

-- AddForeignKey
ALTER TABLE "pagos_pedido" ADD CONSTRAINT "pagos_pedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
