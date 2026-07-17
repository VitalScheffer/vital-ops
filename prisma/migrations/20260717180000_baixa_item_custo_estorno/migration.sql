-- AlterTable
ALTER TABLE "BaixaItem" ADD COLUMN     "custoUnitario" DECIMAL(65,30),
ADD COLUMN     "loteConsumido" JSONB,
ADD COLUMN     "estornadoEm" TIMESTAMP(3),
ADD COLUMN     "estornoRef" TEXT;
