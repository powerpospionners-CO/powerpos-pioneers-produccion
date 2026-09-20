-- CreateEnum
CREATE TYPE "TipoEventoCaja" AS ENUM ('APERTURA', 'CIERRE', 'APERTURA_IRREGULAR', 'DIFERENCIA', 'MOVIMIENTO');

-- CreateTable
CREATE TABLE "eventos_caja" (
    "id" SERIAL NOT NULL,
    "cajaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoEventoCaja" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "esAlerta" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_caja_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "eventos_caja" ADD CONSTRAINT "eventos_caja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_caja" ADD CONSTRAINT "eventos_caja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
