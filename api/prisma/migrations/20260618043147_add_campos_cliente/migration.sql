/*
  Warnings:

  - A unique constraint covering the columns `[empresaId,documento]` on the table `clientes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "documento" TEXT,
ADD COLUMN     "fechaNacimiento" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_empresaId_documento_key" ON "clientes"("empresaId", "documento");
