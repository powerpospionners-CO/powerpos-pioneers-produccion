-- AlterTable
-- Solo cambios aditivos. Ejecutar primero en una copia de producción.
ALTER TABLE "pedidos" ADD COLUMN     "consumoInventario" JSONB;

-- AlterTable
ALTER TABLE "compras_gastos" ADD COLUMN     "condicionPago" TEXT NOT NULL DEFAULT 'CONTADO',
ADD COLUMN     "proveedorId" INTEGER;

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "plazoDias" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_administrativas" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" "CategoriaMovimiento" NOT NULL DEFAULT 'OTROS',
    "compraGastoId" INTEGER,
    "tercero" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL,
    "vencimiento" TIMESTAMP(3) NOT NULL,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_administrativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonos_administrativos" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "movimientoId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonos_administrativos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conciliaciones_administrativas" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "movimientoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "referencia" TEXT NOT NULL,
    "fechaBanco" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conciliaciones_administrativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuestos_administrativos" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "categoria" "CategoriaMovimiento" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "presupuestos_administrativos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_id_empresaId_key" ON "proveedores"("id", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_empresaId_documento_key" ON "proveedores"("empresaId", "documento");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_administrativas_compraGastoId_key" ON "cuentas_administrativas"("compraGastoId");

-- CreateIndex
CREATE INDEX "cuentas_administrativas_empresaId_tipo_vencimiento_idx" ON "cuentas_administrativas"("empresaId", "tipo", "vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_administrativas_empresaId_tipo_documento_key" ON "cuentas_administrativas"("empresaId", "tipo", "documento");

-- CreateIndex
CREATE UNIQUE INDEX "abonos_administrativos_clave_key" ON "abonos_administrativos"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "abonos_administrativos_movimientoId_key" ON "abonos_administrativos"("movimientoId");

-- CreateIndex
CREATE INDEX "abonos_administrativos_cuentaId_idx" ON "abonos_administrativos"("cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "conciliaciones_administrativas_movimientoId_key" ON "conciliaciones_administrativas"("movimientoId");

-- CreateIndex
CREATE INDEX "conciliaciones_administrativas_empresaId_fechaBanco_idx" ON "conciliaciones_administrativas"("empresaId", "fechaBanco");

-- CreateIndex
CREATE UNIQUE INDEX "presupuestos_administrativos_empresaId_periodo_categoria_key" ON "presupuestos_administrativos"("empresaId", "periodo", "categoria");

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_administrativas" ADD CONSTRAINT "cuentas_administrativas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_administrativas" ADD CONSTRAINT "cuentas_administrativas_compraGastoId_fkey" FOREIGN KEY ("compraGastoId") REFERENCES "compras_gastos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_administrativos" ADD CONSTRAINT "abonos_administrativos_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas_administrativas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_administrativos" ADD CONSTRAINT "abonos_administrativos_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "movimientos_financieros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conciliaciones_administrativas" ADD CONSTRAINT "conciliaciones_administrativas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conciliaciones_administrativas" ADD CONSTRAINT "conciliaciones_administrativas_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "movimientos_financieros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos_administrativos" ADD CONSTRAINT "presupuestos_administrativos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_gastos" ADD CONSTRAINT "compras_gastos_proveedorId_empresaId_fkey" FOREIGN KEY ("proveedorId", "empresaId") REFERENCES "proveedores"("id", "empresaId") ON DELETE RESTRICT ON UPDATE CASCADE;

