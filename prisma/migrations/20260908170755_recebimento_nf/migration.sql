-- CreateTable
CREATE TABLE "RecebimentoNota" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "criadoPorNome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecebimentoNota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecebimentoItem" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "materialRecebido" BOOLEAN NOT NULL DEFAULT false,
    "temOC" BOOLEAN NOT NULL DEFAULT false,
    "ocAprovado" BOOLEAN NOT NULL DEFAULT false,
    "nfeLancada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RecebimentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecebimentoNota_dataEmissao_idx" ON "RecebimentoNota"("dataEmissao");

-- CreateIndex
CREATE INDEX "RecebimentoItem_notaId_idx" ON "RecebimentoItem"("notaId");

-- AddForeignKey
ALTER TABLE "RecebimentoItem" ADD CONSTRAINT "RecebimentoItem_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "RecebimentoNota"("id") ON DELETE CASCADE ON UPDATE CASCADE;
