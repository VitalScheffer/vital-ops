-- Dois passos do MESMO item da OP, não dois registros: reservar (transferir
-- para o local de produção) e consumir (baixar). O que se baixa é exatamente o
-- que foi reservado, então as colunas de consumo entram no MovimentoOpItem.
--
-- `baixaLocalCodigo` existe porque o estorno tem que lançar a entrada de volta
-- NO MESMO local de onde saiu, e a pessoa pode escolher um local diferente por
-- item.
--
-- `substituiSku` guarda o código NOVO que a OP pediu quando a pessoa move o
-- cadastro ANTIGO no lugar dele (o saldo ainda está no velho). Sem ele o
-- histórico diria que a OP consumiu um PRD que ela nunca pediu.

-- `baixaSeq` conta os ciclos de baixa/estorno e entra no cod_int_ajuste
-- (`<id>-b<seq>`). Sem ele, baixar de novo depois de um estorno reusaria a
-- mesma chave de idempotência: o Omie responderia "duplicado", o app marcaria
-- como baixado e o material continuaria no estoque.

-- AddColumn
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "substituiSku" TEXT;
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "baixaSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "baixadoEm" TIMESTAMP(3);
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "refBaixa" TEXT;
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "baixaLocalCodigo" TEXT;
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "baixaLocalNome" TEXT;
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "baixaMotivoErro" TEXT;
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "baixaLote" JSONB;
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "estornadoEm" TIMESTAMP(3);
ALTER TABLE "MovimentoOpItem" ADD COLUMN     "refEstorno" TEXT;

-- CreateIndex
CREATE INDEX "MovimentoOpItem_baixadoEm_idx" ON "MovimentoOpItem"("baixadoEm");
