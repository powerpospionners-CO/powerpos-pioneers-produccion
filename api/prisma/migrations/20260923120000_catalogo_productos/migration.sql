-- CreateTable
CREATE TABLE "catalogo_productos" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(10,2),
    "categoria" TEXT,
    "imagen" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogo_productos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "catalogo_productos" ADD CONSTRAINT "catalogo_productos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "catalogo_productos_empresaId_idx" ON "catalogo_productos"("empresaId");
