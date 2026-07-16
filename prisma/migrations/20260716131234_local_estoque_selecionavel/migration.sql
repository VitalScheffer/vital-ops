-- AlterTable
ALTER TABLE "BaixaImport" ADD COLUMN     "localEstoqueCodigo" TEXT,
ADD COLUMN     "localEstoqueNome" TEXT;

-- AlterTable
ALTER TABLE "Requisicao" ADD COLUMN     "localEstoqueCodigo" TEXT,
ADD COLUMN     "localEstoqueNome" TEXT;
