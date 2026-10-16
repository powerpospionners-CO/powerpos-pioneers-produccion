-- CreateTable
CREATE TABLE "bases_sede" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PREPARANDO',
    "conexionCifrada" TEXT NOT NULL,
    "identidadBase" TEXT NOT NULL,
    "slug" TEXT,
    "agenteHash" TEXT,
    "verificacion" JSONB,
    "verificadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bases_sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_aislamiento" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "escriturasSuspendidas" BOOLEAN NOT NULL DEFAULT false,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_aislamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrituras_en_curso" (
    "id" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrituras_en_curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sello_base_sede" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "verificadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sello_base_sede_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bases_sede_sucursalId_key" ON "bases_sede"("sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "bases_sede_identidadBase_key" ON "bases_sede"("identidadBase");

-- CreateIndex
CREATE UNIQUE INDEX "bases_sede_slug_key" ON "bases_sede"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "bases_sede_agenteHash_key" ON "bases_sede"("agenteHash");

-- CreateIndex
CREATE UNIQUE INDEX "bases_sede_empresaId_sucursalId_key" ON "bases_sede"("empresaId", "sucursalId");
