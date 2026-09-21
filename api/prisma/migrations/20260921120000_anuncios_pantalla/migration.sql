-- AlterTable
ALTER TABLE "empresas" ADD COLUMN "anunciosPantalla" JSONB NOT NULL DEFAULT '[]'::jsonb;
