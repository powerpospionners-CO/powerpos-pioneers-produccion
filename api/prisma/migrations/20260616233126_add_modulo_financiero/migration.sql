-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "CategoriaMovimiento" AS ENUM ('VENTA', 'COMPRA_INSUMOS', 'NOMINA', 'SERVICIOS', 'ARRIENDO', 'MANTENIMIENTO', 'IMPUESTOS', 'OTROS');

-- CreateTable
CREATE TABLE "movimientos_financieros" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "categoria" "CategoriaMovimiento" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pedidoId" INTEGER,
    "comprobante" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_financieros_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
