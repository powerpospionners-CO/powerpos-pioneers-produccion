CREATE TABLE "eventos_sistema" (
  "id" TEXT NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "sucursalId" INTEGER,
  "canal" TEXT NOT NULL,
  "datos" JSONB NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "venceEn" TIMESTAMP(3) NOT NULL,
  "reclamadoEn" TIMESTAMP(3),
  "confirmacion" JSONB,
  CONSTRAINT "eventos_sistema_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "eventos_sistema_empresaId_sucursalId_canal_creadoEn_idx" ON "eventos_sistema"("empresaId", "sucursalId", "canal", "creadoEn");
CREATE INDEX "eventos_sistema_venceEn_idx" ON "eventos_sistema"("venceEn");
