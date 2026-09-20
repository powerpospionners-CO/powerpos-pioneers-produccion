ALTER TABLE "empresas" ADD COLUMN "tiendaSlug" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN "tiendaConfig" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "fidelizacionConfig" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "empresas" ALTER COLUMN "tiendaSlug" DROP DEFAULT;
CREATE UNIQUE INDEX "empresas_tiendaSlug_key" ON "empresas"("tiendaSlug");
ALTER TABLE "pedidos" ADD COLUMN "puntosGanados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "puntosCanjeados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "valorPuntoAplicado" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "costoDomicilio" DECIMAL(10,2) NOT NULL DEFAULT 0;
CREATE TABLE "pedidos_web" (
 "id" TEXT NOT NULL, "empresaId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL,
 "clave" TEXT NOT NULL, "estado" TEXT NOT NULL DEFAULT 'RECIBIDO',
 "nombre" TEXT NOT NULL, "telefono" TEXT NOT NULL, "direccion" TEXT NOT NULL,
 "zona" TEXT NOT NULL, "observacion" TEXT, "items" JSONB NOT NULL,
 "subtotal" DECIMAL(10,2) NOT NULL, "costoDomicilio" DECIMAL(10,2) NOT NULL,
 "total" DECIMAL(10,2) NOT NULL, "metodoPago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
 "pedidoId" INTEGER, "repartidorId" INTEGER, "motivo" TEXT,
 "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "actualizadoEn" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "pedidos_web_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "pedidos_web_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "pedidos_web_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "pedidos_web_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "pedidos_web_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "pedidos_web_estado_check" CHECK ("estado" IN ('RECIBIDO','ACEPTADO','RECHAZADO','EN_CAMINO','ENTREGADO'))
);
CREATE UNIQUE INDEX "pedidos_web_empresaId_clave_key" ON "pedidos_web"("empresaId", "clave");
CREATE UNIQUE INDEX "pedidos_web_pedidoId_key" ON "pedidos_web"("pedidoId");
CREATE INDEX "pedidos_web_empresaId_estado_creadoEn_idx" ON "pedidos_web"("empresaId", "estado", "creadoEn");
