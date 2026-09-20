-- AlterTable
ALTER TABLE "empresas"
ADD COLUMN "facturacionElectronicaHabilitada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "auditorias" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER,
    "usuarioId" INTEGER,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" INTEGER,
    "detalle" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auditorias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auditorias_empresaId_creadoEn_idx" ON "auditorias"("empresaId", "creadoEn");
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;