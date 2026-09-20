-- CreateTable
CREATE TABLE "preparaciones" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "unidad" TEXT NOT NULL DEFAULT 'porciones',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preparaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preparacion_ingredientes" (
    "id" SERIAL NOT NULL,
    "preparacionId" INTEGER NOT NULL,
    "ingredienteId" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "unidad" TEXT,
    "observacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preparacion_ingredientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_preparacion" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "preparacionId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loteNumero" TEXT,
    "cantidadProducida" DECIMAL(10,3) NOT NULL,
    "pesoTotal" DECIMAL(10,3),
    "pesoPorBolsa" DECIMAL(10,3),
    "porcionesPorBolsa" DECIMAL(10,3),
    "porcionesTotales" DECIMAL(10,3),
    "observacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_preparacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_preparacion_ingredientes" (
    "id" SERIAL NOT NULL,
    "loteId" INTEGER NOT NULL,
    "ingredienteId" INTEGER NOT NULL,
    "cantidadUsada" DECIMAL(10,3) NOT NULL,
    "unidad" TEXT,
    "observacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lote_preparacion_ingredientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_preparaciones" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "preparacionId" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unidad" TEXT NOT NULL DEFAULT 'porciones',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_preparaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producto_preparaciones_productoId_preparacionId_key"
ON "producto_preparaciones" ("productoId", "preparacionId");

-- AddForeignKey
ALTER TABLE "preparaciones"
ADD CONSTRAINT "preparaciones_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparacion_ingredientes"
ADD CONSTRAINT "preparacion_ingredientes_preparacionId_fkey"
FOREIGN KEY ("preparacionId") REFERENCES "preparaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparacion_ingredientes"
ADD CONSTRAINT "preparacion_ingredientes_ingredienteId_fkey"
FOREIGN KEY ("ingredienteId") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_preparacion"
ADD CONSTRAINT "lotes_preparacion_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_preparacion"
ADD CONSTRAINT "lotes_preparacion_preparacionId_fkey"
FOREIGN KEY ("preparacionId") REFERENCES "preparaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_preparacion"
ADD CONSTRAINT "lotes_preparacion_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_preparacion_ingredientes"
ADD CONSTRAINT "lote_preparacion_ingredientes_loteId_fkey"
FOREIGN KEY ("loteId") REFERENCES "lotes_preparacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_preparacion_ingredientes"
ADD CONSTRAINT "lote_preparacion_ingredientes_ingredienteId_fkey"
FOREIGN KEY ("ingredienteId") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_preparaciones"
ADD CONSTRAINT "producto_preparaciones_productoId_fkey"
FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_preparaciones"
ADD CONSTRAINT "producto_preparaciones_preparacionId_fkey"
FOREIGN KEY ("preparacionId") REFERENCES "preparaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
