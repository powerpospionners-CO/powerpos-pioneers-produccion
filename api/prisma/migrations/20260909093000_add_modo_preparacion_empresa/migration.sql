-- CreateEnum
CREATE TYPE "ModoPreparacion" AS ENUM ('KDS', 'COMANDAS');

-- AlterTable
ALTER TABLE "empresas"
ADD COLUMN "modoPreparacion" "ModoPreparacion" NOT NULL DEFAULT 'KDS';

-- Tráiler Don Juancho trabaja con comandas impresas, no con KDS.
UPDATE "empresas"
SET "modoPreparacion" = 'COMANDAS'
WHERE "nombre" = 'Tráiler Don Juancho';