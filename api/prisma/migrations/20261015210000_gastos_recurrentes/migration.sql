-- AlterTable
ALTER TABLE "cuentas_administrativas" ADD COLUMN     "gastoRecurrenteId" INTEGER,
ADD COLUMN     "periodoRecurrente" TEXT;

-- CreateTable
CREATE TABLE "gastos_recurrentes" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tercero" TEXT NOT NULL,
    "categoria" "CategoriaMovimiento" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "diaVencimiento" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_recurrentes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gastos_recurrentes_empresaId_activo_idx" ON "gastos_recurrentes"("empresaId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_recurrentes_empresaId_nombre_key" ON "gastos_recurrentes"("empresaId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_administrativas_gastoRecurrenteId_periodoRecurrente_key" ON "cuentas_administrativas"("gastoRecurrenteId", "periodoRecurrente");

-- AddForeignKey
ALTER TABLE "cuentas_administrativas" ADD CONSTRAINT "cuentas_administrativas_gastoRecurrenteId_fkey" FOREIGN KEY ("gastoRecurrenteId") REFERENCES "gastos_recurrentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

