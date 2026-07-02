-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'FUNCIONARIO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetor" (
    "userId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,

    CONSTRAINT "UserSetor_pkey" PRIMARY KEY ("userId","setorId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "omieTarget" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","module")
);

-- CreateTable
CREATE TABLE "ProdutoImport" (
    "id" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "totalProdutos" INTEGER NOT NULL DEFAULT 0,
    "totalEstrutura" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "familia" TEXT,
    "ncm" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "localEstoque" TEXT,
    "controleLote" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'NOVO',
    "motivoErro" TEXT,
    "omieCodigoProduto" TEXT,
    "enviadoEm" TIMESTAMP(3),

    CONSTRAINT "ProdutoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstruturaItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "numeroPai" TEXT NOT NULL,
    "numeroFilho" TEXT NOT NULL,
    "codigoPai" TEXT NOT NULL,
    "codigoFilho" TEXT NOT NULL,
    "quantidade" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "motivoErro" TEXT,

    CONSTRAINT "EstruturaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisicao" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "quantidade" DECIMAL(65,30) NOT NULL,
    "setorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "gestorId" TEXT,
    "confirmadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Requisicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoEstoque" (
    "id" TEXT NOT NULL,
    "requisicaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DECIMAL(65,30) NOT NULL,
    "omieRef" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmieCache" (
    "chave" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "call" TEXT NOT NULL,
    "param" JSONB NOT NULL,
    "categoria" TEXT NOT NULL,
    "resposta" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmieCache_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "OmieBreaker" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "estado" TEXT NOT NULL DEFAULT 'CLOSED',
    "faults" INTEGER NOT NULL DEFAULT 0,
    "cooldownUntil" TIMESTAMP(3),
    "blockedUntil" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmieBreaker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Setor_nome_key" ON "Setor"("nome");

-- CreateIndex
CREATE INDEX "UserSetor_setorId_idx" ON "UserSetor"("setorId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ProdutoImport_autorId_idx" ON "ProdutoImport"("autorId");

-- CreateIndex
CREATE INDEX "ProdutoImport_status_idx" ON "ProdutoImport"("status");

-- CreateIndex
CREATE INDEX "ProdutoItem_importId_idx" ON "ProdutoItem"("importId");

-- CreateIndex
CREATE INDEX "ProdutoItem_codigo_idx" ON "ProdutoItem"("codigo");

-- CreateIndex
CREATE INDEX "EstruturaItem_importId_idx" ON "EstruturaItem"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "Requisicao_numero_key" ON "Requisicao"("numero");

-- CreateIndex
CREATE INDEX "Requisicao_solicitanteId_idx" ON "Requisicao"("solicitanteId");

-- CreateIndex
CREATE INDEX "Requisicao_setorId_idx" ON "Requisicao"("setorId");

-- CreateIndex
CREATE INDEX "Requisicao_status_idx" ON "Requisicao"("status");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_requisicaoId_idx" ON "MovimentoEstoque"("requisicaoId");

-- CreateIndex
CREATE INDEX "OmieCache_path_idx" ON "OmieCache"("path");

-- CreateIndex
CREATE INDEX "OmieCache_expiraEm_idx" ON "OmieCache"("expiraEm");

-- AddForeignKey
ALTER TABLE "UserSetor" ADD CONSTRAINT "UserSetor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetor" ADD CONSTRAINT "UserSetor_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoImport" ADD CONSTRAINT "ProdutoImport_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoItem" ADD CONSTRAINT "ProdutoItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ProdutoImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstruturaItem" ADD CONSTRAINT "EstruturaItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ProdutoImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_gestorId_fkey" FOREIGN KEY ("gestorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "Requisicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
