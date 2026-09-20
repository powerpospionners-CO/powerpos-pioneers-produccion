-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "consumoEmpleadosHabilitado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "consumos_empleados" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "empleadoNombre" TEXT NOT NULL,
    "observacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumos_empleados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_empleado_items" (
    "id" SERIAL NOT NULL,
    "consumoEmpleadoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioReferencia" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "consumo_empleado_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "consumos_empleados" ADD CONSTRAINT "consumos_empleados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_empleados" ADD CONSTRAINT "consumos_empleados_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumos_empleados" ADD CONSTRAINT "consumos_empleados_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_empleado_items" ADD CONSTRAINT "consumo_empleado_items_consumoEmpleadoId_fkey" FOREIGN KEY ("consumoEmpleadoId") REFERENCES "consumos_empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_empleado_items" ADD CONSTRAINT "consumo_empleado_items_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
