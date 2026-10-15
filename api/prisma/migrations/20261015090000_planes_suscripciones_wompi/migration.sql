CREATE TYPE "PeriodicidadPlan" AS ENUM ('MENSUAL', 'ANUAL');
CREATE TYPE "EstadoPagoPlan" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

ALTER TABLE "empresas"
ADD COLUMN "suscripcionVenceEn" TIMESTAMP(3),
ADD COLUMN "pagoExonerado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "motivoExoneracion" TEXT,
ADD COLUMN "soporteIncluidoHasta" TIMESTAMP(3),
ADD COLUMN "soportePagadoHasta" TIMESTAMP(3),
ADD COLUMN "distribuidoresHabilitado" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "empresas"
ALTER COLUMN "distribuidoresHabilitado" SET DEFAULT false;

UPDATE "empresas"
SET "soporteIncluidoHasta" = CURRENT_TIMESTAMP + INTERVAL '3 months';

CREATE TABLE "configuracion_planes" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "inicialMensual" INTEGER NOT NULL DEFAULT 29900,
    "mediumMensual" INTEGER NOT NULL DEFAULT 49900,
    "premiumMensual" INTEGER NOT NULL DEFAULT 89900,
    "soporteMensual" INTEGER NOT NULL DEFAULT 19900,
    "descuentoAnualMeses" INTEGER NOT NULL DEFAULT 1,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configuracion_planes_pkey" PRIMARY KEY ("id")
);

INSERT INTO "configuracion_planes" (
    "id",
    "inicialMensual",
    "mediumMensual",
    "premiumMensual",
    "soporteMensual",
    "descuentoAnualMeses",
    "actualizadoEn"
) VALUES (1, 29900, 49900, 89900, 19900, 1, CURRENT_TIMESTAMP);

CREATE TABLE "pagos_plan" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "plan" "PlanEmpresa" NOT NULL,
    "periodicidad" "PeriodicidadPlan" NOT NULL,
    "monto" INTEGER NOT NULL,
    "estado" "EstadoPagoPlan" NOT NULL DEFAULT 'PENDIENTE',
    "referencia" TEXT NOT NULL,
    "transaccionId" TEXT,
    "incluyePlan" BOOLEAN NOT NULL DEFAULT true,
    "incluyeSoporte" BOOLEAN NOT NULL DEFAULT false,
    "periodoDesde" TIMESTAMP(3) NOT NULL,
    "periodoHasta" TIMESTAMP(3) NOT NULL,
    "soporteDesde" TIMESTAMP(3),
    "soporteHasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagadoEn" TIMESTAMP(3),
    CONSTRAINT "pagos_plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pagos_plan_referencia_key" ON "pagos_plan"("referencia");
CREATE UNIQUE INDEX "pagos_plan_transaccionId_key" ON "pagos_plan"("transaccionId");
CREATE INDEX "pagos_plan_empresaId_creadoEn_idx" ON "pagos_plan"("empresaId", "creadoEn");

ALTER TABLE "pagos_plan"
ADD CONSTRAINT "pagos_plan_empresaId_fkey"
FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
