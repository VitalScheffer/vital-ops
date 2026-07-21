-- CreateTable
CREATE TABLE "Configuracao" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "produtoSlug" TEXT NOT NULL,
    "produtoNome" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "autorEmail" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "selecoes" JSONB NOT NULL,
    "foraDoPadrao" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENVIADA',
    "projetoCad" TEXT,
    "respostaNota" TEXT,
    "respondidoPor" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "sincronizadoEm" TIMESTAMP(3),
    "sincronizacaoErro" TEXT,
    "tentativasSync" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Configuracao_numero_key" ON "Configuracao"("numero");

-- CreateIndex
CREATE INDEX "Configuracao_autorId_idx" ON "Configuracao"("autorId");

-- CreateIndex
CREATE INDEX "Configuracao_codigo_idx" ON "Configuracao"("codigo");

-- CreateIndex
CREATE INDEX "Configuracao_status_idx" ON "Configuracao"("status");

-- CreateIndex
CREATE INDEX "Configuracao_produtoSlug_idx" ON "Configuracao"("produtoSlug");

-- CreateIndex
CREATE INDEX "Configuracao_criadoEm_idx" ON "Configuracao"("criadoEm");

-- AddForeignKey
ALTER TABLE "Configuracao" ADD CONSTRAINT "Configuracao_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
