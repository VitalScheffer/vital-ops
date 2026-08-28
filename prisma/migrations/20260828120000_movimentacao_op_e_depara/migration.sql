-- Movimentação por OP (transferência entre locais de estoque) + De/Para de
-- código antigo para o cadastro novo.
--
-- `MovimentoOpItem.status = 'SAIDA_OK'` é o estado que motiva estas tabelas: o
-- Omie não tem transferência entre locais, então cada item são duas escritas
-- (saída na origem, entrada no destino). Sem persistir a perna que faltou, uma
-- queda no meio da execução viraria divergência de estoque silenciosa.

-- CreateTable
CREATE TABLE "MovimentoOp" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "numeroOp" TEXT NOT NULL,
    "omieCodigoOp" TEXT,
    "produtoCodigo" TEXT,
    "produtoDescricao" TEXT,
    "quantidadeOp" DECIMAL(65,30),
    "origemCodigo" TEXT NOT NULL,
    "origemNome" TEXT,
    "destinoCodigo" TEXT NOT NULL,
    "destinoNome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENVIANDO',
    "totalItens" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoOp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoOpItem" (
    "id" TEXT NOT NULL,
    "movimentoId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "descricao" TEXT,
    "unidade" TEXT,
    "familia" TEXT,
    "grupo" TEXT,
    "quantidade" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "motivoErro" TEXT,
    "omieIdProd" TEXT,
    "refSaida" TEXT,
    "refEntrada" TEXT,
    "custoUnitario" DECIMAL(65,30),
    "loteConsumido" JSONB,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "MovimentoOpItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeParaProduto" (
    "id" TEXT NOT NULL,
    "codigoLegado" TEXT NOT NULL,
    "descricaoLegado" TEXT NOT NULL,
    "unidadeLegado" TEXT,
    "codigoNovo" TEXT,
    "descricaoNovo" TEXT,
    "unidadeNovo" TEXT,
    "confianca" TEXT NOT NULL,
    "motivo" TEXT,
    "observacao" TEXT,
    "confirmadoPorId" TEXT,
    "confirmadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeParaProduto_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "MovimentoEstoque" ADD COLUMN     "movimentoOpItemId" TEXT;

-- CreateIndex
CREATE INDEX "MovimentoOp_autorId_idx" ON "MovimentoOp"("autorId");

-- CreateIndex
CREATE INDEX "MovimentoOp_numeroOp_idx" ON "MovimentoOp"("numeroOp");

-- CreateIndex
CREATE INDEX "MovimentoOp_status_idx" ON "MovimentoOp"("status");

-- CreateIndex
CREATE INDEX "MovimentoOpItem_movimentoId_idx" ON "MovimentoOpItem"("movimentoId");

-- CreateIndex
CREATE INDEX "MovimentoOpItem_sku_idx" ON "MovimentoOpItem"("sku");

-- CreateIndex
CREATE INDEX "MovimentoOpItem_status_idx" ON "MovimentoOpItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeParaProduto_codigoLegado_key" ON "DeParaProduto"("codigoLegado");

-- CreateIndex
CREATE INDEX "DeParaProduto_codigoNovo_idx" ON "DeParaProduto"("codigoNovo");

-- CreateIndex
CREATE INDEX "DeParaProduto_confianca_idx" ON "DeParaProduto"("confianca");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_movimentoOpItemId_idx" ON "MovimentoEstoque"("movimentoOpItemId");

-- AddForeignKey
ALTER TABLE "MovimentoOp" ADD CONSTRAINT "MovimentoOp_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoOpItem" ADD CONSTRAINT "MovimentoOpItem_movimentoId_fkey" FOREIGN KEY ("movimentoId") REFERENCES "MovimentoOp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeParaProduto" ADD CONSTRAINT "DeParaProduto_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_movimentoOpItemId_fkey" FOREIGN KEY ("movimentoOpItemId") REFERENCES "MovimentoOpItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
