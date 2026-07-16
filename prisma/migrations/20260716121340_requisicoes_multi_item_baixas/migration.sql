/*
  Warnings:

  - You are about to drop the column `requisicaoId` on the `MovimentoEstoque` table. All the data in the column will be lost.
  - You are about to drop the column `confirmadaEm` on the `Requisicao` table. All the data in the column will be lost.
  - You are about to drop the column `nome` on the `Requisicao` table. All the data in the column will be lost.
  - You are about to drop the column `quantidade` on the `Requisicao` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `Requisicao` table. All the data in the column will be lost.
  - The `numero` column on the `Requisicao` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `sku` to the `MovimentoEstoque` table without a default value. This is not possible if the table is not empty.
  - Added the required column `solicitanteNome` to the `Requisicao` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MovimentoEstoque" DROP CONSTRAINT "MovimentoEstoque_requisicaoId_fkey";

-- DropIndex
DROP INDEX "MovimentoEstoque_requisicaoId_idx";

-- AlterTable
ALTER TABLE "MovimentoEstoque" DROP COLUMN "requisicaoId",
ADD COLUMN     "baixaItemId" TEXT,
ADD COLUMN     "requisicaoItemId" TEXT,
ADD COLUMN     "sku" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Requisicao" DROP COLUMN "confirmadaEm",
DROP COLUMN "nome",
DROP COLUMN "quantidade",
DROP COLUMN "sku",
ADD COLUMN     "decididaEm" TIMESTAMP(3),
ADD COLUMN     "motivoDecisao" TEXT,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "solicitanteNome" TEXT NOT NULL,
DROP COLUMN "numero",
ADD COLUMN     "numero" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "RequisicaoItem" (
    "id" TEXT NOT NULL,
    "requisicaoId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "motivoErro" TEXT,
    "omieIdProd" TEXT,
    "omieRef" TEXT,
    "baixadoEm" TIMESTAMP(3),

    CONSTRAINT "RequisicaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaixaImport" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "solicitante" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVIANDO',
    "totalItens" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaixaImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaixaItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "descricao" TEXT,
    "quantidade" DECIMAL(65,30) NOT NULL,
    "pedido" TEXT,
    "notaFiscal" TEXT,
    "op" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "motivoErro" TEXT,
    "omieIdProd" TEXT,
    "omieRef" TEXT,
    "baixadoEm" TIMESTAMP(3),

    CONSTRAINT "BaixaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequisicaoItem_requisicaoId_idx" ON "RequisicaoItem"("requisicaoId");

-- CreateIndex
CREATE INDEX "RequisicaoItem_sku_idx" ON "RequisicaoItem"("sku");

-- CreateIndex
CREATE INDEX "BaixaImport_autorId_idx" ON "BaixaImport"("autorId");

-- CreateIndex
CREATE INDEX "BaixaImport_status_idx" ON "BaixaImport"("status");

-- CreateIndex
CREATE INDEX "BaixaItem_importId_idx" ON "BaixaItem"("importId");

-- CreateIndex
CREATE INDEX "BaixaItem_sku_idx" ON "BaixaItem"("sku");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_requisicaoItemId_idx" ON "MovimentoEstoque"("requisicaoItemId");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_baixaItemId_idx" ON "MovimentoEstoque"("baixaItemId");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_sku_idx" ON "MovimentoEstoque"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Requisicao_numero_key" ON "Requisicao"("numero");

-- AddForeignKey
ALTER TABLE "RequisicaoItem" ADD CONSTRAINT "RequisicaoItem_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "Requisicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaixaImport" ADD CONSTRAINT "BaixaImport_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaixaItem" ADD CONSTRAINT "BaixaItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BaixaImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_requisicaoItemId_fkey" FOREIGN KEY ("requisicaoItemId") REFERENCES "RequisicaoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_baixaItemId_fkey" FOREIGN KEY ("baixaItemId") REFERENCES "BaixaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
