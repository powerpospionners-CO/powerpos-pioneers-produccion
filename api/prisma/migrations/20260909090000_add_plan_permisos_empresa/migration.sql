-- CreateEnum
CREATE TYPE "PlanEmpresa" AS ENUM ('BASICO', 'MEDIUM', 'PREMIUM');

-- AlterTable
ALTER TABLE "empresas"
ADD COLUMN "plan" "PlanEmpresa" NOT NULL DEFAULT 'BASICO',
ADD COLUMN "permisos" JSONB NOT NULL DEFAULT '{}'::jsonb;