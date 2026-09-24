-- AlterTable
ALTER TABLE "empresas" ADD COLUMN "catalogoHabilitado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "catalogo_productos" ADD COLUMN "presentacion" TEXT;
