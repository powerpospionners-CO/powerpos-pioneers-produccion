ALTER TYPE "CategoriaMovimiento" ADD VALUE 'COMPRA_MERCANCIA';

CREATE TABLE "saldos_iniciales_cuenta" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saldos_iniciales_cuenta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "compras_gastos" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "categoria" "CategoriaMovimiento" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "compras_gastos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "detalles_compra" (
    "id" SERIAL NOT NULL,
    "compraGastoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "productoNombre" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "unidadCompra" TEXT NOT NULL,
    "factorAplicado" INTEGER NOT NULL,
    "cantidadInventario" INTEGER NOT NULL,
    "costoUnitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "detalles_compra_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "movimientos_financieros"
ADD COLUMN "compraGastoId" INTEGER;

CREATE UNIQUE INDEX "saldos_iniciales_cuenta_empresaId_key" ON "saldos_iniciales_cuenta"("empresaId");
CREATE INDEX "compras_gastos_empresaId_fecha_idx" ON "compras_gastos"("empresaId", "fecha");
CREATE INDEX "detalles_compra_productoId_idx" ON "detalles_compra"("productoId");
CREATE UNIQUE INDEX "movimientos_financieros_compraGastoId_key" ON "movimientos_financieros"("compraGastoId");

ALTER TABLE "saldos_iniciales_cuenta"
ADD CONSTRAINT "saldos_iniciales_cuenta_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "saldos_iniciales_cuenta_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "compras_gastos"
ADD CONSTRAINT "compras_gastos_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "compras_gastos_sucursalId_fkey"
FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "compras_gastos_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "detalles_compra"
ADD CONSTRAINT "detalles_compra_compraGastoId_fkey"
FOREIGN KEY ("compraGastoId") REFERENCES "compras_gastos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "detalles_compra_productoId_fkey"
FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "movimientos_financieros"
ADD CONSTRAINT "movimientos_financieros_compraGastoId_fkey"
FOREIGN KEY ("compraGastoId") REFERENCES "compras_gastos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
