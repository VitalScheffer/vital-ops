-- Fator de conversão do par De/Para e a migração de saldo do código antigo.
--
-- `fatorConversao` guarda "1 unidade do NOVO = X do ANTIGO". Sem ele, um par em
-- unidades diferentes (M² no antigo, KG no novo) só dava para movimentar
-- digitando a quantidade na mão, item por item, toda vez — e o número certo é
-- sempre o MESMO para aquele par.
--
-- `aposentadoEm` é a tag que tira o cadastro velho de circulação: some da fila
-- de revisão e para de ser oferecido como substituto na Movimentação por OP. É
-- marca NOSSA, separada de `inativadoNoOmieEm` de propósito — o cadastro pode
-- estar aposentado aqui e ainda ativo no Omie (a inativação lá é uma escrita
-- que pode falhar).
--
-- `saldoMigrado` responde "quanto tinha ali quando a gente virou a chave". É
-- contra ele que uma entrada NOVA no código velho (a NF que chegou com o PRD
-- antigo) aparece como divergência a tratar, em vez de passar batida.
--
-- MigracaoLegado/Item têm a mesma anatomia do MovimentoOp: o Omie não sabe
-- trocar o produto de um saldo, então cada local vira DUAS escritas (saída do
-- antigo + entrada do novo, no MESMO local). `SAIDA_OK` é o estado que
-- justifica a tabela: a saída passou e a entrada não, e sem persistir isso uma
-- queda no meio viraria estoque evaporado que ninguém descobre.

-- AlterTable
ALTER TABLE "DeParaProduto" ADD COLUMN     "aposentadoEm" TIMESTAMP(3),
ADD COLUMN     "aposentadoPorId" TEXT,
ADD COLUMN     "fatorConversao" DECIMAL(65,30),
ADD COLUMN     "inativadoNoOmieEm" TIMESTAMP(3),
ADD COLUMN     "migradoEm" TIMESTAMP(3),
ADD COLUMN     "saldoMigrado" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "MigracaoLegado" (
    "id" TEXT NOT NULL,
    "deParaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "codigoLegado" TEXT NOT NULL,
    "codigoNovo" TEXT NOT NULL,
    "fator" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVIANDO',
    "totalLocais" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigracaoLegado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigracaoLegadoItem" (
    "id" TEXT NOT NULL,
    "migracaoId" TEXT NOT NULL,
    "localCodigo" TEXT NOT NULL,
    "localNome" TEXT,
    "quantidadeLegado" DECIMAL(65,30) NOT NULL,
    "quantidadeNovo" DECIMAL(65,30) NOT NULL,
    "custoUnitario" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "motivoErro" TEXT,
    "refSaida" TEXT,
    "refEntrada" TEXT,
    "loteConsumido" JSONB,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "MigracaoLegadoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MigracaoLegado_deParaId_idx" ON "MigracaoLegado"("deParaId");

-- CreateIndex
CREATE INDEX "MigracaoLegado_autorId_idx" ON "MigracaoLegado"("autorId");

-- CreateIndex
CREATE INDEX "MigracaoLegado_codigoLegado_idx" ON "MigracaoLegado"("codigoLegado");

-- CreateIndex
CREATE INDEX "MigracaoLegado_status_idx" ON "MigracaoLegado"("status");

-- CreateIndex
CREATE INDEX "MigracaoLegadoItem_migracaoId_idx" ON "MigracaoLegadoItem"("migracaoId");

-- CreateIndex
CREATE INDEX "MigracaoLegadoItem_status_idx" ON "MigracaoLegadoItem"("status");

-- CreateIndex
CREATE INDEX "DeParaProduto_aposentadoEm_idx" ON "DeParaProduto"("aposentadoEm");

-- AddForeignKey
ALTER TABLE "DeParaProduto" ADD CONSTRAINT "DeParaProduto_aposentadoPorId_fkey" FOREIGN KEY ("aposentadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigracaoLegado" ADD CONSTRAINT "MigracaoLegado_deParaId_fkey" FOREIGN KEY ("deParaId") REFERENCES "DeParaProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigracaoLegado" ADD CONSTRAINT "MigracaoLegado_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigracaoLegadoItem" ADD CONSTRAINT "MigracaoLegadoItem_migracaoId_fkey" FOREIGN KEY ("migracaoId") REFERENCES "MigracaoLegado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

