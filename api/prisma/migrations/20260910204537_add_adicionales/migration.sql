-- CreateTable
CREATE TABLE "adicionales" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "ingredienteId" INTEGER,
    "cantidad" DECIMAL(10,3),
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adicionales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_adicionales" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "adicionalId" INTEGER NOT NULL,

    CONSTRAINT "producto_adicionales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_pedido_adicionales" (
    "id" SERIAL NOT NULL,
    "detallePedidoId" INTEGER NOT NULL,
    "adicionalId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "detalle_pedido_adicionales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producto_adicionales_productoId_adicionalId_key" ON "producto_adicionales"("productoId", "adicionalId");

-- AddForeignKey
ALTER TABLE "adicionales" ADD CONSTRAINT "adicionales_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adicionales" ADD CONSTRAINT "adicionales_ingredienteId_fkey" FOREIGN KEY ("ingredienteId") REFERENCES "ingredientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_adicionales" ADD CONSTRAINT "producto_adicionales_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_adicionales" ADD CONSTRAINT "producto_adicionales_adicionalId_fkey" FOREIGN KEY ("adicionalId") REFERENCES "adicionales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedido_adicionales" ADD CONSTRAINT "detalle_pedido_adicionales_detallePedidoId_fkey" FOREIGN KEY ("detallePedidoId") REFERENCES "detalle_pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_pedido_adicionales" ADD CONSTRAINT "detalle_pedido_adicionales_adicionalId_fkey" FOREIGN KEY ("adicionalId") REFERENCES "adicionales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
