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
  - `ListarProdutos` (`geral/produtos/`, filtro `produtosPorCodigo: [{codigo}]`) — READ, só usado
    depois de um conflito de descrição confirmado (nunca preventivamente), pra achar
    `codigo_produto`/`codigo_produto_integracao` do cadastro já existente e reaproveitar (ver §7).
    Mesmo padrão já usado no nextstep (`apps/omie/services/products.py`).
  - `ConsultarProduto` (`geral/produtos/`, param `codigo_produto: <id interno>`) — READ, só usado
    depois de um conflito de CÓDIGO confirmado (a mensagem do Omie já cita o ID interno do
    cadastro existente). Confirmado na doc oficial (`developer.omie.com.br`) que `codigo_produto`
    é aceito como chave principal pra localizar o produto (ver §7).
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
- **Descrição já usada por outro código** (comum em peça padrão reaproveitada entre BOMs, ex.
  parafuso/dobradiça — Vitor: "melhor sempre aproveitar o que já tem cadastrado, pois esses itens já
  podem estar em outro produto que está em ordem de produção ou com saldo em estoque"): o Omie
  rejeita o `UpsertProduto` com "A descrição informada já está sendo utilizada pelo produto com
  código X" — às vezes via **HTTP 500** (não só 200+faultstring, ver §6). Classificado como categoria
  própria (`DESCRIPTION_CONFLICT` → `OmieDescriptionConflict`). **Decisão confirmada em 08/07/2026:
  reaproveitar automaticamente** — extrai o código conflitante da mensagem, busca via
  `ListarProdutos` (§6) e usa o `codigo_produto`/`codigo_produto_integracao` já existentes (outcome
  "já existia"; a Estrutura passa a referenciar esse código real, não o gerado localmente pela BOM).
  Se não achar o cadastro (busca vazia/erro), cai pra "falha" sem assumir sucesso — **não para o
  lote** nos dois casos (não é sinal de risco de bloqueio do app_key). Corrigido após o João bater
  nisso em produção (5 itens ok, o 6º parava o lote inteiro — 50 itens saudáveis ficavam presos).
- **Código já usado por outro ID** (mesma ideia acima, mas o Omie identifica o cadastro existente
  pelo ID interno, não pela descrição): "O código X informado já está sendo utilizado pelo produto
  com ID Y" (confirmado em produção 08/07/2026, item PC021). Classificado como categoria própria
  (`CODE_CONFLICT` → `OmieCodeConflict`), mesma política de reaproveitamento automático — busca via
  `ConsultarProduto`/`codigo_produto` (§6) em vez de `ListarProdutos`/`codigo`. **Atenção ao
  gênero do verbo**: o Omie varia entre "utilizado" e "utiliza**da**" (09/07/2026 apareceu
  "O código ... utiliza**da** ... com ID", quebrando o regex antigo que exigia "utilizado" e
  fazendo o item virar "falha" + bloqueio da chave). Os regexes de conflito passam a ancorar no
  final da mensagem ("...com código" vs "...com id") e tolerar os dois gêneros (`utilizad[oa]`),
  em vez de depender do prefixo do sujeito.
- **Só `OmieBlocked` para o lote inteiro** (decisão de 08/07/2026, generalizada após o João bater
  de novo num item diferente — item 21/PC021 com faultstring não coberto pelo regex específico de
  `DESCRIPTION_CONFLICT`, e o lote parou de novo, deixando tudo abaixo dele como "não enviado").
  Qualquer `OmieError` — classificado (`DUPLICATE`, `DESCRIPTION_CONFLICT`) ou **não** — passa a ser
  falha isolada daquele item/família/relação de estrutura; o orquestrador segue pros próximos. O
  breaker do client (§6) já conta toda falha e lança `OmieBlocked` sozinho se acumular demais (soft
  6/2min, hard em bloqueio explícito) — o orquestrador travar o lote de novo por cima disso era
  redundante e frágil (dependia de cobrir cada variação de faultstring com um regex próprio).
- **Freio de segurança próprio (sequência de respostas fora do sucesso limpo)** — decisão de
  08/07/2026, depois que a Omie bloqueou a app_key por 30 min num teste real assim que o item acima
  passou a não parar mais o lote. A Omie conta TODA resposta fora de sucesso limpo (inclusive
  duplicado/conflito) pro PRÓPRIO limite de banimento (§6: "resultado vazio = erro, conta pro ban";
  "reenviar estrutura já existente em massa... conta como erro e pode bloquear"), mas o breaker do
  client não enxerga isso: a leitura de resolução de conflito (`ListarProdutos`/`ConsultarProduto`)
  costuma dar OK logo em seguida e reseta o contador dele. Por isso `orquestrarEnvio` mantém sua
  PRÓPRIA sequência (compartilhada entre família/produto/estrutura, zera em sucesso limpo) e pausa o
  envio sozinho ao bater `LIMITE_SEQUENCIA_RISCO` (5) respostas seguidas sem sucesso limpo — bem
  abaixo do limite real da Omie (10). `interrompido=true` mas `bloqueado=false` (não é bloqueio real,
  é margem de segurança nossa); os itens restantes ficam "não enviado" pra reenviar depois.
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
