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

## 2026-07-03 — Deploy no Vercel (Neon São Paulo) + revisão automática de PR com Gemini

### Resumo
Sessão de infra: subimos o vital-ops pro GitHub/Vercel (o usuário já tinha linkado o
projeto Vercel via CLI e configurado DATABASE_URL/AUTH_SECRET/OMIE_*/AUTH_TRUST_HOST
como env vars de produção) e portamos o sistema de **revisão automática de PR com
Gemini** do `nextstep` pro vital-ops, adaptando as partes específicas de Django pra
Next.js/Prisma.

### Deploy (Vercel + GitHub)
- Commitadas as correções pendentes da revisão do Postgres (item da sessão anterior).
- Criado o repositório `vital-ops` no GitHub (conta `DevVitalCamillo`, depois movido
  pela própria GitHub/organização para `VitalScheffer/vital-ops`, privado) e feito o
  push inicial. Remote local atualizado para a nova URL.
- `gh auth setup-git` configurado (o remote precisou trocar de SSH pra HTTPS — não
  havia chave SSH nesta máquina; HTTPS + credential helper do `gh` funcionou).
- Disparado `vercel --prod` (build usa o script `vercel-build` já existente:
  `prisma generate && prisma migrate deploy && next build`) — **em andamento** no
  momento de escrever este log.
- **Bloqueios manuais que restaram** (não dá pra automatizar por CLI):
  - `vercel git connect` falhou: a conta Vercel precisa de uma **Login Connection**
    com o GitHub adicionada no dashboard (Account Settings → Login Connections) antes
    de linkar o repo pra deploy automático em push. Sem isso, deploy fica manual
    (`vercel --prod`) até o usuário conectar.
  - `vercel domains add vitalops.vitalscheffer.com.br vital-ops` falhou porque o
    projeto ainda não tinha nenhum deploy de produção bem-sucedido — só dá pra
    associar o domínio depois que o primeiro `vercel --prod` completar.
  - **Não rodei o seed contra o banco de produção**: o classificador de segurança do
    modo automático bloqueou tanto `vercel env pull` (materializar segredos de prod
    em disco) quanto um `git add -A` genérico logo em seguida (por precaução). Isso é
    intencional — pedir confirmação explícita do usuário antes de mexer com
    credenciais de produção. Sem rodar o seed, não existe ADMIN no banco de produção
    ainda.

### Revisão automática de PR com Gemini (`.github/`)
Portado de `C:\Users\TREINAMENTO\nextstep\.github\` (workflow + `scripts/review.js` +
`scripts/lib/*.js` + `trello-members.json`). Arquitetura: pré-scan determinístico
(regex no diff) + revisão por IA (Gemini, com fallback de modelos) + comentário
"sticky" no PR + label de veredito + review formal (Approve/Request changes/Comment)
+ integração opcional com Trello (best-effort, sem SDK, só `fetch`).

**Copiados verbatim** (100% genéricos, sem nada específico do nextstep):
`lib/gemini.js`, `lib/github.js`, `lib/render.js`, `lib/trello.js`,
`lib/trello.test.js`, `trello-members.json` (mesmas pessoas/empresa, reaproveitável).

**Adaptados** (eram específicos do nextstep — Django/DRF + monorepo `frontend/`):
- `lib/scope.js` — troquei a classificação de áreas de Django (`apps/`, `config/`,
  `manage.py`, `.py`, `frontend/`) pra vital-ops (`prisma/migrations/`,
  `prisma/schema.prisma`, `src/lib/` + `**/actions.ts` + `src/app/api/` = "server",
  `src/components/` + resto de `src/app/` = "ui", `.github/`/`Dockerfile`/
  `vercel.json`/`next.config.ts`/`package.json` = "ci/infra", `docs/`/`*.md` =
  "specs"). Sem isso, a classificação de escopo classificaria TUDO como "outros" (o
  código antigo não bate com nenhum caminho deste projeto).
- `lib/security-rules.js` — mantive as regras genéricas (segredo hardcoded, AWS key,
  chave privada, `.env` versionado, `eval`/`exec`, TLS sem verificação,
  `dangerouslySetInnerHTML`, alteração em `.github/workflows/`) e troquei as
  específicas de Django (`AllowAny`, `permission_classes`, `DEBUG=True`,
  `ALLOWED_HOSTS`, `CORS_ALLOW_ALL_ORIGINS`, `csrf_exempt`, `mark_safe`, migration
  `.py`, `settings.py`) por equivalentes reais do vital-ops: `$queryRawUnsafe`/
  `$executeRawUnsafe` do Prisma (SQL cru = PERIGO), `catch` vazio em vez de
  `except: pass` (MODERADO), migration/`schema.prisma` tocados (MODERADO), e
  `src/lib/db.ts`/`auth.ts`/`auth.config.ts`/`prisma.config.ts`/`next.config.ts`
  tocados = "config central" (MODERADO).
- `review.js` — só o texto do prompt (`montarPrompt`) mudou: descrevia um "CRM" (o
  nextstep); agora descreve o Vital Ops e cita `src/lib/rbac.ts`/`permissions.ts`
  como o que conta como bypass de autorização. O resto (schema JSON, fluxo,
  fallback de modelos, Trello) é idêntico.
- `scope.test.js` e `security-rules.test.js` reescritos com exemplos do vital-ops
  (mesma cobertura/intenção dos testes originais). Rodei `node --test
  .github/scripts/lib/*.test.js` → **27/27 verdes**.

### Arquivos criados
- `.github/workflows/gemini-review.yml`, `.github/scripts/review.js`,
  `.github/scripts/lib/{gemini,github,render,scope,security-rules,trello}.js`,
  `.github/scripts/lib/{scope,security-rules,trello}.test.js`,
  `.github/trello-members.json`.

### Decisões importantes
- **Não copiei segredos entre projetos.** `GEMINI_API_KEY` (e Trello, se quiserem)
  precisam ser adicionados como secret/variável no repo `VitalScheffer/vital-ops`
  (`Settings → Secrets and variables → Actions`) — não tentei ler o do nextstep e
  reusar sem confirmação explícita. Sem `GEMINI_API_KEY`, o workflow ainda roda (cai
  só no pré-scan determinístico, não quebra).
- **Não materializei segredos de produção em disco** (bloqueado pelo classificador de
  segurança do modo automático ao tentar `vercel env pull` pra rodar o seed) — decidi
  respeitar o bloqueio em vez de contornar, e vou pedir confirmação explícita do
  usuário nesse passo específico.
- Escolhida região **São Paulo (GRU)** pro Neon de produção (não Washington D.C.) —
  a empresa é brasileira, latência menor pros usuários reais.

### Comandos relevantes
- `gh repo create vital-ops --private --source=. --remote=origin --push`,
  `gh auth setup-git`, `git remote set-url origin https://github.com/...`.
- `npx vercel git connect --yes`, `npx vercel domains add ... vital-ops`,
  `npx vercel --prod --yes` (em background).
- `node --test .github/scripts/lib/*.test.js` → 27/27.

### Pendências / próximos passos
1. Confirmar que `vercel --prod` terminou com sucesso (build + `prisma migrate
   deploy` contra o Neon São Paulo).
2. **Rodar o seed contra a produção** — preciso da confirmação/participação explícita
   do usuário (o classificador bloqueou eu materializar `DATABASE_URL` de prod
   sozinho). Sem isso não existe ADMIN pra logar.
3. No dashboard do Vercel: Account Settings → Login Connections → conectar GitHub
   (só assim `vercel git connect`/deploy automático em push funciona).
4. Depois do primeiro deploy de sucesso: `vercel domains add
   vitalops.vitalscheffer.com.br vital-ops` (repetir — falhou por falta de deploy).
   Pegar o registro DNS que o Vercel devolver e cadastrar na KingHost.
5. Adicionar `GEMINI_API_KEY` (e opcionalmente `TRELLO_KEY`/`TRELLO_TOKEN`/
   `TRELLO_LIST_*`) nos secrets/vars do repo `VitalScheffer/vital-ops` no GitHub.

## 2026-07-06 — Deploy de produção destravado (build verde) + envio ao Omie finalizado

### Resumo
Sessão de fechamento para colocar no ar. Três frentes: (1) fechei os TODOs do
envio ao Omie confirmando os campos contra a doc oficial da API; (2) diagnostiquei
e corrigi DOIS motivos pelos quais o `vercel --prod` vinha falhando; (3) adicionei o
domínio custom e levantei o registro DNS para a KingHost. Build de produção agora
**verde** (`"status":"ok"`); app no ar (atrás do muro de Deployment Protection do
Vercel, que precisa ser desligado no dashboard). `next build`, `tsc`, `eslint` e
`vitest` (111) verdes localmente.

### Envio ao Omie — TODOs fechados (confirmados na doc oficial)
- **Controle de lote agora ativa sozinho**: `UpsertProduto` passa `produto_lote: "S"`
  (campo confirmado em `app.omie.com.br/api/v1/geral/produtos/`, valores "S"/"N").
  Todo produto enviado entra no Omie com "Este produto possui controle de lote" ligado.
- **Bug real corrigido no `IncluirEstrutura`**: o payload estava achatado
  (`intProduto`/`intProdMalha`/`quantProdMalha` no mesmo nível) e falharia contra a
  API real. A doc de `geral/malha/` define pai no topo (`intProduto`) + array
  `itemMalhaIncluir` com os filhos. Reescrito para 1 filho por chamada (mantém o
  resultado granular por relação). Testes ajustados (`envioOmie.test.ts`, 15 verdes).
- **Família e código do produto**: confirmados `codigo_familia` (req) e `codigo` na
  resposta do `UpsertFamilia`; `codigo_produto` na resposta do `UpsertProduto` — já
  era o que o código lia. Nada a mudar.
- **Credencial validada**: a `OMIE_APP_KEY` configurada conecta e é da empresa certa —
  ALP COMERCIO DE PRODUTOS PARA SAUDE LTDA (Scheffer Soluções), CNPJ 43.134.552/0001-03
  (checado via `ListarEmpresas`, 1 empresa na credencial).
- Conferi o gerador de `.xlsx` contra a planilha real do usuário
  (`Omie_Produtos_2026-07-02 (1).xlsx`): colunas C/D/E/I/J/AC e a aba de estrutura
  (pai/filho/qtd) batem exatamente.

### Deploy destravado — dois bugs em sequência
1. **`DATABASE_URL` com aspas + BOM** (P1013 "scheme not recognized"): o valor no
   Vercel tinha aspas literais e, na regravação, o pipe do PowerShell 5.1 prefixou um
   **BOM U+FEFF** (`﻿postgresql://...`). Regravei via arquivo UTF-8 sem BOM +
   `cmd /c "vercel env add < arquivo"`. Documentado na memória global
   (`powershell-pipe-bom.md`).
2. **`pg` no bundle do navegador** (`Can't resolve 'util/types'`): o componente CLIENTE
   `PermissionsMatrixForm.tsx` importava `@/lib/permissions`, que importava `@/lib/db`
   (Prisma + driver `pg`). Isso arrastava o `pg` (Node puro) para o client bundle e
   quebrava o `next build` — algo que `tsc`/`eslint`/`vitest` NÃO pegam (só o build de
   produção separa client/server). **Fix**: `permissions.ts` ficou puro
   (MODULES/tipos/`buildRolePermissionsMap`) e a única função que toca o banco
   (`getRolePermissionsMap`) foi para **`src/lib/permissions.server.ts`**. Atualizados
   os 7 importadores de servidor (layout, page, auditoria, usuarios/page+actions,
   configuracoes/page+actions).
- Também corrigi o **e-mail do autor do commit** (`dev01@...` não batia com conta
  GitHub → Vercel bloqueava): troquei para o `noreply` da conta `DevVitalCamillo` e
  o usuário conectou GitHub↔Vercel no dashboard.
- `.github/scripts/**` adicionado ao ignore do ESLint (scripts Node/CJS, testados por
  `node --test`) — estavam quebrando `eslint .` com `no-require-imports`.

### Domínio / DNS (KingHost)
- `vercel domains add vitalops.vitalscheffer.com.br vital-ops` → sucesso.
- `vercel domains inspect` devolveu o registro a criar na KingHost (nameservers seguem
  na KingHost, então basta 1 registro na zona):
  **A · host `vitalops` · valor `76.76.21.21`** (recomendado pelo Vercel).
  Alternativa: CNAME `vitalops` → `cname.vercel-dns.com`.

### Arquivos alterados/criados
- `src/lib/produtos/envioOmie.ts` (produto_lote + formato itemMalhaIncluir),
  `src/lib/produtos/envioOmie.test.ts` (asserts atualizados).
- `src/lib/permissions.ts` (agora puro, sem import de db),
  `src/lib/permissions.server.ts` (**novo** — `getRolePermissionsMap`).
- `src/app/(app)/{layout,page}.tsx`, `src/app/(app)/auditoria/page.tsx`,
  `src/app/(app)/usuarios/{page,actions}.ts(x)`,
  `src/app/(app)/configuracoes/{page,actions}.ts(x)` (import trocado p/ `.server`).
- `eslint.config.mjs` (ignore de `.github/scripts/**`).
- Commits: `d3cdf00` (envio Omie), `4d606cb` (fix do build). Ambos com autor
  `DevVitalCamillo <...noreply.github.com>`.

### Comandos relevantes
- `npx next build` local (com `DATABASE_URL` do `.env`) → **compilou** (12 rotas).
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 111/111.
- `npx vercel --prod --yes` → `"status":"ok"` (deploy `vital-aj291zs13`).
- `npx vercel env rm/add DATABASE_URL production` (regravado sem BOM).

### Pendências / próximos passos (o que falta para o público usar)
1. **Desligar a Deployment Protection do Vercel** (hoje mostra "Login – Vercel" no
   lugar do app): Project Settings → Deployment Protection → Vercel Authentication →
   desligar para Production. SÓ o dono da conta faz isso no dashboard.
2. **Criar o registro DNS na KingHost**: A `vitalops` → `76.76.21.21` (ou CNAME →
   `cname.vercel-dns.com`). Propagação + emissão de SSL do Vercel: minutos a algumas
   horas.
3. **Confirmar login em produção**: o seed já rodou contra este Neon numa sessão
   anterior (ADMIN `admin@vitalscheffer.com.br` / `vital123` + GESTOR). Verificar
   logando uma vez; se não existir ADMIN, rodar `npm run db:seed` com a `DATABASE_URL`
   de produção. (Não consultei o banco de prod nesta sessão — bloqueado pelo
   classificador, e correto.)
4. **Teste ponta-a-ponta real do envio ao Omie**: subir uma BOM pequena e enviar,
   confirmando na tela do Omie que o produto entrou com lote ligado e a estrutura
   montou. É o único ponto ainda não exercido contra a API real.
5. (Opcional) `GEMINI_API_KEY` nos secrets do repo para a revisão automática de PR.

## 2026-07-06 (continuação) — App no ar + favicon Vital + auditoria de erro + UX

### Resumo
Depois do deploy verde, o usuário criou o registro DNS na KingHost e desligou a
Deployment Protection: **o app foi ao ar em `https://vitalops.vitalscheffer.com.br`**
(SSL ok, login "Entrar — Vital Ops", rotas protegidas com 307). Na sequência, várias
melhorias pedidas pelo dono do produto antes do teste real. Build de produção verde a
cada passo; `tsc`/`eslint`/`vitest` (111) verdes.

### Entregas
- **Favicon da Vital Scheffer**: removido o `favicon.ico` padrão do Next/Vercel;
  criado `src/app/icon.svg` (símbolo da marca em SVG, fundo petróleo→teal, traços
  água). No ar: o HTML já serve `<link rel="icon" href="/icon.svg…">`.
- **Auditoria de erros do envio ao Omie** (`enviar-actions.ts`): a falha inesperada
  (catch de `orquestrarEnvio`) agora é AUDITADA (`produto.enviar_omie.erro`) — antes
  retornava sem registrar e o admin não via nada na /auditoria. O resumo da auditoria
  passou a NOMEAR o que falhou (ref + motivo do Omie, 3 primeiros) e o `after` guarda
  a lista completa (`falhasDetalhadas`: família/produto/estrutura).
- **Menos jargão na tela de Produtos**: removido o texto "app_key/app_secret do Omie
  configuradas no ambiente" do banner (o usuário final não precisa ver). A página
  (server) resolve `omiePronto` e passa como prop; o aviso de indisponibilidade só
  aparece se a integração NÃO estiver pronta. Banner de "Destino: Omie" reescrito sem
  termos técnicos (sem o TODO de app_key).
- **Navegação mais rápida (percebida)**: `src/app/(app)/loading.tsx` (esqueleto
  instantâneo ao trocar de tab — mata o "travou ao clicar" e torna o prefetch do
  `<Link>` efetivo) + `src/app/(app)/template.tsx` (animação de entrada de tela,
  fade+subida 0.2s, respeitando `prefers-reduced-motion`; keyframe `page-in` no CSS).
- **Login com feedback**: botão virou client `LoginSubmitButton` com `useFormStatus`
  (spinner "Entrando…" + `disabled`) e estado pressionado (`active:scale-[0.98]`) —
  antes o clique no Server Action não dava retorno visual.

### Campos do Omie confirmados na doc oficial (fechando os TODOs do Fable)
- `produto_lote: "S"` no `UpsertProduto` = "Este produto possui controle de lote"
  ligado. **Vale só para o botão "Enviar ao Omie" (API).** O caminho "Gerar planilha"
  + importação manual NÃO ativa lote (o template .xlsx do Omie não tem coluna de lote).
- `IncluirEstrutura`: pai no topo (`intProduto`) + array `itemMalhaIncluir`
  (`intProdMalha`/`quantProdMalha`). `codigo_familia` (req) e `codigo` (resp) na
  família; `codigo_produto` na resposta do produto.

### Arquivos criados/alterados
- Criados: `src/app/icon.svg`, `src/app/(app)/loading.tsx`,
  `src/app/(app)/template.tsx`, `src/components/auth/LoginSubmitButton.tsx`.
- Removido: `src/app/favicon.ico`.
- Alterados: `src/app/(app)/produtos/enviar-actions.ts` (audita erro + detalha
  falhas), `src/components/produtos/ProdutosClient.tsx` (prop `omiePronto`, banners
  sem jargão), `src/app/(app)/produtos/page.tsx` (resolve `omiePronto`),
  `src/app/login/page.tsx` (usa o novo botão), `src/app/globals.css` (keyframe
  `page-in`), `src/lib/produtos/envioOmie.ts` + teste (produto_lote + itemMalhaIncluir),
  `eslint.config.mjs` (ignore `.github/scripts`).
- Commits: `d3cdf00`, `4d606cb`, `9c2ed1a`, `052fb65`, `8491afa` (autor
  `DevVitalCamillo`). Deploys de produção verdes.

### Pendências / próximos passos
1. **Teste real ponta-a-ponta** (o único ponto ainda não exercido): logar em
   `vitalops.vitalscheffer.com.br`, ir em Produtos, subir uma BOM pequena e clicar
   **"Enviar ao Omie"** (NÃO a importação manual do Omie), e conferir na tela do Omie
   que o produto entrou com "controle de lote" ligado e a estrutura montada.
2. Se o login não entrar, rodar `npm run db:seed` com a `DATABASE_URL` de produção
   (o seed já rodou antes neste Neon; ADMIN deve existir).
3. (Opcional) mostrar a empresa/CNPJ da app_key no banner "Destino" — evitei o fetch
   ao vivo por causa do design ban-safe; daria pra cachear se quiser.

## 2026-07-07 — NCM fixo dos produtos: 9999.99.99 -> 9403.20.90

### Resumo
- Problema (Vitor, producao): produtos cadastrados pelo vital-ops iam com NCM generico
  9999.99.99 e a SEFAZ rejeita a nota de transferencia com "NCM inexistente" (a remessa
  para a EVO tinha saido normal — o problema aparece na transferencia). O NCM correto,
  passado pelo Vitor, e 9403.20.90.
- Feito: trocado o NCM fixo em TODOS os caminhos de cadastro (API UpsertProduto e planilha
  de importacao do Omie) + testes + docs. Cadastros novos ja saem certos.
- Os produtos JA cadastrados com 9999.99.99 serao corrigidos pela aba nova "Corrigir NCM"
  do automacao-lotes (ver SESSION_LOG de la, mesma data).

### Arquivos alterados
- `src/lib/produtos/envioOmie.ts` — NCM_FIXO = "9403.20.90" (caminho da API).
- `src/lib/bom/omieFile.ts` — NCM_FIXO = "9403.20.90" (caminho da planilha).
- `src/app/(app)/produtos/enviar-actions.ts` — ncm gravado no banco (ProdutoItem).
- `src/lib/produtos/envioOmie.test.ts`, `src/lib/bom/omieFile.test.ts` — expectativas.
- `docs/REQUISITOS.md` — §7 e §8 atualizados (a confirmacao antiga "9999 em tudo" foi
  marcada como SUPERADA).

### Comandos relevantes
- `npm test` -> 116 testes passando (12 arquivos).
- Commit `630e7b2` na master + push (deploy automatico via Vercel).

### Pendencias / proximos passos
- Jhonatan deve usar 9403.20.90 nos cadastros manuais tambem (Vitor ja avisou ele).
- Conferir com o Vitor se ha outro grupo de produto (alem do carro CREHS) que precise de
  NCM diferente de 9403.20.90 — hoje o valor e fixo para tudo que o vital-ops cadastra.

## 2026-07-08 — Bug real: 1 item com descrição duplicada parava o lote inteiro

### Resumo
João testou o envio pós-fix do NCM: 5 itens cadastrados, o 6º (uma dobradiça já
cadastrada no Omie sob outro código) deu erro e o lote parou — 50 itens ficaram
"não enviados". Vitor reportou o print do erro (via Auditoria do próprio app).
Causa raiz identificada e corrigida. `npx tsc --noEmit`, `npx eslint .` e
`npx vitest run` verdes (130 testes; +8 novos).

### Causa raiz (duas partes)
1. **Bug real no client Omie**: o erro veio como `HTTP 500: {"faultstring":"ERROR:
   A descrição informada já está sendo utilizada pelo produto com código COMDB
   P0381 018AC.","faultcode":"SOAP-ENV:Client-143"}`. O `client.ts` tratava
   **qualquer** HTTP ≥500 como falha genérica de infra (`retryable: true`) SEM
   tentar parsear/classificar o corpo — mesmo a REQUISITOS.md §6 já documentando
   "HTTP 500 às vezes é validação (não transitório)". Nenhuma classificação (nem
   DUPLICATE, nem nada) rodava pra respostas 500, então esse faultstring nunca
   tinha chance de ser reconhecido.
2. **Faultstring não coberto**: mesmo se o `handle()` tentasse classificar, "a
   descrição informada já está sendo utilizada" não batia no regex de DUPLICATE
   (`ja cadastrad|ja existe`) — é um caso diferente: não é o NOSSO registro que já
   existe (idempotência), é uma descrição colidindo com um produto de OUTRO
   código (típico de peça padrão — parafuso, dobradiça — reaproveitada em várias
   BOMs/projetos, cada upload gerando a mesma descrição).

### Correção
- `src/lib/omie/client.ts` (`handle`): agora lê o corpo e tenta parsear/classificar
  o `faultstring` **independente do status HTTP** — só cai no "erro genérico de
  infra retryable" quando o corpo não tem `faultstring` reconhecível. Mantém o
  comportamento antigo pros casos sem corpo/não-JSON.
- `src/lib/omie/taxonomy.ts`: nova `Category.DESCRIPTION_CONFLICT` (regex
  `descricao informada ja esta sendo utilizada`), adicionada ao `FAULT_LIKE`.
- `src/lib/omie/errors.ts`: nova classe `OmieDescriptionConflict extends OmieError`
  (mesmo padrão de `OmieDuplicate`).
- `src/lib/produtos/envioOmie.ts`: o loop de produtos agora trata
  `OmieDescriptionConflict` como falha **do item** (mensagem já cita o código
  conflitante pro usuário corrigir) mas **NÃO chama `interromper()`** — o lote
  continua pros próximos itens. Diferente de `OmieDuplicate` (que é sucesso
  idempotente), aqui o item genuinamente não foi criado/atualizado no Omie —
  precisa de decisão humana (renomear a descrição ou reaproveitar o código já
  existente) — mas isso não é sinal de risco de bloqueio do app_key, então não
  faz sentido travar os outros 50 itens saudáveis do lote por causa de 1.
- `docs/REQUISITOS.md` §7 — documentado o caso e a decisão (resolução ainda
  manual; não automatizei vincular ao código já existente).

### Decisões importantes
- **Não tratei `DESCRIPTION_CONFLICT` como sucesso** (diferente de `OmieDuplicate`):
  o item realmente não foi gravado sob o nosso `codigo_produto_integracao`, então
  marcar como "já existia" corromperia silenciosamente os vínculos de estrutura
  (BOM) que dependem desse código. Fica como "falha" visível, com o código do
  produto conflitante na mensagem, pro usuário decidir.
- **Não toquei no "para o lote em qualquer outro erro genérico"** (`OmieError` não
  classificado continua parando o lote — ban-safety §6/§7, testado em
  `envioOmie.test.ts`). Só criei a exceção pontual pro caso específico e já
  confirmado em produção (conflito de descrição), que não é risco de bloqueio.
- **Risco conhecido não resolvido nesta sessão**: como o lote agora continua após
  uma falha de item, o passo de Estrutura pode tentar `IncluirEstrutura`
  referenciando um `codigo_produto_integracao` que nunca chegou a ser criado no
  Omie (o produto que falhou). Se o Omie responder isso como NOT_FOUND (categoria
  que hoje o client devolve como `null`, não exceção), a relação de estrutura
  seria marcada "enviado" incorretamente (bug pré-existente, não introduzido
  agora, mas que fica mais alcançável com o lote não parando mais). Não reproduzi
  esse caso real; fica como acompanhar se aparecer no próximo teste.

### Arquivos alterados/criados
- `src/lib/omie/client.ts`, `src/lib/omie/taxonomy.ts`, `src/lib/omie/errors.ts`,
  `src/lib/produtos/envioOmie.ts`, `docs/REQUISITOS.md`.
- Testes: `src/lib/omie/__tests__/taxonomy.test.ts` (+1 caso),
  `src/lib/omie/__tests__/client.test.ts` (**novo** — 1º teste de integração do
  `chamar()`/`handle()` mockando `fetch`, cobrindo o bug do HTTP 500),
  `src/lib/produtos/envioOmie.test.ts` (+1 caso: descrição duplicada não para o lote).

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 130/130 (14 arquivos).

### Pendências / próximos passos
1. **Não commitado/enviado ainda** — aguardando confirmação do Vitor antes de
   commit + push (push pra master faz deploy automático em produção via Vercel).
2. João precisa reenviar a mesma BOM pra confirmar em produção real que os outros
   itens saudáveis passam a ir mesmo com a dobradiça falhando (e que a mensagem de
   erro agora é legível, sem o JSON cru).
3. ~~Resolver a dobradiça em si: decidir se renomeia ou reaproveita~~ — **decisão do
   Vitor logo em seguida na mesma sessão, ver abaixo: sempre reaproveitar.**
4. Acompanhar o risco de Estrutura descrito acima (NOT_FOUND tratado como `null`
   em vez de exceção) caso apareça em produção — hoje é teórico, não reproduzido.

## 2026-07-08 (continuação) — Decisão do Vitor: reaproveitar automaticamente o cadastro existente

### Resumo
Vitor confirmou a política pro caso de conflito de descrição (item acima): "Melhor
sempre aproveitar o que já tem cadastrado, pois esses itens já podem estar em outro
produto que está em ordem de produção ou com saldo em estoque." Ou seja, NÃO pedir
resolução manual — resolver sozinho. Implementado: no conflito, busca o cadastro
existente no Omie e reaproveita (outcome "já existia"), incluindo a Estrutura (BOM)
passando a referenciar o código REAL do cadastro existente, não o gerado localmente
pela BOM. `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` verdes (133 testes;
+4 novos sobre a entrada anterior).

### Implementação
- `src/lib/produtos/envioOmie.ts`:
  - `extrairCodigoConflitante(mensagem)` — regex que pega o código citado na
    mensagem do Omie ("...produto com código X." → "X").
  - `resolverProdutoExistente(codigo, chamar)` — chamada **READ** (`ListarProdutos`,
    `geral/produtos/`, filtro `produtosPorCodigo: [{codigo}]` — mesmo padrão já
    usado em produção no nextstep, `apps/omie/services/products.py`) que devolve
    `codigo_produto`/`codigo_produto_integracao` do cadastro achado. Só chamada
    DEPOIS de um conflito confirmado (nunca preventivamente — mantém o
    write-then-handle-duplicate do §6).
  - No catch de `OmieDescriptionConflict`: tenta resolver; se achar, marca
    `outcome: "ja_existia"` com o `omieCodigoProduto` real e guarda o
    `codigo_produto_integracao` real num mapa (`integracaoReal`) indexado pelo
    nosso código sem espaço. Se não achar (busca vazia) ou a busca falhar por
    motivo comum, cai pra `"falha"` (não assume sucesso sem confirmar) — mas
    **sem parar o lote**. Se a própria busca vier `OmieBlocked`, aí sim para o
    lote (ban-safety genuína).
  - Passo de Estrutura: antes de montar `intProduto`/`intProdMalha`, consulta o
    `integracaoReal` primeiro; só cai pro código local se não houve reaproveitamento.
- `docs/REQUISITOS.md` §6 (nova call `ListarProdutos` documentada) e §7 (decisão
  atualizada — reaproveitamento é automático, não mais "resolução manual").

### Decisões importantes
- **Só resolve DEPOIS do conflito, nunca antes**: mantém a regra de ban-safety
  (§6) de não consultar preventivamente — o custo extra de 1 leitura só acontece
  quando o conflito já foi confirmado pelo próprio Omie.
- **Busca falhou/vazia ≠ sucesso**: se `ListarProdutos` não achar nada (ou o
  código extraído da mensagem vier de um formato inesperado), o item fica como
  falha visível — nunca finge que reaproveitou algo que não confirmou.
- **`OmieBlocked` na busca de resolução ainda para o lote**: a exceção ao "não
  para o lote" é só pra esse tipo específico de erro (conflito de descrição);
  qualquer sinal real de bloqueio do app_key continua interrompendo tudo.

### Limitação conhecida (não resolvida)
Se o cadastro existente no Omie não tiver `codigo_produto_integracao` preenchido
(ex.: cadastrado manualmente na tela do Omie, sem vir de import via API), a
Estrutura cai de volta pro código gerado localmente — que provavelmente vai falhar
(o Omie não vai reconhecer esse código de integração pra aquele produto). Não
reproduzido ainda; se acontecer, precisa de outra estratégia (ex. referenciar pelo
`codigo_produto` interno, se a API de malha aceitar — não confirmado na doc).

### Arquivos alterados
- `src/lib/produtos/envioOmie.ts`, `src/lib/produtos/envioOmie.test.ts` (+4 casos),
  `docs/REQUISITOS.md`.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 133/133 (14 arquivos).

### Pendências / próximos passos
1. **Ainda não commitado/enviado** — mesma pendência da entrada anterior, aguardando
   confirmação do Vitor pro commit + push (deploy automático).
2. Testar em produção real: João reenviar a BOM com a dobradiça e confirmar que ela
   sai como "já existia" (reaproveitada), não mais como falha.
3. Acompanhar a limitação conhecida acima (código de integração ausente no cadastro
   existente) — só resolver se aparecer de fato.

## 2026-07-08 (continuação 2) — Mesmo bug reaparece em outro item (PC021): generalizada a regra de "não parar o lote" + reaproveitamento também pra conflito de CÓDIGO

### Resumo
Depois do commit `d0f5de7` (fix específico de `DESCRIPTION_CONFLICT`) já enviado/deployado, o
Victor repassou um novo teste do João: reenviaram a planilha e o envio subiu até o item 21;
ao descobrir que o item 21 (PC021) já estava cadastrado sob outro ID, tudo que vinha depois
dele na planilha ficou sem subir (só os itens acima foram — print da tela mostrou 8
cadastrados, 2 já existiam, 1 falha, **45 não enviados**). Investigado e corrigido em duas
partes: (1) generalizada a regra de "não parar o lote" pra qualquer erro que não seja
bloqueio real; (2) confirmado o texto exato do erro (print do Victor) e estendido o
reaproveitamento automático (que já existia pra conflito de DESCRIÇÃO) pro conflito de
CÓDIGO também. `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` verdes (140 testes;
+6 novos sobre a entrada anterior).

### Causa raiz
O fix de mais cedo hoje (`d0f5de7`) só parou de interromper o lote para o `faultstring`
ESPECÍFICO já visto ("a descrição informada já está sendo utilizada..."). Qualquer OUTRO erro do
Omie que não batesse em `DUPLICATE`/`DESCRIPTION_CONFLICT` ainda caía no `else` genérico de
`orquestrarEnvio`, que chamava `interromper()` e parava o lote inteiro. O print do Victor
confirmou o texto exato pro item 21: `ERROR: O código CREHI PC021 ITSLD informado já está
sendo utilizado pelo produto com ID 12123048648.` — uma variação de CÓDIGO (não descrição),
com formato de mensagem diferente ("produto com ID <número>" em vez de "produto com código
<texto>"), que não batia em nenhum regex existente → caía em `ERROR` → parava o lote. Como o
`client.ts` já registra TODA falha no breaker (`deps.breaker.recordFault()`, inclusive pra
`ERROR` não reconhecida) e o breaker sozinho lança `OmieBlocked` quando acumula demais (soft
6/2min, hard em bloqueio explícito), o `orquestrarEnvio` parar o lote de novo em cima disso
era redundante e frágil: dependia de ir cobrindo, um regex de cada vez, toda variação de
mensagem que o Omie decidisse usar.

### Correção — parte 1 (generalização: só bloqueio real para o lote)
- `src/lib/produtos/envioOmie.ts`: o helper `interromper(erro)` agora só age se
  `erro instanceof OmieBlocked` (early return caso contrário) — os 3 pontos de chamada
  (família, produto, estrutura) não precisaram mudar, só o helper. Na prática: família,
  produto ou relação de estrutura com QUALQUER erro que não seja bloqueio real vira "falha"
  isolada daquele item, e o lote CONTINUA pros próximos.
- Testes (`envioOmie.test.ts`): reescritos os 2 testes que afirmavam "OmieError genérico
  para o lote" (produto e família) pra afirmar o novo comportamento (segue o lote); +1 teste
  novo cobrindo erro genérico na estrutura (falha só na relação, segue as demais).

### Correção — parte 2 (nova categoria CODE_CONFLICT, com reaproveitamento automático)
Com o texto real do erro confirmado, deu pra tratar esse caso com a MESMA política que o
Victor já tinha confirmado pra descrição (08/07/2026, entrada anterior): reaproveitar
automaticamente o cadastro existente, em vez de só marcar falha isolada.
- `src/lib/omie/taxonomy.ts`: nova `Category.CODE_CONFLICT` (regex `informado ja esta sendo
  utilizado pelo produto com id`, distinta da de descrição que termina em "...com código").
- `src/lib/omie/errors.ts`: nova classe `OmieCodeConflict extends OmieError`.
- `src/lib/omie/client.ts`: `handle()` lança `OmieCodeConflict` pra essa categoria (mesmo
  padrão de `OmieDescriptionConflict`, incluindo via HTTP 500).
- `src/lib/produtos/envioOmie.ts`:
  - `extrairIdConflitante(mensagem)` — regex pega o ID citado ("...produto com ID
    12123048648." → "12123048648").
  - `resolverProdutoExistentePorId(codigoProduto, chamar)` — chamada **READ**
    (`ConsultarProduto`, `geral/produtos/`, param `codigo_produto: <id>`). Confirmado na doc
    oficial do Omie (`developer.omie.com.br`) que `ConsultarProduto` aceita `codigo_produto`
    (ID interno) como chave principal pra localizar o produto — diferente do fluxo de
    descrição, que busca por `ListarProdutos`/`codigo` (SKU), aqui a mensagem já dá o ID
    interno direto.
  - Extraído `tratarConflito(...)` — helper compartilhado que faz a resolução + reaproveitamento
    (usado tanto por `OmieDescriptionConflict` quanto por `OmieCodeConflict`, só muda a função
    de extração da chave e a de busca). Evita duplicar a lógica de "achou → já existia",
    "não achou → falha sem assumir sucesso", "busca bloqueada → para o lote".
- `docs/REQUISITOS.md` §7 — documentada a generalização (parte 1) e a nova categoria
  `CODE_CONFLICT` com reaproveitamento (parte 2).

### Decisões importantes
- **Só `OmieBlocked` para o lote** — não mais "qualquer erro fora de uma lista de exceções
  conhecidas". Evita o padrão de whack-a-mole (cobrir 1 faultstring por vez) — o próximo erro
  desconhecido que aparecer já vai ser tratado como falha isolada, não vai travar dezenas de
  itens de novo.
- **Conflito de código reaproveita automaticamente, igual o de descrição** — mesma política do
  Victor ("melhor sempre aproveitar o que já tem cadastrado"), agora coberta pros dois formatos
  de mensagem que o Omie usa pra dizer "isso já existe sob outro cadastro".
- Família com erro (não-bloqueio) agora também segue o lote: o produto que dependia dela é
  enviado sem `codigo_familia`.
- Não toquei no client/breaker além de adicionar a nova categoria — a mecânica de
  ban-safety (breaker soft/hard) continua igual.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 140/140 (14 arquivos).

### Pendências / próximos passos
1. **Commitado e enviado** — commit `97e928a` na `master`, confirmado pelo Victor. Push feito
   → deploy automático em produção via Vercel disparado.
2. O lookup por `ConsultarProduto`/`codigo_produto` foi confirmado na doc oficial do Omie mas
   **não exercido contra a API real** (só testes mockados) — mesma ressalva que já valia pro
   fluxo de descrição. Vale confirmar no próximo teste real.
3. João precisa reenviar a mesma planilha (ou uma nova com esse tipo de conflito) pra
   confirmar em produção que (a) os itens depois do PC021 agora sobem mesmo com ele
   encontrando conflito, e (b) o PC021 em si sai como "já existia" (reaproveitado), não como
   falha.
4. Mesma limitação conhecida da entrada anterior (cadastro existente sem
   `codigo_produto_integracao` preenchido) também vale aqui — não reproduzida ainda.

## 2026-07-08 (continuação 3) — Freio de segurança próprio: Omie bloqueou a app_key por 30 min

### Resumo
Depois do commit `97e928a` (fixes de bloqueante geral + `CODE_CONFLICT`) já enviado, o Victor
testou de novo e reportou que a **própria Omie bloqueou a app_key por 30 minutos** — não é
bug do nosso código, é a proteção anti-abuso da própria Omie disparando de verdade. Como essa
`app_key` é **compartilhada com o nextstep** (CRM em produção), um bloqueio afeta os dois
sistemas ao mesmo tempo — então NÃO dava pra simplesmente "desligar" a proteção. Implementado
um freio de segurança PRÓPRIO no orquestrador, que pausa o envio sozinho antes de chegar perto
do limite real da Omie. `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` verdes (143
testes; +3 novos).

### Causa raiz
Antes de hoje, o lote nunca passava do item 21 — os itens depois nunca tinham sido enviados de
verdade pra Omie. Com os fixes de hoje, o envio passou a tentar TODOS os itens, e essa BOM
aparentemente tem vários itens "peça padrão" que colidem (conflito de descrição/código) em
sequência. A Omie conta TODA resposta fora de sucesso limpo — inclusive duplicado/conflito, que
pra nós é um outcome bom — pro seu PRÓPRIO contador de banimento (REQUISITOS §6 já documentava:
"resultado vazio = erro, conta pro ban"; §7 já avisava pra `IncluirEstrutura`: "evitar mandar em
massa o que já existe, senão a Omie conta como erro e pode bloquear" — um risco JÁ CONHECIDO mas
nunca implementado). O breaker do nosso client (soft 6 faults/2min) deveria pegar isso antes —
mas cada vez que resolvemos um conflito com sucesso (a leitura via `ListarProdutos`/
`ConsultarProduto` dá OK), o breaker é RESETADO (`recordOk()` zera o contador dele), então ele
nunca via a sequência de ESCRITAS ruins se acumulando — só a Omie via, do lado dela, e bloqueou.

### Correção
- `src/lib/produtos/envioOmie.ts`: novo contador `sequenciaRisco`, compartilhado entre os 3
  loops (família/produto/estrutura). Reseta a cada outcome `"enviado"` (sucesso limpo); qualquer
  outro outcome (`falha`, `ja_existia`) soma. Ao bater `LIMITE_SEQUENCIA_RISCO = 5` (bem abaixo
  do limite real de 10 da Omie), pausa o envio (`interrompido = true`, `bloqueado = false` — não
  é bloqueio real, é margem de segurança nossa) e marca o restante como "não enviado", igual já
  acontece pra bloqueio real.
- `src/components/produtos/ProdutosClient.tsx`: texto do banner pro caso "interrompido mas não
  bloqueado" (que hoje só acontece por esse freio) atualizado pra descrever a pausa de segurança
  em vez do texto antigo de "corrija o item marcado" (que não fazia mais sentido — não é 1 item,
  é uma sequência).
- `docs/REQUISITOS.md` §7 — documentado o freio e o motivo (bloqueio real em produção, risco já
  citado no doc mas nunca implementado).
- Testes (`envioOmie.test.ts`): +3 casos — pausa após N respostas seguidas sem sucesso limpo;
  um sucesso no meio reseta a sequência (não pausa); a sequência é compartilhada entre família e
  produto.

### Decisões importantes
- **Não mexi no breaker do client nem no soft/hard threshold dele** — o problema não era o
  breaker estar errado, era o orquestrador ter uma sequência de escritas ruins que o breaker (que
  reresponde a QUALQUER resposta, inclusive as leituras de resolução de conflito) não conseguia
  enxergar isoladamente. Resolvido na camada certa (orquestração), sem tocar no client genérico
  que outras integrações podem usar no futuro.
- **Threshold de 5, não 6 (igual o breaker) nem mais baixo**: dá margem confortável abaixo do
  limite real de 10 da Omie, sem reintroduzir o problema de mais cedo (1 item isolado nunca
  atinge 5 sozinho — só uma sequência de verdade pausa).
- **`ja_existia` conta pra sequência de risco**, mesmo sendo um outcome bom pra nós — porque pra
  Omie continua sendo uma resposta de erro (mesmo raciocínio do §7 sobre reenviar estrutura já
  existente em massa). Efeito colateral aceito: reenviar uma BOM inteira já 100% processada
  (tudo duplicado) vai pausar a cada 5 itens em vez de ir tudo de uma vez — o Victor está ciente
  do trade-off (evitar bloqueio real > enviar tudo de uma vez sem interrupção).

### Limitação conhecida (não implementada, ficou pra depois)
Não implementei a persistência de "esse código já resolvemos como conflito" entre envios
diferentes (reenvios da mesma BOM ainda tentam `UpsertProduto` de novo pros itens que sabemos
que vão conflitar de novo, gastando parte do orçamento de erro à toa). O freio de sequência já
reduz bastante o risco disso mesmo sem essa otimização; fica como possível melhoria futura se o
padrão de reenvio repetido continuar sendo comum.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 143/143 (14 arquivos).

### Pendências / próximos passos
1. **Aguardando confirmação do Victor antes de commit + push** (mesmo aviso de sempre — push pra
   master faz deploy automático em produção via Vercel, e essa `app_key` também é usada pelo
   nextstep).
2. Depois do deploy, esperar o bloqueio atual da Omie (se ainda ativo) expirar e o João reenviar
   a mesma BOM pra confirmar que o freio de segurança pausa antes de chegar perto de um bloqueio
   real de novo.
3. Considerar a melhoria de persistência (item acima) se reenvios repetidos da mesma BOM
   continuarem sendo o padrão de uso comum.

## 2026-07-09 — Conflito de código não era reconhecido (Omie manda "utilizada", regex esperava "utilizado")

### Resumo
Novo teste do João (print do projetos02, 08:23) voltou a bloquear a app_key por ~30 min
(1799s) e mostrou vários componentes como "Falha" com a mensagem "O código X informado já
está sendo utilizada pelo produto com ID <número>". Investigado: a mensagem real do Omie usa
o verbo no FEMININO ("utiliza**da**"), mas o regex de `CODE_CONFLICT` em `taxonomy.ts` exigia
o MASCULINO ("utiliza**do**") (o exemplo PC021 registrado ontem no log estava escrito
"utilizado", provavelmente transcrito errado do print). Sem casar, o erro caía em `ERROR`
genérico e o item virava `"falha"` (com o texto cru na tela) em vez de reaproveitar o
cadastro existente como `"já existia"`. `npx tsc --noEmit`, `npx eslint .` e `npx vitest run`
verdes (145 testes; +2 novos).

### Causa raiz
`src/lib/omie/taxonomy.ts` linha 58: `CODE_CONFLICT` = `/informado ja esta sendo utilizado
pelo produto com id/`. A Omie devolveu "...já está sendo utiliza**da** pelo produto com ID...".
Cadeia inteira confirmada: `classifyFault` não reconhece → `client.handle()` lança `OmieError`
genérico (não `OmieCodeConflict`) → `orquestrarEnvio` cai no catch genérico (linha 411) →
`outcome: "falha"` com o `faultstring` cru. A extração do ID (`ID_CONFLITANTE`, envioOmie.ts)
nunca foi o problema (independe do gênero); só a CLASSIFICAÇÃO quebrava.

### Correção
- `src/lib/omie/taxonomy.ts`: reescritos os DOIS regexes de conflito, ancorados no que de fato
  distingue os casos (o final da mensagem) e tolerando os dois gêneros do verbo:
  - `DESCRIPTION_CONFLICT` = `/ja esta sendo utilizad[oa] pelo produto com codigo/`
  - `CODE_CONFLICT` = `/ja esta sendo utilizad[oa] pelo produto com id/`
  Assim para de depender do prefixo do sujeito ("A descrição informada" vs "O código X
  informado") e da concordância de gênero (mata essa classe de whack-a-mole de vez).
- Testes (`taxonomy.test.ts`): +1 caso com a mensagem real no feminino (código → `CODE_CONFLICT`)
  e +1 caso espelho (descrição no masculino → `DESCRIPTION_CONFLICT`).

### Decisões importantes
- **Ancorar no final da mensagem, não no começo**: "pelo produto com id" vs "pelo produto com
  código" é o sinal estável que separa os dois conflitos; o gênero do verbo e o sujeito variam.
- Não mexi no `client.ts`, no orquestrador nem na extração de chave — só a classificação estava
  errada.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 145/145 (14 arquivos).

### Pendências / próximos passos
1. **Não commitado ainda.** Este fix está no working tree JUNTO com o freio de segurança da
   entrada anterior (que também nunca foi commitado). Para de fato parar o bloqueio da Omie, os
   DOIS precisam ir pra produção juntos: o regex (rotula certo + reaproveita) e o freio (pausa
   antes da Omie bloquear). Aguardando o OK do Vitor pro commit + push (deploy automático, chave
   compartilhada com o nextstep).
2. Mesmo com os dois no ar: como a maior parte dos componentes JÁ existe no Omie, o freio vai
   pausar a cada 5 conflitos seguidos — o João vai precisar reenviar o restante algumas vezes até
   fechar a BOM. É o freio funcionando (troca conveniência por não banir a chave compartilhada).
3. Melhoria real pra esse padrão (a maioria dos componentes já cadastrada): persistir os códigos
   já resolvidos como conflito e PULAR o `UpsertProduto` deles nos reenvios, em vez de tentar de
   novo e gastar orçamento de erro. É a "Limitação conhecida (persistência)" das entradas
   anteriores, agora com motivo concreto pra priorizar. Decisão do Vitor.

## 2026-07-09 (continuação) — Pré-checagem em lote: para de reenviar o que já existe (ataca a causa do bloqueio)

### Resumo
Depois do fix do regex, o Victor pediu pra automatizar o problema de fundo: a maioria dos
componentes já existe no Omie, então todo envio reescreve tudo, cada reescrita de item existente
volta conflito, e isso estoura o contador de bloqueio da Omie (o freio ajuda mas força reenviar em
levas). Investiguei a API oficial da Omie e confirmei a regra exata do bloqueio, além de métodos que
não estávamos usando. Reescrevi o orquestrador pra fazer uma PRÉ-CHECAGEM em lote (leitura) e PULAR
o Upsert do que já existe. `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` verdes (150 testes;
+5 novos). Confirmado também contra a API real (1 leitura).

### O que a doc da Omie confirmou (fontes em REQUISITOS §6)
- **Regra do bloqueio**: HTTP 425 (~30 min) dispara na 10ª requisição INCORRETA pro mesmo IP +
  app_key + MÉTODO. O que trava é chamada que dá ERRO no mesmo método, não volume. Logo, LEITURA que
  dá certo não conta, e a saída é não gerar a escrita incorreta.
- **`ListarProdutos` aceita `produtosPorCodigo` com vários códigos** (listagem em lote, recomendada
  pela própria Omie). Verificado real: 4 códigos consultados, 3 encontrados (o inexistente ausente).
- **`IncluirEstrutura` aceita `idProduto`/`idProdMalha` (ID interno)** além do código de integração.
- **Descartado**: `UpsertProdutosPorLote`/`IncluirProdutosPorLote` estão deprecated e a resposta é
  agregada (não diz item por item). `AssociarCodIntProduto` existe (associa código de integração a
  cadastro existente) mas dispensável, já que a Estrutura aceita ID interno (evita escrever em produto
  compartilhado com o nextstep).

### Verificação real (1 leitura, requisição correta)
`ListarProdutos` com os códigos do print do João retornou, entre outros: COMBC PT019 P0158 →
`codigo_produto` 12098952111 (bate com o "ID 12098952111" da mensagem de erro do print); COMRZ G3PSF
E0635 → 12111559011. Nos três, `codigo_produto_integracao` veio VAZIO — isso prova a raiz (existem sem
o nosso código de integração, por isso o Upsert conflita) e prova que a Estrutura tem que referenciar
por ID interno (por integração falharia, é a limitação conhecida do vínculo).

### Correção (`src/lib/produtos/envioOmie.ts`)
- `precarregarExistentes(codigos, chamar, interromper)`: leitura em lote (blocos de 50) via
  `ListarProdutos`+`produtosPorCodigo`, montando `codigo → { codigo_produto (ID), codigo_produto_integracao }`.
  Fail-safe: erro comum na leitura só perde a otimização (cai no Upsert normal); só `OmieBlocked`
  interrompe. Roda entre famílias e produtos, incluindo também os códigos que só aparecem na estrutura.
- Loop de produtos: se o código já existe (pré-check), PULA o `UpsertProduto` (zero chamada ao Omie),
  marca "já existia" e guarda o ID interno. Como não houve chamada, NÃO conta pro freio
  (`registrarSequencia(outcome, custoOmie=false)`).
- Loop de estrutura: referencia pai/filho por `idProduto`/`idProdMalha` (ID interno) quando conhecido
  (do pré-check OU do Upsert/reaproveitamento), caindo pro código de integração só como fallback.
- Testes: +5 casos (pula quem existe; estrutura por ID interno sem Upsert; muitos existentes não
  pausam o lote; falha na leitura não interrompe; bloqueio real na leitura para o lote). Ajustados 4
  testes que assumiam o comportamento antigo (ordem das chamadas, resolução de conflito, estrutura por
  código de integração).

### Decisões importantes
- **Atacar a causa (não reescrever o que existe), não o sintoma (freio)**: o freio continua de rede de
  segurança, mas o normal passa a ser não gerar o conflito.
- **Estrutura por ID interno, sem escrever no produto existente**: em vez de `AssociarCodIntProduto`
  (que escreveria num cadastro compartilhado com o nextstep), usa o ID interno que a API de malha
  aceita. Zero risco pro outro sistema.
- **Sem tabela nova / sem migração**: a fonte da verdade é o próprio Omie (a leitura), e o `OmieCache`
  já guarda leituras por TTL. Mais simples e menos arriscado que persistir catálogo local.
- **Reversão parcial do §6** ("não consultar antes"): com a regra real do bloqueio confirmada, a
  pré-checagem em LOTE é estritamente melhor (1 leitura correta evita dezenas de escritas incorretas).

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 150/150 (14 arquivos).

### Pendências / próximos passos
1. Confirmar em produção no próximo envio do João: os componentes que já existem devem sair como "já
   existia" SEM aparecer como conflito/falha, o lote não deve mais bloquear, e a estrutura (vínculo)
   deve fechar mesmo nos itens sem código de integração.
2. `IncluirEstrutura` por `idProduto`/`idProdMalha` foi confirmado na doc mas ainda não exercido contra
   a API real de malha (só leitura foi). Acompanhar no teste do vínculo.
3. Pedido do Victor (separado, ainda a fazer): permitir anexar CSV/XLS/XLSX/PDF no report, pra mandarem
   a planilha usada junto do erro e a gente cruzar mais fácil o que causou.

## 2026-07-09 (continuação 2) — Captura automática de falha no envio (report com a planilha + os erros)

### Resumo
Pedido do Victor: quando um envio ao Omie dá erro, capturar tudo pra cruzar o que aconteceu com o
que tinha na planilha. Descoberta: o anexo manual (CSV/XLS/XLSX/PDF) no report JÁ funcionava (o
`accept` e a `criarReport` já aceitavam esses tipos, sem filtro de mime). Então o que faltava era a
parte AUTOMÁTICA. Victor escolheu "automático em toda falha". Implementado no cliente: ao terminar um
envio com falha, o `ProdutosClient` cria sozinho um report (best-effort) com a planilha usada em anexo
e o detalhamento dos erros. `npx tsc --noEmit`, `npx eslint .` e `npx vitest run` verdes (150 testes,
sem novos, é UI).

### Implementação (`src/components/produtos/ProdutosClient.tsx`)
- `envioTeveFalha(estado)`: espelha a regra do servidor (`houveFalha`) — interrompido OU qualquer
  falha em família/produto/estrutura.
- `mensagemFalhaEnvio(estado)`: monta o texto legível (resumo dos totais, motivo da interrupção se
  houver, e a lista do que falhou com o motivo), limitado a 4000 chars.
- `handleEnviar`: depois do envio, se `envioTeveFalha`, chama `registrarFalhaComoReport` (best-effort,
  nunca atrapalha o envio já concluído).
- `registrarFalhaComoReport`: monta um `FormData` (tipo PROBLEMA, título "[Automático] Falha no envio
  ao Omie: <arquivo>", a mensagem acima, rota /produtos) e anexa o `bomFile` se couber em 4 MB; chama
  a `criarReport` já existente. Nota de transparência na tela quando o report é criado.

### Decisões importantes
- **Reusar a `criarReport` (caminho multipart já provado em produção) em vez de mandar o arquivo pela
  `enviarAoOmie`**: evita mexer na assinatura do envio e o problema de body-size-limit de Server Action;
  o report já sobe arquivos de até 4 MB por esse caminho.
- **Só dispara em falha real**: com a pré-checagem nova, reenvio de BOM já cadastrada vira tudo "já
  existia" (sem falha) e NÃO gera report — então a captura automática não vira spam nos reenviios comuns.
- **Best-effort**: erro ao criar o report é engolido (não pode quebrar a tela do envio).
- **tipo PROBLEMA autorado pelo remetente** (não ERRO_SISTEMA): assim aparece tanto pro admin quanto pra
  quem enviou, com rastreio de quem foi; o título "[Automático]" deixa claro que foi capturado sozinho.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 150/150 (14 arquivos).

### Pendências / próximos passos
1. Anexo manual de planilha/PDF no report já funcionava (nada a fazer ali).
2. Testar na prática: forçar um envio com falha e conferir que aparece um report novo em "Reportar /
   acompanhar" com a planilha anexada e a lista de erros. Não deu pra exercer aqui (precisa de uma
   falha real de envio); confirmar no uso.
3. Se o volume de reports automáticos incomodar, dá pra deduplicar por arquivo+dia ou limitar aos casos
   com falha de item (excluindo a pausa do freio). Reavaliar conforme o uso.

## 2026-07-09 (continuação 3) — Teste CREHS: Multinível OK (print desatualizado) + NCM vira campo escolhido pelo usuário

### Resumo
Teste real no projeto CREHS (empresa ALP). A pré-checagem funcionou (peças existentes saíram como
"já existe", sem reenviar). O Victor levantou dois pontos: (1) o Multinível/estrutura "não teria sido
efetuado" (print do João mostrava a submontagem SM001 sem itens); (2) o NCM saiu como 9403.20.90 e não
como o 999 neutro que eles usavam pro Fiscal corrigir depois. Investiguei por LEITURA na API real da
Omie (sem escrever — a tentativa de escrita de teste foi corretamente barrada pelo sandbox, chave de
produção compartilhada).

### Multinível: FUNCIONOU (o print estava desatualizado)
`ConsultarEstrutura` mostrou as 13 relações todas presentes, nas 6 submontagens (SM001..SM006), com as
peças e quantidades certas — inclusive a dobradiça compartilhada `COMDB P0381 018AC` ligada em SM003 e
SM004 (o caso que a estrutura-por-ID-interno resolve). O print do João era a tela do Omie sem refresh.
**Ação pro João**: F5 / reabrir a estrutura no Omie. Isso RESOLVE a ressalva anterior: `IncluirEstrutura`
por `idProduto`/`idProdMalha` está agora confirmado contra a API real (não é mais só na doc). Nenhuma
mudança de código foi necessária pra estrutura.

### NCM: agora é campo escolhido pelo usuário (decisão do Victor)
O 999 neutro não dá mais (SEFAZ rejeita 9999.99.99 na transferência, por isso estava fixo em 9403.20.90).
Victor pediu um CAMPO pra escolher o NCM por envio. Implementado:
- Novo `src/lib/produtos/ncm.ts`: `NCM_PADRAO = "9403.20.90"` + `normalizarNcm()` (aceita com/sem pontos,
  formata pra XXXX.XX.XX; sem 8 dígitos cai no padrão — nunca envia NCM malformado). Fonte única.
- `envioOmie.ts`: `EnvioInput.ncm` opcional; usa `normalizarNcm(input.ncm)` no `UpsertProduto` (era fixo).
- `omieFile.ts`: `preencherProdutos(bytes, itens, ncm?)` usa o NCM na coluna E da planilha de backup.
- `enviar-actions.ts`: aceita `ncm`, normaliza, usa no `ProdutoItem` e repassa pro orquestrador.
- `ProdutosClient.tsx`: campo "NCM dos produtos novos" (default 9403.20.90), passa pro envio e pra geração
  da planilha. Aviso na tela: vale só pros NOVOS (existentes mantêm o NCM), e evite 9999.99.99.
- Testes: `ncm.test.ts` (normalização), +2 no `envioOmie.test.ts` (NCM custom e fallback), +1 no
  `omieFile.test.ts` (coluna E com NCM custom).

### Decisões importantes
- **NCM só afeta produtos NOVOS**: os que já existem são pulados (pré-check), então mantêm o NCM atual.
  Deixado explícito no aviso da tela.
- **Nunca enviar NCM malformado**: entrada sem 8 dígitos cai no padrão em vez de mandar lixo pro Omie.
- **9999.99.99 é permitido se digitarem**, mas a tela desencoraja (a SEFAZ rejeita na transferência).
- **Não escrevi na Omie de produção pra "testar"**: o sandbox barrou e está certo — confirmação de
  escrita (estrutura) fica pro reenvio do usuário ou com autorização explícita.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 158/158 (15 arquivos).

### Pendências / próximos passos
1. João: dar refresh no Omie e confirmar que a estrutura das submontagens aparece (deve aparecer).
2. Confirmar o campo de NCM no próximo envio (digitar um NCM e ver que os produtos novos saem com ele).
3. Segue valendo confirmar a captura automática de falha (item da entrada anterior) num envio que falhe.
