-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "parentId" INTEGER;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
