-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'PROBLEMA',
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "autorId" TEXT,
    "autorEmail" TEXT,
    "rota" TEXT,
    "userAgent" TEXT,
    "contexto" JSONB,
    "resposta" TEXT,
    "resolvidoPorId" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_autorId_idx" ON "Report"("autorId");

-- CreateIndex
CREATE INDEX "Report_criadoEm_idx" ON "Report"("criadoEm");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvidoPorId_fkey" FOREIGN KEY ("resolvidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
