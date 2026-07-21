-- A fila da equipe de Projetos passou a viver no próprio vital-ops (antes o plano
-- era uma tela no NextStep alimentada por uma ponte assinada). Sem ponte, os
-- campos de sincronização perdem o sentido; e quem responde agora é um usuário
-- daqui, então `respondidoPor` vira relação com User em vez de texto solto.
-- Nenhuma dessas colunas chegou a ser escrita pela aplicação.

-- DropColumn
ALTER TABLE "Configuracao" DROP COLUMN "sincronizadoEm";
ALTER TABLE "Configuracao" DROP COLUMN "sincronizacaoErro";
ALTER TABLE "Configuracao" DROP COLUMN "tentativasSync";
ALTER TABLE "Configuracao" DROP COLUMN "respondidoPor";

-- AddColumn
ALTER TABLE "Configuracao" ADD COLUMN "respondidoPorId" TEXT;

-- DropIndex
DROP INDEX "Configuracao_codigo_idx";

-- CreateIndex
CREATE INDEX "Configuracao_codigo_status_idx" ON "Configuracao"("codigo", "status");

-- AddForeignKey
ALTER TABLE "Configuracao" ADD CONSTRAINT "Configuracao_respondidoPorId_fkey" FOREIGN KEY ("respondidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
