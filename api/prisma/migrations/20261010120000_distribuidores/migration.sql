-- AlterEnum
ALTER TYPE "RolUsuario" ADD VALUE 'DISTRIBUIDOR';

-- AlterEnum
ALTER TYPE "CategoriaMovimiento" ADD VALUE 'COMISION_DISTRIBUIDOR';

-- CreateEnum
CREATE TYPE "EstadoPedidoDistribuidor" AS ENUM ('ENTREGADO', 'ANULADO');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "distribuidorId" INTEGER;

-- CreateTable
CREATE TABLE "distribuidores" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "zona" TEXT,
    "porcentajeComision" DECIMAL(5,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribuidores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_distribuidor" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "distribuidorId" INTEGER NOT NULL,
    "clienteReferencia" TEXT,
    "estado" "EstadoPedidoDistribuidor" NOT NULL DEFAULT 'ENTREGADO',
    "total" DECIMAL(10,2) NOT NULL,
    "comisionPorcentaje" DECIMAL(5,2) NOT NULL,
    "comisionMonto" DECIMAL(10,2) NOT NULL,
    "liquidacionId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_distribuidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_pedidos_distribuidor" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "presentacionId" INTEGER,
    "presentacionNombre" TEXT,
    "factorUnidades" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "detalle_pedidos_distribuidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones_distribuidor" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "distribuidorId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "periodoDesde" TIMESTAMP(3) NOT NULL,
    "periodoHasta" TIMESTAMP(3) NOT NULL,
    "cantidadPedidos" INTEGER NOT NULL,
    "totalVentas" DECIMAL(10,2) NOT NULL,
    "totalComision" DECIMAL(10,2) NOT NULL,
    "movimientoFinancieroId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidaciones_distribuidor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_distribuidorId_key" ON "usuarios"("distribuidorId");

-- CreateIndex
CREATE UNIQUE INDEX "distribuidores_empresaId_codigo_key" ON "distribuidores"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_distribuidor_numero_key" ON "pedidos_distribuidor"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_distribuidor_movimientoFinancieroId_key" ON "liquidaciones_distribuidor"("movimientoFinancieroId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "distribuidores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribuidores" ADD CONSTRAINT "distribuidores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribuidores" ADD CONSTRAINT "distribuidores_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_distribuidor" ADD CONSTRAINT "pedidos_distribuidor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_distribuidor" ADD CONSTRAINT "pedidos_distribuidor_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_distribuidor" ADD CONSTRAINT "pedidos_distribuidor_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "distribuidores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_distribuidor" ADD CONSTRAINT "pedidos_distribuidor_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "liquidaciones_distribuidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedidos_distribuidor" ADD CONSTRAINT "detalle_pedidos_distribuidor_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos_distribuidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedidos_distribuidor" ADD CONSTRAINT "detalle_pedidos_distribuidor_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_distribuidor" ADD CONSTRAINT "liquidaciones_distribuidor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_distribuidor" ADD CONSTRAINT "liquidaciones_distribuidor_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "distribuidores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_distribuidor" ADD CONSTRAINT "liquidaciones_distribuidor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_distribuidor" ADD CONSTRAINT "liquidaciones_distribuidor_movimientoFinancieroId_fkey" FOREIGN KEY ("movimientoFinancieroId") REFERENCES "movimientos_financieros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
