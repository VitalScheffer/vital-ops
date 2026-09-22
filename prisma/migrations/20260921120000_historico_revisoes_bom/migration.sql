-- CreateTable
CREATE TABLE "ProdutoRevisao" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "revisao" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "linha" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoRevisao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProdutoRevisao_importId_idx" ON "ProdutoRevisao"("importId");

-- CreateIndex
CREATE INDEX "ProdutoRevisao_codigo_idx" ON "ProdutoRevisao"("codigo");

-- CreateIndex
CREATE INDEX "ProdutoRevisao_revisao_idx" ON "ProdutoRevisao"("revisao");

-- AddForeignKey
ALTER TABLE "ProdutoRevisao" ADD CONSTRAINT "ProdutoRevisao_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ProdutoImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
