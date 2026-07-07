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

-- CreateTable
CREATE TABLE "ReportAnexo" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAnexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportAnexo_reportId_idx" ON "ReportAnexo"("reportId");

-- AddForeignKey
ALTER TABLE "ReportAnexo" ADD CONSTRAINT "ReportAnexo_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
