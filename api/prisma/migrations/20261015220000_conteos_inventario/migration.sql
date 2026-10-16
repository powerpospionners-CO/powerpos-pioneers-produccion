-- CreateTable
CREATE TABLE "conteos_inventario" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "aprobadorId" INTEGER,
    "descripcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "motivoResolucion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoEn" TIMESTAMP(3),

    CONSTRAINT "conteos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_conteo_inventario" (
    "id" SERIAL NOT NULL,
    "conteoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "productoNombre" TEXT NOT NULL,
    "stockEsperado" INTEGER NOT NULL,
    "stockContado" INTEGER NOT NULL,

    CONSTRAINT "detalles_conteo_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conteos_inventario_empresaId_estado_creadoEn_idx" ON "conteos_inventario"("empresaId", "estado", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "detalles_conteo_inventario_conteoId_productoId_key" ON "detalles_conteo_inventario"("conteoId", "productoId");

-- AddForeignKey
ALTER TABLE "conteos_inventario" ADD CONSTRAINT "conteos_inventario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_conteo_inventario" ADD CONSTRAINT "detalles_conteo_inventario_conteoId_fkey" FOREIGN KEY ("conteoId") REFERENCES "conteos_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_conteo_inventario" ADD CONSTRAINT "detalles_conteo_inventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

