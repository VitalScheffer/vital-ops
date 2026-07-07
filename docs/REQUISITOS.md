# vital-ops — Brief da plataforma (fonte de verdade pros agentes)

> Plataforma **interna de operações** da Vital Scheffer. **Separada** do CRM `nextstep`.
> Reaproveita o *conhecimento* do Omie do nextstep (não o código Django).
> Nome de marca final a definir; nome técnico = `vital-ops`.

## 0. Regras pros agentes (LEIA)

- **Next.js 16.2.10 tem breaking changes.** Antes de escrever código, **leia
  `node_modules/next/dist/docs/`** (App Router, Route Handlers, Server Actions, middleware,
  auth). Não confie em memória de versões antigas.
- **Código/identificadores em inglês; UI e mensagens em pt-BR.**
- **Clean code**: early return, sem else redundante, predicados nomeados, poucos comentários.
- **Sempre com testes** (Vitest). Rode `npm run lint` + `tsc` + testes antes de dizer "pronto".
- **Divisão de trabalho** (mesma repo, pastas diferentes — NÃO invadir a pasta do outro):
  - **Backend agent** → `prisma/`, `src/server/`, `src/lib/`, `src/app/api/`, deps de back.
  - **Frontend agent** → `src/app/**/(page|layout).tsx`, `src/components/`, `src/styles`.
  - **Contrato compartilhado** (tipos, zod schemas) → `src/lib/contracts/` (backend define, front consome).
- **Não commitar `.env`.** Segredos via env (Vercel). `.env.example` documenta as chaves.

## 1. Decisões travadas

| Tema | Decisão |
|---|---|
| Stack | Next.js 16.2.x full-stack + Prisma + PostgreSQL + Auth.js + fila (pg-boss ou Inngest) |
| Login | **Google restrito a `@vitalscheffer.com.br`** |
| Papéis | `ADMIN`, `GESTOR`, `FUNCIONARIO` |
| Criar usuário | **Admin e Gestor** podem criar usuários |
| Omie | **app_key/app_secret PRÓPRIOS** da plataforma (env) |
| Deploy | **Vercel** (grátis por ora) |
| Auditoria | **em TUDO** — ver §5 |

## 2. Papéis e setores

- `ADMIN` (dono): tudo + gestão de usuários/setores.
- `GESTOR`: aprova requisições, cria usuários, vê auditoria do(s) seu(s) setor(es).
- `FUNCIONARIO`: cria cadastros/requisições, vê o próprio.
- Acesso por **SETOR** (Engenharia, Fábrica, Almoxarifado, Fiscal…) via membership (tabela).
- Limite fino por setor/função vem **depois** (Fase futura). Fase 1 = papel + setor básicos.

## 3. Módulos / Fases

1. **Fundação** (Fase 1): projeto + login (Auth.js/Google) + papéis/setores + **auditoria** + banco + cliente Omie (core) + shell de layout.
2. **Produtos** (Fase 2): BOM → Omie (absorve o `omie-bom-converter`) com tela de revisão + envio via API.
3. **Requisições de fábrica** (Fase 3): solicita → gestor confirma → baixa estoque (MAT).
4. **Fiscal/Notas** (Fase 4): nota↔pedido + correção do bug da UN (700→7).

## 4. Modelo de dados (Prisma — contrato)

```
User        { id, name, email @unique, role(ADMIN|GESTOR|FUNCIONARIO), active, createdAt, updatedAt }
Setor       { id, nome @unique, createdAt }
UserSetor   { userId, setorId }                         // membership N:N
AuditLog    { id, actorId, actorEmail, action, entity, entityId,
              summary, before Json?, after Json?, ip, userAgent, omieTarget?, createdAt }

// Módulo Produtos
ProdutoImport { id, autorId, arquivoNome, status(RASCUNHO|ENVIANDO|CONCLUIDO|FALHA),
                totalProdutos, totalEstrutura, criadoEm }
ProdutoItem   { id, importId, codigo, descricao, familia?, ncm, unidade, tipo, localEstoque?,
                controleLote Boolean, status(NOVO|DUPLICADO|ERRO|ENVIADO|FALHA),
                motivoErro?, omieCodigoProduto?, enviadoEm? }
EstruturaItem { id, importId, numeroPai, numeroFilho, codigoPai, codigoFilho, quantidade,
                status(PENDENTE|ENVIADO|FALHA), motivoErro? }

// Módulo Requisições (Fase 3)
Requisicao    { id, numero @unique, solicitanteId, sku, nome, quantidade, setorId,
                status(PENDENTE|CONFIRMADA|RECUSADA), gestorId?, confirmadaEm?, criadoEm }
MovimentoEstoque { id, requisicaoId, tipo, quantidade, omieRef?, criadoEm }

// Cliente Omie (portado do nextstep — durabilidade importa)
OmieCache     { chave @unique, resposta Json, expiraEm }          // TTL >= 60s, guarda ok/vazio
OmieBreaker   { id, estado, faults, blockedUntil?, atualizadoEm }  // soft/hard breaker
```

## 5. Auditoria (o usuário quer EM TUDO)

Registrar em `AuditLog` **toda ação relevante** (login/logout, criar/editar usuário, subir BOM,
enviar ao Omie, aprovar/recusar requisição, baixa de estoque). Campos:
- **quem** (`actorId`, `actorEmail`), **o quê** (`action`, `entity`, `entityId`),
- **resumo** legível (`summary`), **antes/depois** (`before`/`after` em JSON quando aplicável),
- **IP** do cliente (ler `x-forwarded-for` — na Vercel o IP real vem no header, não no socket),
- **user-agent**, **destino no Omie** (`omieTarget` = empresa/CNPJ da app_key), **data/hora**.
- Visível para **ADMIN e GESTOR** (tela de auditoria com filtro por pessoa/ação/data).

Implementar como **helper único** `audit(...)` chamado nas mutations (não deixar buraco).

## 6. Regras do Omie (HERDADAS do nextstep — quebrar isso BANE o app_key)

Fonte: `nextstep/docs/omie.md` + `nextstep/apps/omie/` (client, breaker, cache, taxonomy).

- **API call-based**: `POST https://app.omie.com.br/api/v1/<path>/` com
  `{ call, app_key, app_secret, param:[...] }`. **Erro vem como HTTP 200 + `faultstring`**
  (semântica invertida); HTTP 500 às vezes é validação (não transitório).
- **Orçamento de ban**: requisição idêntica < 60s = erro; **resultado vazio = erro** (conta pro ban);
  **10 erros seguidos = app_key bloqueado** (duração vem na msg); **sucesso zera** o contador.
- **write-then-handle-duplicate**: NÃO consultar-antes; chamar `Upsert`/`Incluir` e tratar duplicado.
- **Validar LOCAL antes** (campos, tamanhos, NCM) — não gastar ban com erro evitável.
- **Cache** de SKU/família (conhecido nunca re-bate). **Breaker** soft/hard, respeitar `blockedUntil`.
- **Classificar por `faultstring`** (normalizado, sem acento), não por `faultcode`.
- **Fila sequencial** pros envios (nada de disparar N chamadas iguais em paralelo).
- Calls que vamos usar:
  - `UpsertFamilia` (`geral/familias/`) — garantir COM/SBM/PCF/PCA antes dos produtos.
  - `UpsertProduto` (`geral/produtos/`) — obrigatórios: `codigo_produto_integracao`, `codigo`,
    `descricao`, `unidade`, `ncm`; + `tipoItem="04"`; + família; + **controle de lote** (ver §7).
  - `IncluirEstrutura` (`geral/malha/`) — pai `intProduto`, filho `intProdMalha`, `quantProdMalha`.
  - (Fase 3) baixa de estoque — ver `nextstep/apps/omie/services/estoque.py` pro call certo.
- **Idempotência**: `codigo_produto_integracao = nosso código` → estrutura referencia por `int...` sem consultar id interno.

## 7. Módulo Produtos — regras específicas (do usuário)

Reaproveitar a lógica do `omie-bom-converter` (`C:\Users\TREINAMENTO\omie-bom-converter\src\lib`):
`bomParser.ts` (código 5-5-5 com espaço, família COM/SBM/PCF/PCA, `parseEstrutura` pela coluna Nº).

- **Fixos**: NCM `9403.20.90` (era `9999.99.99`, mas a SEFAZ rejeitava como "NCM inexistente"
  na nota de transferência — trocado em 07/07/2026 a pedido do Vitor), unidade `UN`, tipo `04`.
- **Controle de lote**: **sempre ativar** "este produto possui controle de lote" (CONFIRMADO).
  Setar o campo correspondente no `UpsertProduto` (confirmar o nome exato do campo na API do Omie).
  O schema já traz `ProdutoItem.controleLote` com default `true`.
- ⚠️ **Reenvio sem storm de duplicado**: preferir `UpsertProduto`/`UpsertFamilia` (retornam OK no
  reenvio = atualização, não "já cadastrado"). `IncluirEstrutura` NÃO tem Upsert → ao reenviar uma
  estrutura que já existe, tratar `OmieDuplicate` como sucesso E evitar mandar em massa o que já
  existe (senão o Omie conta como erro e pode bloquear o app_key).
- **Dedup**: 1 código = 1 produto (parafuso repetido não vira N cadastros). Já implementado no parser.
- **Avisar o usuário** o que precisa corrigir (erros de formato/tamanho) antes de enviar.
- **Processar em lote**: enviar o import inteiro pela fila (com ✓/✗ por item).
- **Tela de revisão** (a "telinha"): lista editável do que vai (código/desc/família/qtd/local),
  mostra **pra onde vai** (empresa Omie da app_key) e marca **CRIAR × ATUALIZAR**.

## 8. Confirmações do usuário

- ✅ **"9999 em tudo" = o NCM** (`9999.99.99`). **SUPERADO em 07/07/2026**: a SEFAZ rejeita
  `9999.99.99` como "NCM inexistente" na nota de transferência; o fixo agora é `9403.20.90`.
- ✅ **Controle de lote**: ativar automático sempre (toggle da tela de produto do Omie).
- ⏸️ **Bug UN (700 vira 7.00000)**: é um erro de **÷100 / casa decimal** (vem da tela de Produtos
  do Omie). Adiado — "vemos melhor juntos". Fase 4.

## 9. Convenções de pastas

```
prisma/schema.prisma                 modelo (backend)
src/lib/contracts/                   tipos + zod compartilhados (backend define)
src/lib/omie/                        cliente Omie (client, breaker, cache, taxonomy) — TS
src/lib/audit.ts                     helper de auditoria
src/lib/bom/                         parser da BOM (portado do omie-bom-converter)
src/server/                          serviços/casos de uso (backend)
src/app/api/                         Route Handlers
src/app/(app)/                       páginas autenticadas por setor (frontend)
src/app/login/                       login (frontend)
src/components/                      UI (frontend)
```
