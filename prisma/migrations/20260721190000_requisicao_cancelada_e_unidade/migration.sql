-- AlterTable
ALTER TABLE "Requisicao" ADD COLUMN     "cancelada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canceladaPorId" TEXT,
ADD COLUMN     "canceladaEm" TIMESTAMP(3),
ADD COLUMN     "motivoCancelamento" TEXT;

-- AlterTable
ALTER TABLE "RequisicaoItem" ADD COLUMN     "unidade" TEXT;

-- AddForeignKey
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_canceladaPorId_fkey" FOREIGN KEY ("canceladaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
