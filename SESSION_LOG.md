# SESSION_LOG — vital-ops

## 2026-07-02 — Fase 1 (Backend / Fundação)

### Resumo
Implementada a fundação do backend do `vital-ops` conforme `docs/REQUISITOS.md`:
dependências, schema Prisma, Auth.js v5 (Google restrito ao domínio), auditoria,
client Omie (portado do nextstep), contratos compartilhados e rotas de API mínimas.
`npm run lint`, `npx tsc --noEmit` e `npm test` verdes.

### Arquivos criados/alterados
- `prisma/schema.prisma` — modelos do §4 (User, Setor, UserSetor, AuditLog,
  ProdutoImport, ProdutoItem, EstruturaItem, Requisicao, MovimentoEstoque,
  OmieCache, OmieBreaker) + enums (Role, ImportStatus, ProdutoItemStatus,
  EstruturaStatus, RequisicaoStatus).
- `prisma.config.ts` — config do Prisma 7 (URL de conexão para migrate).
- `src/lib/db.ts` — singleton do PrismaClient com driver adapter node-postgres.
- `src/lib/auth.config.ts` / `src/lib/auth.ts` / `src/lib/users.ts` — Auth.js v5
  (Google), rejeição fora de `@vitalscheffer.com.br`, papel/id no JWT.
- `src/types/next-auth.d.ts` — augmenta Session/JWT com `id` e `role`.
- `src/proxy.ts` — proxy (novo nome do middleware no Next 16) protegendo rotas.
- `src/app/api/auth/[...nextauth]/route.ts` — handlers do Auth.js.
- `src/app/api/auth/me/route.ts` — usuário logado + papel + setores.
- `src/app/api/produtos/imports/route.ts`, `src/app/api/requisicoes/route.ts` —
  stubs 501 documentados (Fases 2 e 3).
- `src/lib/audit.ts` — helper único de auditoria (IP via x-forwarded-for + UA).
- `src/lib/omie/` — `errors.ts`, `taxonomy.ts`, `breaker.ts`, `cache.ts`,
  `config.ts`, `stores.ts`, `client.ts`, `index.ts` + testes
  (`__tests__/taxonomy.test.ts`, `__tests__/breaker.test.ts`).
- `src/lib/contracts/` — `user.ts`, `produto.ts`, `requisicao.ts`, `api.ts`, `index.ts`.
- `vitest.config.ts`, `.env.example`, `next.config.ts` (serverExternalPackages),
  `package.json` (scripts test/db), `README.md` (seção Backend).

### Decisões importantes
- **Prisma 7**: `url` saiu do schema (vive em `prisma.config.ts`); runtime usa
  **driver adapter** `@prisma/adapter-pg` (+ `pg`). Generator clássico
  `prisma-client-js` (client em node_modules, fora do lint/tsc).
- **Next 16**: `middleware` foi renomeado para **`proxy`** (`src/proxy.ts`),
  roda no Node runtime. Auth split edge-safe (`auth.config.ts`) × Node (`auth.ts`).
- **Sessão via JWT** (sem adapter de banco no Auth.js): papel carregado no primeiro
  login por find-or-create (`syncUser`). Papel default `FUNCIONARIO`.
- **Client Omie**: lógica pura (`taxonomy`, `breaker`, `cacheKey`) separada da
  persistência (`stores.ts`), permitindo testes sem banco. Breaker soft 6/2min,
  hard pela duração da mensagem (fallback 30min); cache TTL 60s guardando ok/vazio.
- Campos de domínio seguem o §4 do brief (mistura pt/en proposital do contrato).

### Comandos relevantes
- `npm install prisma @prisma/client next-auth@beta zod` + `@prisma/adapter-pg pg`
  + dev `vitest @types/pg`.
- `npx prisma generate` → client gerado (v7.8.0). **`migrate` NÃO rodado** (sem banco).
- `npx tsc --noEmit` → 0 erros. `npx eslint .` → 0. `npm test` → 20/20 verdes.

### Pendências / próximos passos
- Criar a migration inicial quando houver Postgres: `npm run db:migrate -- --name init`
  (exportar `DATABASE_URL` antes).
- Promover o primeiro usuário a `ADMIN` no banco/seed.
- Fase 2: portar o parser BOM (`src/lib/bom/`) e implementar `/api/produtos/imports`
  + fila de envio ao Omie. Fase 3: `/api/requisicoes` + baixa de estoque.
- Testes de integração do `client.chamar` (mockando fetch) — hoje só a lógica pura
  é testada.

## 2026-07-02 — Fase 1 (Frontend / UI + ações de admin)

### Resumo
Implementada a camada de UI da Fase 1 sobre a fundação já pronta: login com Google,
shell autenticado com navegação filtrada por papel, dashboard por papel, Gestão de
Usuários/Setores (listar + criar, com Server Actions auditadas) e tela de Auditoria
com filtros. Identidade visual da Vital (petróleo/teal/turquesa) adaptada ao Tailwind
v4. `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` verdes (26 testes).

### Arquivos criados/alterados
- `src/app/globals.css` — tema de marca (claro por padrão + escuro via preferência),
  variáveis mapeadas em `@theme inline`.
- `src/app/layout.tsx` — lang pt-BR, metadata pt-BR, fonte da marca (sem next/font).
- `src/app/page.tsx` — **removido** (o `/` passa a ser servido por `(app)/page.tsx`).
- `src/app/login/page.tsx` — login com botão "Entrar com Google" (`signIn`), marca.
- `src/app/(app)/layout.tsx` — shell autenticado (guard de sessão + nav por papel).
- `src/app/(app)/page.tsx` — dashboard/landing por papel (atalhos dos módulos visíveis).
- `src/app/(app)/actions.ts` — `logoutAction` (auditado) com `signOut`.
- `src/app/(app)/usuarios/page.tsx` + `actions.ts` — listar/criar usuário e setor.
- `src/app/(app)/auditoria/page.tsx` — lista do AuditLog com filtros (pessoa/ação/período).
- `src/lib/rbac.ts` — predicados de papel (`canManageUsers`, `canViewAudit`, `canAssignRole`).
- `src/lib/navigation.ts` — itens de nav + `visibleNavFor(role)` (puro, serializável).
- `src/lib/navigation.test.ts` — testes de nav por papel + rbac (Vitest).
- `src/lib/form.ts` — tipo `FormState` + `IDLE_FORM_STATE` (useActionState).
- `src/lib/request.ts` — `requestHeaders()` (Headers real p/ o `audit()` pegar IP/UA).
- `src/components/` — `VitalLogo`, `AppShell` (cliente), `Panel`, `Forbidden`,
  `FormFeedback`, `users/CreateUserForm`, `users/CreateSetorForm`.
- `vitest.config.ts` — alias `@` → `src` para os testes da aplicação.
- `package.json` — dependência `lucide-react` (ícones SVG).

### Decisões importantes
- **Guard por papel de verdade**: a mesma regra (`rbac.ts`) esconde o item no menu,
  bloqueia a página (painel "Acesso negado") e valida na Server Action. FUNCIONARIO
  não vê nem acessa Usuários/Auditoria.
- **Auth via Server Actions** (`signIn`/`signOut` da fundação) em `<form action>`;
  sem SessionProvider/next-auth-react. Sessão lida server-side com `auth()`.
- **Só ADMIN concede papel ADMIN** (`canAssignRole`) — decisão de segurança (o brief
  não detalhava; Gestor cria FUNCIONARIO/GESTOR).
- **Auditoria**: `logout`, `user.create` e `setor.create` chamam `audit(...)`.
- **Route group `(app)`**: `/` agora vem de `(app)/page.tsx` — o `src/app/page.tsx`
  padrão foi removido para não conflitar a rota.

### Comandos relevantes
- `npm install lucide-react`.
- `npx tsc --noEmit` → 0 erros. `npx eslint .` → 0. `npx vitest run` → 26/26 verdes.

### Pendências / próximos passos
- **Sem Postgres** não deu para exercer em runtime: criação de usuário/setor, listagem
  de usuários e a tela de Auditoria (queries reais compilam no `tsc`, mas precisam de
  banco para rodar). Testar após `db:migrate` e com um ADMIN semeado.
- Auditoria de **login** ainda não é registrada (exigiria hook no callback do Auth.js,
  que é território da fundação/`src/lib/auth*`); só o logout é auditado por ora.
- Edição/desativação de usuário e paginação da auditoria ficam para além da Fase 1.

## 2026-07-02 — Rodar local sem Docker e sem Google (SQLite + login interno)

### Resumo
Ajustada a Fase 1 para rodar 100% local, sem Docker/Postgres e sem Google. Login
trocado para **e-mail + senha** (Credentials do Auth.js, `bcrypt`), banco migrado
para **SQLite** (driver adapter `better-sqlite3`), enums convertidos para `String`,
seed idempotente com ADMIN + GESTOR, e UI de login/criação de usuário atualizadas.
Migrate + seed rodados; `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` verdes
(26 testes). `next dev` NÃO foi executado (o usuário sobe).

### Logins padrão (dev)
- ADMIN: `admin@vitalscheffer.com.br` / `vital123`
- GESTOR: `gestor@vitalscheffer.com.br` / `vital123`

### Arquivos criados/alterados
- `prisma/schema.prisma` — `provider = "sqlite"`; enums → `String` (defaults string,
  ex. `@default("FUNCIONARIO")`); removidos `@db.Decimal(14,4)` (só `Decimal`);
  adicionado `passwordHash String?` no `User`; removidos `@default("{}")` dos `Json`
  de `OmieCache` (SQLite rejeita `DEFAULT {}`).
- `prisma.config.ts` — `datasource.url` default `file:./dev.db`.
- `prisma/seed.ts` (novo) + `package.json` script `db:seed` (`tsx prisma/seed.ts`).
- `src/lib/db.ts` — adapter `@prisma/adapter-better-sqlite3` (`PrismaBetterSqlite3`).
- `src/lib/auth.config.ts` — removido provider Google (`providers: []`); mantido
  `signIn`/`authorized`.
- `src/lib/auth.ts` — provider **Credentials** (email+senha) com `authorize`
  (normaliza email, `isCompanyEmail`, usuário existe/ativo, `bcrypt.compare`);
  mantidos callbacks jwt/session e o evento `signIn` que audita o login.
- `src/lib/users.ts`, `src/types/next-auth.d.ts` — `Role` importado de
  `@/lib/contracts` (não mais de `@prisma/client`); cast do `role` (String) do Prisma.
- `src/app/api/auth/me/route.ts`, `src/app/(app)/usuarios/page.tsx` — cast `role as Role`.
- `src/app/(app)/auditoria/page.tsx` — removido `mode: "insensitive"` (LIKE do SQLite
  já é case-insensitive p/ ASCII).
- `src/app/login/page.tsx` — form **e-mail + senha** (Server Action `signIn("credentials")`,
  trata erro de credencial via `?error=`); dica com os logins padrão em dev.
- `src/lib/contracts/user.ts` — `createUserSchema` ganhou `password` (min 6).
- `src/app/(app)/usuarios/actions.ts` — hash `bcrypt` da senha inicial ao criar usuário.
- `src/components/users/CreateUserForm.tsx` — campo "Senha inicial".
- `.env` (novo, gitignored), `.env.example` (sem Google, com SQLite/AUTH_SECRET/AUTH_URL),
  `.gitignore` (ignora `*.db*`), `README.md` (setup local + logins padrão),
  `src/app/api/auth/[...nextauth]/route.ts` (comentário).
- `package.json` — add `bcryptjs`, `@prisma/adapter-better-sqlite3`; dev `@types/bcryptjs`,
  `tsx`; removidos `@prisma/adapter-pg`, `pg`, `@types/pg`.

### Decisões importantes
- **SQLite sem enum**: papéis/status viram `String`; a validação continua no zod dos
  contratos (`src/lib/contracts`). Valores idênticos aos enums antigos.
- **Credentials no lado Node**: provider fica em `src/lib/auth.ts` (precisa de bcrypt +
  Prisma). O `auth.config.ts` (edge/proxy) só decide pela presença de sessão.
- **Caminho do SQLite**: `file:./dev.db` resolve para a raiz do projeto tanto no
  migrate quanto no runtime (verificado — o adapter lê o mesmo arquivo semeado).
- **Seed via `tsx`** (Node 24 rodaria `.ts`, mas o projeto é CJS → `tsx` evita atrito
  de ESM/CJS). Idempotente (upsert por e-mail), reaplica nome/papel/senha padrão.
- `@types/bcryptjs` mantido (pedido), embora `bcryptjs@3` já traga tipos próprios.

### Comandos relevantes
- `npm i bcryptjs @prisma/adapter-better-sqlite3` + dev `@types/bcryptjs tsx`;
  `npm uninstall @prisma/adapter-pg pg @types/pg`.
- `npx prisma generate` → OK (v7.8.0).
- `npx prisma migrate dev --name init` → criou `dev.db` e migration `..._init`
  (1ª tentativa falhou por `DEFAULT {}` nos Json; corrigido e reaplicado).
- `npm run db:seed` → ADMIN + GESTOR criados.
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 26/26.

### Pendências / próximos passos
- `next dev` não foi rodado (o usuário sobe); fluxo de login validado só por
  `bcrypt.compare` num script (senha bate). Convém logar de fato pela UI uma vez.
- Sem edição/reset de senha na UI; o reset hoje é recriar/re-semear.
- Ao voltar para produção (Postgres/Vercel) será preciso reverter provider/adapter
  e reintroduzir enums se desejado (ou manter String + zod).

## 2026-07-02 — Fase 2 (Produtos: BOM → Omie, parte LOCAL)

### Resumo
Adicionado o módulo **Produtos (BOM → Omie)** — parte local, sem chamar a API do
Omie. Portada a lógica do `omie-bom-converter` para `src/lib/bom/`, criada a aba
"Produtos" na barra lateral (visível a qualquer usuário autenticado) e a rota
`/produtos` com o fluxo client-side (upload da BOM, upload opcional de Omie atual
para dedupe, campo "Local de Estoque", preview de produtos + estrutura, botão que
gera e baixa o `.xlsx` preenchido). Geração 100% no navegador; o único toque no
servidor é uma Server Action que audita a geração. `npx tsc --noEmit`,
`npx eslint .` e `npx vitest run` verdes (55 testes). `next dev` NÃO foi rodado.

### Arquivos criados/alterados
- `src/lib/bom/types.ts`, `bomParser.ts`, `bomFile.ts`, `download.ts` — portados do
  `omie-bom-converter` (lógica idêntica: código 5-5-5, família COM/SBM/PCF/PCA,
  `parseBom`/`parseEstrutura`, leitura .xls/.xlsx, download no browser).
- `src/lib/bom/omieFile.ts` — portado; **única adaptação**: `lerBytesTemplate` troca
  `import.meta.env.BASE_URL` (Vite) por `fetch("/templates/Omie_Produtos_v1_9_5.xlsx")`
  (public/ do Next). Preenchimento cirúrgico das abas Omie_Produtos (C/D/E/I/J/AC) e
  Omie_Produtos_Estrutura (pai/filho/qtd/local) preservando o template.
- `src/lib/bom/bomParser.test.ts`, `omieFile.test.ts`, `__fixtures__/bomTeste.ts` —
  testes portados (paths adaptados; template lido via `fileURLToPath`).
- `src/components/produtos/FileDropzone.tsx` (client), `PreviewTable.tsx`,
  `EstruturaPreview.tsx`, `ProdutosClient.tsx` (client) — UI portada e adaptada aos
  tokens do vital-ops (`bg-card`, `text-foreground`, `bg-field`, `primary`, etc.).
- `src/app/(app)/produtos/page.tsx` — rota autenticada (Server Component) + header.
- `src/app/(app)/produtos/actions.ts` — Server Action `registrarPlanilhaGerada`
  (auditoria `produto.gerar_planilha` via `audit()`), validada com zod.
- `src/lib/navigation.ts` — item "Produtos" (ícone `products` → lucide `Boxes`),
  visível a todos; `NavIcon` ganhou `"products"`.
- `src/components/AppShell.tsx`, `src/app/(app)/page.tsx` — mapa de ícones + `Boxes`.
- `src/lib/navigation.test.ts` — arrays esperados atualizados (inclui `produtos`).
- `vitest.config.ts` — `testTimeout: 30000` (edição do template de ~4,4 MB é lenta;
  alguns testes zipam/descompactam duas vezes e estouravam o padrão de 5 s).
- `public/templates/Omie_Produtos_v1_9_5.xlsx` — template copiado do omie-bom-converter.
- `package.json` — add `xlsx@0.18.5` e `fflate@0.8.3`.

### Decisões importantes
- **Reuso máximo**: a lógica de parse/geração é a MESMA do omie-bom-converter (só
  mudaram imports e o carregamento do template). Isso mantém o comportamento já
  validado (dedupe por código sem espaços, NCM 9999.99.99, unidade UN, tipo 04).
- **Leitura de arquivo em event handler, não em `useEffect`**: a regra de lint
  `react-hooks/set-state-in-effect` (React 19/compiler) reprova `setState` síncrono
  em efeitos. Refatorado para ler a BOM/Omie no `onChange` do dropzone, com guarda
  por `reqId` (useRef) contra resultados fora de ordem — padrão "You Might Not Need
  an Effect".
- **Auditoria best-effort**: a geração/baixa acontece no browser; depois a Server
  Action registra o evento. Se a auditoria falhar, não desfaz o download (try/catch).
- **Sem banco neste módulo**: nada é persistido em `ProdutoImport`/`ProdutoItem`
  ainda — isso é da próxima fase (envio via API). A tela deixa explícito (banner)
  que hoje só gera a planilha para importar manualmente no Omie (passo 3).

### Comandos relevantes
- `npm install xlsx@0.18.5 fflate@0.8.3`.
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 55/55 (5 arquivos).
- Smoke test no dev server já rodando: `GET /produtos` → 307 (redireciona p/ login,
  ou seja, a rota compila); `GET /templates/Omie_Produtos_v1_9_5.xlsx` → 200.

### Pendências / próximos passos
- **Não testável sem a API do Omie**: envio real (UpsertFamilia/UpsertProduto/
  IncluirEstrutura), fila sequencial, breaker/cache e o campo de "controle de lote"
  no payload — tudo é a Fase 2 (envio). Aqui só geramos a planilha.
- Persistência do import (`ProdutoImport`/`ProdutoItem`/`EstruturaItem`) e a "tela de
  revisão" editável com CRIAR × ATUALIZAR e destino Omie (empresa da app_key) ficam
  para o envio via API.
- Login real pela UI para exercer o fluxo ponta-a-ponta (upload → preview → baixar)
  não foi feito nesta sessão (só o smoke test HTTP acima).

## 2026-07-02 — Fase 2 (Produtos: envio automático ao Omie via API)

### Resumo
Construída a **parte 2** do módulo Produtos: envio automático ao Omie via API, com
Server Action `enviarAoOmie`, orquestração sequencial ban-safe (famílias → produtos →
estrutura) e a tela de status por item. Reusa o client Omie pronto (`src/lib/omie`,
`chamar(..., { write: true })`) sem reimplementar breaker/cache/taxonomy. Persiste o
import + itens no banco, trata duplicado como sucesso idempotente, para o lote em
bloqueio/erro e audita as contagens. `npx tsc --noEmit`, `npx eslint .` e
`npx vitest run` verdes (70 testes; +15 novos). `next dev` NÃO foi rodado.

### Arquivos criados/alterados
- `src/lib/produtos/envioOmie.ts` (novo) — **orquestração pura** (recebe `chamar` por
  parâmetro; não toca banco/sessão). Fluxo sequencial famílias→produtos→estrutura,
  dedup de famílias distintas, `UpsertFamilia`/`UpsertProduto`/`IncluirEstrutura`,
  `codigo_produto_integracao` = código SEM espaço, `int*` da estrutura idem (idempotência
  §6). Trata `OmieDuplicate` como sucesso ("já existia"), `OmieBlocked`/`OmieError`
  interrompem o lote e marcam o restante como "não enviado". TODO deixado no payload de
  produto para o campo de controle de lote.
- `src/lib/produtos/envioOmie.test.ts` (novo) — 15 testes mockando `chamar`: ordem das
  fases, família única, mapeamento família→`codigo_familia`, fixos (NCM/UN/04), código
  com/sem espaço, estrutura por código sem espaço + quantidade, `OmieDuplicate` em
  família/produto/estrutura, `OmieBlocked` e `OmieError` param o lote, recusa de não-novos.
- `src/app/(app)/produtos/enviar-actions.ts` (novo) — Server Action `enviarAoOmie`:
  guard de auth, checagem de `OMIE_APP_KEY`/`OMIE_APP_SECRET` (erro claro se faltar),
  validação zod dos `novos`/`estrutura`/`localEstoque`/`arquivoNome`, persistência de
  `ProdutoImport` (ENVIANDO) + `ProdutoItem` (NOVO) + `EstruturaItem` (PENDENTE), chamada
  ao orquestrador com o `chamar` real, reflexo do resultado no banco (status/motivo/
  `omieCodigoProduto`/`enviadoEm`), status final do import (CONCLUIDO/FALHA) e auditoria
  `produto.enviar_omie` com contagens.
- `src/components/produtos/ProdutosClient.tsx` — botão **"Enviar ao Omie"** ao lado de
  "Gerar planilha (backup)"; estado de carregando; seção de **resultado por item**
  (✓ enviado / ↺ já existia / ✗ falha+motivo / — não enviado) com cards de totais,
  tabela de produtos e de estrutura, e aviso de lote interrompido/bloqueado. Banner do
  topo atualizado (envio automático agora disponível, exige app_key). Ícones lucide (SVG).

### Decisões importantes
- **Orquestração pura e testável**: a lógica de envio não importa Prisma nem `auth` —
  recebe `chamar` como dependência (tipo `ChamarFn`). Importa só as CLASSES de erro de
  `@/lib/omie/errors` e tipos de `@/lib/omie/client` (type-only), evitando arrastar o
  Prisma para o grafo do módulo. A Server Action injeta o `chamar` real de `@/lib/omie`.
- **Ban-safety (§6/§7)**: sequencial, write-then-handle-duplicate (não consulta antes),
  confia no breaker/cache do client. Qualquer `OmieBlocked`/`OmieError` PARA o lote; o
  restante fica "não enviado" (produto volta a NOVO, estrutura a PENDENTE) para reenvio.
- **Idempotência**: `UpsertFamilia`/`UpsertProduto` atualizam no reenvio; `OmieDuplicate`
  = sucesso ("já existia" → status ENVIADO). Estrutura referencia pai/filho pelo
  `codigo_produto_integracao` (código sem espaço), sem consultar id interno.
- **Só "novos" são enviados**: a Server Action filtra e recusa qualquer item que não seja
  status "novo" (a tela já não manda duplicados); o resultado informa quantos foram
  recusados. Como usa Upsert, nada duplica no Omie.
- **Tipagem única no front**: o client deriva o tipo do resultado via
  `Awaited<ReturnType<typeof enviarAoOmie>>` (fonte única da verdade, sem duplicar tipos).
- **`.env.example`**: OMIE_APP_KEY/SECRET/BASE_URL já documentados — nada a acrescentar.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 70/70 (6 arquivos).

### Pendências / próximos passos (o que NÃO deu para testar sem app_key real)
- **Confirmar na API real do Omie** (bloqueadores para o 1º teste com credencial):
  - **Nome exato do campo de controle de lote** no `UpsertProduto` (deixado como TODO;
    o §7 pede ativar sempre). Sem isso, não enviamos o campo para evitar erro de validação.
  - Se o **NCM `9999.99.99`** é aceito no `UpsertProduto` (usuário confirmou o valor, mas
    não foi exercido contra a API).
  - **Mapeamento família→`codigo_familia`**: hoje lemos `codigo` da resposta do
    `UpsertFamilia`; confirmar o nome do campo de id retornado e o de `codigo_produto`
    no `UpsertProduto` (usados para `omieCodigoProduto`).
  - Nomes/estrutura exatos dos params de `IncluirEstrutura` (`intProduto`/`intProdMalha`/
    `quantProdMalha`) e o comportamento de `quantidade` nula (hoje default 1).
- **Não exercido em runtime**: a persistência real (Prisma/SQLite `createMany` + updates)
  e o fluxo ponta-a-ponta pela UI — só a orquestração foi testada (mock de `chamar`).
  Rodar uma vez com banco + app_key de teste para validar de verdade.

---

## 2026-07-02 — Tela de revisão editável do módulo Produtos

### Resumo
Transformei o preview READ-ONLY (tabela de produtos + estrutura pai/filho) numa TELA DE
REVISÃO EDITÁVEL para os usuários finais revisarem/corrigirem antes de gerar a planilha
ou enviar ao Omie. Só UI/estado no cliente: não mexi na lógica de envio
(`envioOmie.ts`/`enviar-actions.ts`) nem no parser — o gerar/enviar apenas passaram a
consumir os dados EDITADOS e INCLUÍDOS.

### O que dá para editar agora
- **Produtos**: incluir/excluir (checkbox), descrição (input com contador X/120 e erro
  inline se passar de `DESCRICAO_MAX`), família (select COM/SBM/PCF/PCA ou "— não
  reconhecida"). Código é read-only (identidade/SKU) com o status original
  (novo/duplicado/erro). Duplicados e erros entram DESMARCADOS por padrão.
- **Estrutura**: incluir/excluir e quantidade editável (numérico ≥ 0, null permitido);
  códigos pai/filho read-only.
- **Local de Estoque**: mantido.

### Como o gerar/enviar passou a usar os dados editados
- `produtosParaEnvio(produtoReview)` → só incluídos+válidos, convertidos a `ParsedItem`
  com status "novo" e descrição aparada. `estruturaParaEnvio(estruturaReview)` → só
  incluídas+válidas. `handleGerar` e `handleEnviar` consomem essas listas (antes usavam
  `parseResult.novos`/`estruturaRels` crus).
- Resumo no topo recalculado da edição: "X selecionados / Y com erro / Z ignorados"
  (os três somam o total). Botões só habilitam com ≥ 1 produto válido incluído.

### Arquivos alterados/criados
- `src/lib/bom/review.ts` (novo): lógica pura da revisão (tipos `ProdutoReviewItem`/
  `EstruturaReviewItem`, build inicial, validação `motivoProduto`/`motivoEstrutura`,
  `resumoProdutos`, `produtosParaEnvio`/`estruturaParaEnvio`, const `FAMILIAS`).
- `src/lib/bom/review.test.ts` (novo): 13 testes Vitest da lógica pura.
- `src/components/produtos/PreviewTable.tsx`: agora editável (checkbox, input de
  descrição com contador/erro, select de família).
- `src/components/produtos/EstruturaPreview.tsx`: agora editável (checkbox + quantidade).
- `src/components/produtos/ProdutosClient.tsx`: estado da revisão (padrão React de
  "guardar valor anterior em state" para reconstruir ao trocar de BOM/Omie, sem
  useEffect), handlers de update, resumo/contadores da edição, aviso discreto
  "Destino: Omie" + `// TODO` de empresa/CNPJ e criar×atualizar.

### Decisões importantes
- **Validação = fonte única** (`motivoProduto`/`motivoEstrutura`): mesma função decide se
  é válido e qual mensagem inline aparece. Descrição > 120 pode ser corrigida na tela
  (encurtar) e o item passa a valer; código vazio (linha fora do padrão) não dá para
  arrumar aqui — a mensagem orienta corrigir na BOM.
- **Duplicado re-marcado pelo usuário** vai como "novo" (UpsertProduto é idempotente —
  reenviar só atualiza), respeitando a escolha explícita de incluir.
- **Reset sem useEffect**: usei o padrão documentado de ajustar estado durante o render
  comparando com o valor anterior guardado em `useState` (a primeira tentativa com
  `useRef` quebrou a regra nova `react-hooks/refs` do React 19).

### TODO deixado (Omie ainda não conectado)
- Aviso "Destino: Omie — empresa/CNPJ e criar×atualizar aparecem quando a app_key for
  configurada". Não há consulta ao Omie; `// TODO` no `ProdutosClient` para exibir a
  empresa da app_key e marcar CRIAR × ATUALIZAR por item quando existir credencial.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 83/83 (7 arquivos;
  +13 novos em `review.test.ts`).
## 2026-07-02 — Editar usuários + Tutorial (Frontend/Full-stack)

### Resumo
Duas entregas: (1) edição de usuários na pagina /usuarios (modal com nome, papel,
setores, ativo/inativo e nova senha opcional) com Server Action `atualizarUsuario`
e guards reais de RBAC; (2) tutorial de boas-vindas (passo-a-passo por papel, abre
sozinho no primeiro login por usuario, botao de reabrir no header). `npx tsc
--noEmit`, `npx eslint .` e `npx vitest run` verdes (96 testes).

### Arquivos criados/alterados
- `src/lib/rbac.ts` — novos guards puros `canEditUser` (GESTOR nao edita ADMIN) e
  `wouldRemoveLastAdmin` (nao rebaixa/desativa o unico admin ativo).
- `src/lib/contracts/user.ts` — `updateUserSchema` (senha opcional min 6).
- `src/app/(app)/usuarios/actions.ts` — Server Action `atualizarUsuario`: guards
  (`canManageUsers` + `canEditUser` + `canAssignRole` + `wouldRemoveLastAdmin`),
  zod, bcrypt na senha nova, substituicao de setores, audit before/after
  (`action: "user.update"`), `revalidatePath`.
- `src/components/users/EditUserDialog.tsx` — modal client (Esc/X/backdrop, a11y).
- `src/app/(app)/usuarios/page.tsx` — coluna "Acoes" com o botao Editar (so quando
  `canEditUser`), reflete Ativo/Inativo.
- `src/lib/tutorial.ts` — passos puros + `tutorialStepsFor(role)` + `tutorialSeenKey`.
- `src/components/Tutorial.tsx` — modal do tutorial (Voltar/Proximo, dots, auto-open
  via localStorage por usuario, icones SVG lucide).
- `src/components/AppShell.tsx` — botao HelpCircle (?) ao lado de Sair + monta o
  Tutorial; `ShellUser` ganhou `id`.
- `src/app/(app)/layout.tsx` — passa `id` do usuario para o AppShell.
- `src/lib/rbac.test.ts`, `src/lib/tutorial.test.ts` — testes da logica pura nova.

### Decisoes importantes
- Fechar modal/reset de passo via "ajuste de estado no render" (padrao React 19),
  nao em `useEffect`, para satisfazer o lint `react-hooks/set-state-in-effect`.
- Persistencia do "visto" do tutorial por `user.id` no localStorage.
- Nao alterei `src/lib/auth*`, `prisma/schema.prisma`, `src/lib/omie/**`,
  `src/lib/produtos/**` (respeitando as regras da tarefa).

### Comandos
- `npx tsc --noEmit` (0), `npx eslint .` (0), `npx vitest run` (96 passed / 9 files).

### Pendencias / proximos passos
- Testes de UI/interacao (modal) nao cobertos por unit tests (so a logica pura).

## 2026-07-03 — Selects com tema, modal de editar renovado, permissões configuráveis, changelog + revisão do Postgres

### Resumo
Quatro entregas pedidas pelo dono do produto (por prioridade) e, no meio da sessão,
uma revisão de código de uma migração para PostgreSQL/Neon que o usuário fez em
paralelo. `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` verdes (111 testes).

**1) Selects com o tema do app.** Criado `src/components/ui/Select.tsx` (wrapper de
`<select>` com `appearance-none` + `ChevronDown` do lucide posicionado absoluto,
classes `bg-field`/`border-border`/`text-card-foreground`/`focus-visible:border-primary`
— mesmo padrão dos inputs). Substituídos os 3 `<select>` nativos do projeto:
`CreateUserForm.tsx`, `EditUserDialog.tsx` e `PreviewTable.tsx` (que tinha a versão
"parcialmente corrigida" — a lógica foi extraída pro componente compartilhado e
reaplicada lá, sem duplicar).

**2) Modal "Editar usuário" refeito.** `EditUserDialog.tsx`: cartão `rounded-2xl`
com header (ícone + título + e-mail) separado por `border-b`, corpo com scroll
próprio, fieldset de Setores com fundo sutil, barra de ações fixa no rodapé
(`sticky bottom-0`) com os mesmos botões primary/secondary do resto do app. Toda a
lógica/Server Action/validação ficou igual — só JSX/classes mudaram.

**3) Permissões configuráveis por papel × módulo.** Novo model Prisma
`RolePermission { role, module, enabled }` (chave composta `role+module`), migration
própria aplicada (depois consolidada na migration única do Postgres, ver abaixo).
Módulo novo `src/lib/permissions.ts`: `MODULES` ("products"|"users"|"audit"),
`DEFAULT_ROLE_PERMISSIONS` (preserva o comportamento antigo: ADMIN/GESTOR tudo,
FUNCIONARIO só produtos), `buildRolePermissionsMap` (pura, trava ADMIN=true sempre)
e `getRolePermissionsMap` (única função que toca o banco). `src/lib/rbac.ts`:
`canManageUsers`/`canViewAudit`/`canAssignRole`/`canEditUser` passaram a receber o
mapa de permissões já resolvido (continuam puras/testáveis); guards fixos (só ADMIN
concede/edita ADMIN) permanecem em código, não configuráveis. `src/lib/navigation.ts`
ganhou o item "Configurações" (ícone `settings`, visível só para ADMIN — regra fixa,
não passa pela própria tabela que edita) e "Produtos" também virou módulo
configurável. Tela nova `/configuracoes` (`page.tsx` + `PermissionsMatrixForm.tsx` +
`actions.ts` com `atualizarPermissoes`): matriz papel×módulo com checkboxes (ADMIN
sempre marcado/desabilitado), Server Action audita `permissao.atualizar` e revalida
o layout raiz. `src/lib/tutorial.ts` foi ajustado para derivar a visibilidade dos
passos a partir das chaves de navegação já resolvidas pelo servidor (em vez de
duplicar a consulta ao banco num componente cliente) — `Tutorial.tsx` agora recebe
`navKeys` em vez de `role`. Seed (`prisma/seed.ts`) ganhou upsert idempotente das 9
linhas padrão de `RolePermission` (só cria se não existir — não sobrescreve ajustes
que um admin já tenha feito na tela).

**4) Changelog em `/novidades`.** `src/lib/changelog.ts` (array estático curado a
partir deste `SESSION_LOG.md`, com comentário deixando explícito que toda entrega
nova precisa de uma entrada nova) + página `src/app/(app)/novidades/page.tsx`
(timeline simples). Link "Novidades" no rodapé do `AppShell`.

### Revisão do PostgreSQL/Neon (mudança feita pelo usuário em paralelo)
O usuário trocou o projeto de SQLite para **PostgreSQL (Neon)** por conta própria
durante a sessão (schema `provider = "postgresql"`, `src/lib/db.ts` com
`@prisma/adapter-pg`, `prisma.config.ts`, `.env`/`.env.example`, `package.json` com
`pg`/`@prisma/adapter-pg` e script `vercel-build`, migration única consolidada
`prisma/migrations/20260702204556_init`) e pediu revisão. Encontrado e corrigido:
- **Bug real**: filtro de Auditoria (`src/app/(app)/auditoria/page.tsx`) usava
  `contains` sem `mode: "insensitive"` — no SQLite o `LIKE` já era case-insensitive
  para ASCII (comentário explicava isso), mas no Postgres `LIKE`/`contains` é
  case-sensitive por padrão. Sem o fix, buscar por e-mail/ação com case diferente
  parava de encontrar resultados. Adicionado `mode: "insensitive"` nos dois filtros.
- **Comentários desatualizados** mencionando SQLite/better-sqlite3 corrigidos em
  `prisma/schema.prisma` (cabeçalho + model `RolePermission`), `src/lib/users.ts` e
  `src/app/(app)/produtos/enviar-actions.ts` (a justificativa de escrita sequencial
  citava "SQLite serializa escritas", o que não se aplica mais — reescrita sem
  prometer algo que não é mais verdade).
- **`README.md`**: seção "Backend" inteira reescrita (setup, banco de dados,
  variáveis de ambiente) — ainda descrevia SQLite/`dev.db`/`better-sqlite3`.
- **`.gitignore`**: removida duplicata de `.vercel`/`.env*` (o usuário tinha
  acrescentado no fim do arquivo, mas essas regras já existiam mais acima).
- Rodado `npx prisma generate` (client para `postgresql`) e `npx prisma migrate
  status` contra o Neon real — banco já estava migrado. Rodado `npm run db:seed`
  contra o Neon (idempotente) para garantir ADMIN/GESTOR e as permissões padrão.

### Arquivos criados
- `src/components/ui/Select.tsx`, `src/lib/permissions.ts`,
  `src/lib/permissions.test.ts`, `src/lib/changelog.ts`, `src/lib/changelog.test.ts`,
  `src/app/(app)/novidades/page.tsx`, `src/app/(app)/configuracoes/page.tsx`,
  `src/app/(app)/configuracoes/actions.ts`,
  `src/components/configuracoes/PermissionsMatrixForm.tsx`.

### Arquivos alterados (principais)
- `prisma/schema.prisma` (model `RolePermission` + comentários), `prisma/seed.ts`.
- `src/lib/rbac.ts`, `src/lib/navigation.ts`, `src/lib/tutorial.ts`.
- `src/components/users/EditUserDialog.tsx`, `src/components/users/CreateUserForm.tsx`,
  `src/components/produtos/PreviewTable.tsx`, `src/components/AppShell.tsx`,
  `src/components/Tutorial.tsx`.
- `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/usuarios/page.tsx`,
  `src/app/(app)/usuarios/actions.ts`, `src/app/(app)/auditoria/page.tsx`.
- Testes atualizados: `src/lib/rbac.test.ts`, `src/lib/navigation.test.ts`,
  `src/lib/tutorial.test.ts`.
- Revisão Postgres: `README.md`, `src/lib/users.ts`,
  `src/app/(app)/produtos/enviar-actions.ts`, `.gitignore`.

### Decisões importantes
- Permissões: mapa resolvido uma vez por request (`getRolePermissionsMap`) e passado
  como parâmetro para funções puras de `rbac.ts`/`navigation.ts`, em vez de tornar
  essas funções assíncronas espalhando `await`+Prisma por toda a UI — mantém a
  mesma testabilidade pura que já existia (só trocou o array fixo por um mapa).
- Tutorial passou a depender do `nav` já resolvido pelo servidor (chaves visíveis),
  não de uma nova consulta a permissões dentro de um componente cliente — evita
  duplicar a fonte da verdade.
- "Produtos" virou módulo configurável (antes era `alwaysVisible` fixo) para ficar
  coerente com o pedido geral de permissões por módulo; default preserva o
  comportamento atual (todos os papéis com acesso).
- Guards de segurança fixos (só ADMIN concede/edita papel ADMIN; tela de
  Configurações só aparece pra ADMIN) continuam em código, não na tabela — pedido
  explícito do usuário.
- Não commitei as correções da revisão do Postgres — ficaram no working tree pra o
  usuário revisar antes (só a entrega original dos itens 1–4 já estava num commit
  anterior feito por fora desta sessão).

### Comandos relevantes
- `npx prisma migrate dev --name role_permissions` (SQLite, migration própria —
  depois substituída pela migration única `20260702204556_init` do Postgres).
- `npx prisma generate`, `npx prisma migrate status` (Neon), `npm run db:seed` (Neon).
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 111/111 (11 arquivos).

### Pendências / próximos passos
- Restart do `next dev` pendente para o processo já rodando pegar o Prisma Client
  regenerado (schema mudou de SQLite pra Postgres depois que o server subiu) —
  não reiniciei porque a instrução é não rodar `next dev`.
- Login real pela UI com o banco Neon não foi exercido nesta sessão (só via script
  de seed + queries do Prisma); vale um teste manual ponta-a-ponta.
- Aviso de depreciação do driver `pg` sobre `sslmode=require` (vira alias de
  `verify-full` numa major futura) — não é erro, só um aviso; se quiser silenciar,
  trocar para `sslmode=require&uselibpqcompat=true` ou `sslmode=verify-full` na
  `DATABASE_URL`.
- Correções da revisão do Postgres (README, comentários, filtro de auditoria,
  .gitignore) estão descritas acima mas não commitadas — decidir se entram no
  próximo commit.
