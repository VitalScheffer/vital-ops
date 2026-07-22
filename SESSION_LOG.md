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

## 2026-07-13 — Módulo Pranchas (compilar desenhos num PDF único)

### Resumo
Pedido do Lucas (via referência do protótipo local `pranchas-server`): criar no vital-ops uma tela
igual à ideia do compilador de pranchas. Hoje o pessoal entra na pasta e baixa desenho por desenho; o
objetivo é subir o BOM (o PDF com a lista de peças) e a pasta dos desenhos, o sistema casa cada peça
pela versão/revisão e devolve um PDF único pronto para plotar. Diferença do protótipo: o vital-ops é
web (Vercel) e NÃO enxerga a pasta de rede pelo servidor, então o usuário sobe a pasta e TODO o
processamento roda no navegador. O usuário confirmou: tela nova, eles enviam a pasta, o arquivo
principal é um PDF com os códigos "naquele padrão" (valores mudam).

### Descoberta-chave (dados reais do BOM `C4MEC M01 R00 - MONTAGEM COMPLETA (CUSTO).pdf`)
Num mesmo BOM convivem prefixos diferentes (`C4MEC`, `C3SM`, `C3SE`, `GDPM`) no formato
`PREFIXO P## C## R##`. O regex fixo em `MDMI` do protótipo NÃO serve: o casamento é genérico por
prefixo, e a chave de família inclui o prefixo (`C4MEC P05` ≠ `C3SM P05`). Itens comprados (parafuso,
porca, atuador...) não têm o bloco `C##/R##` e por isso são naturalmente ignorados.

### Arquivos criados
- `src/lib/pranchas/codes.ts` — parsing/casamento puro (regex genérico de prefixo, chave de família,
  modos exact/latest, status ok/new/old/warn/miss). + `codes.test.ts` (13 testes, verdes).
- `src/lib/pranchas/pdf.ts` — client-only: `extrairTextoPdf` (pdfjs) e `juntarPdfs` (pd-lib, resiliente
  a PDF ilegível). Importados dinamicamente (fora do bundle das outras telas / SSR).
- `src/lib/pranchas/bom.ts` — lê o arquivo principal (PDF via pdfjs, ou .xls/.xlsx reusando o leitor do
  módulo Produtos) e extrai os códigos + a chave do próprio conjunto.
- `src/components/pranchas/FolderDropzone.tsx` — upload/arrastar a pasta (`webkitdirectory` + entries
  API recursiva pra subpastas), só PDFs.
- `src/components/pranchas/PranchasClient.tsx` — tela: 2 dropzones, opções (revisão exata/mais recente,
  capa do BOM, incluir prancha do conjunto), tabela de casamento com status, barra de ação
  (Compilar PDF / Imprimir).
- `src/app/(app)/pranchas/page.tsx` — página (mesmo molde de produtos/page.tsx).
- `public/pdf.worker.min.mjs` — worker do pdfjs (copiado de node_modules; recopiar ao atualizar pdfjs).

### Arquivos alterados
- `src/lib/navigation.ts` — novo NavItem `pranchas` (visível a quem tem o módulo Produtos) e ícone.
- `src/components/AppShell.tsx` e `src/app/(app)/page.tsx` — ícone `Layers` nos dois mapas `ICONS`.
- `src/components/produtos/FileDropzone.tsx` — props opcionais `loadingLabel` e `fileIcon` (retrocompat,
  Produtos intacto) pra reusar o dropzone com PDF.
- `package.json` — `pdf-lib` e `pdfjs-dist` adicionados.

### Decisões importantes
- **Tudo no navegador** (nada sobe pro servidor): casa com "cada um usa a pasta que quiser" e com o
  Vercel não ver a rede. Merge com pdf-lib, leitura de texto do BOM com pdfjs.
- **Casamento genérico por prefixo** com versão C + revisão R; chave de família = prefixo+tipo+num.
- **Aceita PDF (padrão) e .xls/.xlsx** no arquivo principal (reusa o leitor do Produtos).
- **Sem novo módulo de permissão**: reaproveita o gate do módulo `products` (mesmo público de
  engenharia). Nada mexido em permissions.ts / matriz.
- Worker do pdfjs servido de `/public` (com fallback pra thread principal se não carregar).

### Verificação
- `npx vitest run` (codes): 13/13. `npx tsc --noEmit`: OK. `eslint`: 0 erros. `npm run build`
  (Turbopack): OK, rota `/pranchas` no output, bundling do pdfjs/pdf-lib sem erro.
- End-to-end do núcleo (script temporário, já removido) contra o BOM real: pdfjs extraiu o texto, 50
  códigos com os 4 prefixos, 0 comprados vazaram (todos P/M/SM), casamento exact 50/50, modo "mais
  recente" pega a revisão nova, merge real de 3 pranchas = 3 páginas.

### Pendências / próximos passos
- Testar na mão no navegador com uma pasta real de desenhos C4MEC (o teste automatizado usou pasta
  simulada, pois não havia os PDFs dos desenhos à mão).
- Se um dia a impressão automática direto pra impressora for desejada, hoje é via navegador (botão
  Imprimir). Não foi implementado envio server-side (a tela é 100% client).
- Não commitado nesta sessão (aguardando validação do pessoal, conforme a mensagem do Lucas).

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

## 2026-07-09 (continuação 4) — BUG REAL da estrutura: faltava o `intMalha` (obrigatório). CORREÇÃO DO DIAGNÓSTICO ANTERIOR

### Resumo
Teste do projeto CREHI (não CREHS) deixou o erro explícito na tela:
`ERROR: O preenchimento da tag [intMalha] é obrigatório!` em cada relação de estrutura, e o freio
pausou após 5 falhas seguidas. **Correção de rumo importante**: na entrada anterior eu concluí que a
estrutura "funcionava" porque li o CREHS populado — ERRADO. A estrutura via NOSSA API nunca funcionou
(falta o `intMalha`); o CREHS populado provavelmente foi preenchido na MÃO no Omie (o `IncluirEstrutura`
pela UI não exige `intMalha`, mas pela API exige). O erro do CREHI confirma isso sem ambiguidade.

### Causa raiz
`IncluirEstrutura` (geral/malha/) exige, por item de `itemMalhaIncluir`, o campo `intMalha` (código de
integração da relação de malha, **string20**). A gente mandava só `idProdMalha`/`intProdMalha` +
`quantProdMalha`, nunca o `intMalha` → Omie recusava cada item com "tag [intMalha] é obrigatório".

### Correção (`src/lib/produtos/envioOmie.ts`)
- `intMalhaDe(codigoPai, codigoFilho)`: gera um `intMalha` determinístico (dois hashes independentes,
  FNV-1a + djb2, em base36) que cabe nos 20 chars do `string20`. É ESTÁVEL entre reenvios (mesma relação
  → mesmo `intMalha` → duplicado idempotente) e ÚNICO por par pai/filho (a mesma peça em submontagens
  diferentes, ex. a dobradiça em SM003 e SM004, recebe `intMalha` distinto, senão a 2ª seria recusada
  como duplicada e ficaria sem vínculo). "PAI-FILHO" concatenado (~31 chars) estouraria o limite de 20.
- No `IncluirEstrutura`, cada item agora leva `intMalha`.
- Requisitos por item reconfirmados na doc: obrigatórios = `intMalha` + (`idProdMalha` OU `intProdMalha`)
  + `quantProdMalha`. Os três já iam; só faltava o `intMalha`. Os demais campos são opcionais.
- Testes (+3): `intMalha` presente e ≤ 20 chars; distinto pra mesma peça em pais diferentes; determinístico.

### Decisões importantes
- **Assumir o erro anterior**: não dá pra confirmar "funciona" por leitura de uma estrutura que pode ter
  sido preenchida na mão. A prova boa é a mensagem de erro da API (essa foi explícita) e, idealmente, um
  teste de ESCRITA (barrado pelo sandbox sem autorização).
- **`intMalha` por hash, não por concatenação**: limite de 20 chars não comporta os códigos completos.
- **Estável + único**: os dois requisitos que evitam (a) duplicar no reenvio e (b) perder o vínculo da
  mesma peça em pais diferentes.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 161/161 (15 arquivos).

### Pendências / próximos passos
1. Reenviar o CREHI: agora a estrutura deve subir SEM o erro de `intMalha` (as submontagens ficam com os
   filhos pela API, sem precisar preencher na mão).
2. Confirmação ao vivo do `IncluirEstrutura` com `intMalha` (escrita) depende de autorização — o sandbox
   barra escrita na chave de produção compartilhada. Se autorizado, dá pra provar antes do reteste.

## 2026-07-09 (continuação 5) — Code review pedido + endurecimento do reenvio da estrutura

### Resumo
Victor pediu novo code review e verificação da Omie antes de retestar. Fiz: (1) cruzei o contrato do
IncluirEstrutura VERBATIM com a doc da Omie (bate caractere por caractere), (2) li o estado real do
CREHI (SM001/SM002/SM003 existem mas com estrutura VAZIA — confirma o bug do intMalha), (3) rodei um
revisor independente adversarial. Veredito: o fix do `intMalha` faz o CREHI passar no próximo envio;
não há bloqueador. O revisor apontou 1 risco de REENVIO (duplicado da malha pode não ser reconhecido)
que eu matei proativamente. `npx tsc/eslint/vitest` verdes (163 testes; +2).

### Verificação
- Contrato IncluirEstrutura (doc oficial): topo `idProduto`/`intProduto`; array `itemMalhaIncluir`; por
  item `intMalha` (string20, OBRIGATÓRIO), `idProdMalha`/`intProdMalha`, `quantProdMalha` (decimal). Bate
  exatamente com o payload do código. Basta 1 identificador do pai (mando `idProduto`).
- Estado CREHI (leitura): SM001-SM003 existem com nosso código de integração e estrutura VAZIA; SM004
  tem 2 itens e código de integração vazio (foi mexido na mão). Confirma que a estrutura via API nunca
  subiu (era o intMalha) — e reforça que "CREHS populado" da sessão anterior foi preenchido manualmente.

### Endurecimento (`src/lib/produtos/envioOmie.ts`)
- **Pré-checagem da estrutura (novo)**: `precarregarEstruturas` lê (`ConsultarEstrutura`) as relações que
  JÁ existem em cada pai conhecido e o loop PULA essas (marca "já existia", sem chamada). Torna o reenvio
  idempotente sem depender de classificar o faultstring de duplicado da malha (risco #1 do revisor). Também
  resolve o SM004 (que já tinha itens): não reinclui, não duplica.
- **Sem interromper o lote por leitura**: `ConsultarEstrutura` do mesmo id em <60s volta "consumo
  redundante", que o client lança como `OmieBlocked`. Se o pré-check interrompesse nisso, um reenvio
  rápido pararia o envio à toa. Então o pré-check da estrutura NUNCA interrompe: erro de leitura só perde a
  otimização; quem para por bloqueio REAL é o loop de escrita.
- **intMalha com separador** (`fnv-djb`): remove a ambiguidade teórica de concatenação (o "-" é aceito,
  ex. da doc "MALHA-001"; comprimento 15 ≤ 20).
- **quantProdMalha protegida**: exige número finito de verdade (NaN do parser viraria JSON null).
- Testes (+2): pula relação já existente (sem IncluirEstrutura); inclui relação nova mesmo com o pai tendo
  outras relações.

### Achados do revisor NÃO alterados (robustez menor, não bloqueiam)
- Inspeção do `codStatus`/`itemMalhaStatus` na resposta do IncluirEstrutura: NÃO adicionei, pra não
  arriscar falso-negativo (marcar sucesso real como falha por não conhecer todos os códigos de sucesso).
  O erro real (`intMalha`) veio como faultstring e foi pego; erros por-item reais também vêm assim.

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 163/163 (15 arquivos).

### Pendências / próximos passos
1. Reenviar o CREHI: estrutura deve subir sem erro; reenviar de novo NÃO deve mais dar falha/pausa (as
   relações já existentes são puladas).
2. Confirmação por ESCRITA na Omie segue dependendo de autorização (sandbox barra a chave de produção).

## 2026-07-09 (continuação 6) — Família gravada com o rótulo inteiro na descrição (não só "SUBMONTAGEM")

### Resumo
Victor apontou que a família estava sendo cadastrada errado: gravava só "SUBMONTAGEM" na descrição, e
ele quer o rótulo INTEIRO igual aparece na seleção ("SBM - SUBMONTAGEM"), pra todas as famílias. Confirmado
por código (`partesFamilia` fazia `split(" - ")` e mandava só a parte depois) e por leitura real
(`ConsultarEstrutura` do CREHI: `codFamilia: "SBM"`, `descrFamilia: "SUBMONTAGEM"`). Corrigido. `tsc`,
`eslint`, `vitest` verdes (164 testes; +1).

### Causa e correção (`src/lib/produtos/envioOmie.ts`)
- `partesFamilia("SBM - SUBMONTAGEM")` devolvia `nomeFamilia: "SUBMONTAGEM"` (só o texto depois do " - ").
  Agora devolve `nomeFamilia: "SBM - SUBMONTAGEM"` (o rótulo inteiro, igual o `Familia` do parser e igual a
  planilha de backup já fazia — os dois caminhos estavam divergentes, agora batem).
- O `codFamilia`/`codInt` continua o prefixo curto ("SBM"): é a chave estável do `UpsertFamilia`. Mudar o
  código criaria uma família NOVA em vez de atualizar a existente. Reenviar agora ATUALIZA a descrição das
  famílias já criadas (COM/SBM/PCF/PCA) pro rótulo inteiro.
- Teste ajustado (nomeFamilia agora "SBM - SUBMONTAGEM") + 1 novo cobrindo outra família (COM).

### Decisão
- **Só a descrição vira o rótulo inteiro; o código continua curto.** Evita duplicar família (mudar a chave
  criaria outra) e mantém o Upsert idempotente. Se o Victor quiser o código também com o texto inteiro, é
  outra decisão (com o custo de recriar as famílias).

### Comandos relevantes
- `npx tsc --noEmit` → 0. `npx eslint .` → 0. `npx vitest run` → 164/164 (15 arquivos).

### Pendências / próximos passos
1. No próximo envio, as famílias (novas ou reenviadas) saem com a descrição = rótulo inteiro. Confirmar
   no Omie que aparece "SBM - SUBMONTAGEM" (e equivalentes) em vez de só "SUBMONTAGEM".

## 2026-07-09 (continuação 7) — Verificação no Omie: produtos/estrutura OK em produção; famílias confirmadas pelo Victor

### Resumo
Victor pediu pra verificar como os novos ficaram no Omie. Li (só leitura). CONFIRMADO em produção:
produtos certos e a ESTRUTURA funcionando (o fix do intMalha pegou de verdade).

### Verificação (leitura real)
- Produto CREHI SM001: descrição "CREHI SM001 I0POL - ALÇA DE MOVIMENTAÇÃO", NCM `9403.20.90`, unidade
  `UN`, tipoItem `04`, `produto_lote: "S"`. Correto.
- Estrutura SM001: 2 filhos (CREHI PC015 qtd 1, CREHI PC020 qtd 2). ANTES estava vazia (0). O intMalha
  fez a malha subir pela API. Multinível OK em produção.
- Famílias (via `descricao_familia` de cada produto): SBM = "SBM - SUBMONTAGEM"; PCF = "PEÇAS FABRICADAS";
  COM = "COM - COMPONENTES COMERCIAIS". Inconsistentes entre si.

### DESCOBERTA IMPORTANTE (não refazer o fix de família achando que é bug)
As famílias JÁ EXISTEM no Omie (compartilhadas entre projetos) e o **`UpsertFamilia` NÃO reescreve a
descrição de uma família existente** — prova: a COM está "COM - COMPONENTES COMERCIAIS", texto que o nosso
código NUNCA manda (ele manda "COM - COMPONENTES"). Logo o fix da entrada anterior (nomeFamilia = rótulo
inteiro) é NO-OP pras famílias que já existem; só valeria pra família nova (que praticamente não acontece,
os 4 códigos já existem). Deixei o fix como está (inofensivo; o valor "SBM - SUBMONTAGEM" até bate com o
estado atual do SBM). NÃO revertido.

### Decisão do Victor
Mostrei a tabela do estado atual das famílias e ele respondeu "assim tá certo". Ou seja: **não mexer nas
famílias**. Os nomes ficam como estão no Omie (elas são geridas lá, não pelo nosso sync). Se algum dia
quiserem padronizar, é via `AlterarFamilia` (escrita, com autorização) ou na mão no Omie, uma vez só.

### Estado geral (fim do dia 09/07)
Fluxo BOM→Omie funcionando ponta a ponta em produção: produtos (pré-check pula os que já existem, NCM por
campo, controle de lote), estrutura/Multinível (intMalha + reenvio idempotente), captura automática de
falha no report. Famílias confirmadas OK pelo Victor.

## 2026-07-13 — Revalidação do report "CREHI MT005 i.xls"

### Resumo
Foi revisado o report automático que citava cinco falhas de `intMalha` em 09/07/2026, 14:14. A correção
que envia esse campo entrou às 14:28 do mesmo dia e permanece no código atual. Nenhuma escrita foi feita
no Omie nesta verificação.

### Verificação
- Leitura do arquivo `CREHI MT005 i.xls`: ele contém os pais e filhos indicados no report.
- Leitura direta do Omie: os 8 produtos consultados existem e as 5 relações apontadas já existem nas
  estruturas de `CREHI SM001 I0POL`, `CREHI SM002 I0POL` e `CREHI SM003 I0POL`.
- `npx vitest run src/lib/produtos/envioOmie.test.ts` passou: 40/40, incluindo os cenários de `intMalha`.

### Decisão
Não há correção pendente nem reenvio necessário: o report é histórico e o estado atual da Omie está correto.

## 2026-07-16 - Fase 3 completa: Requisicoes de fabrica + Baixa por planilha (MAT) + papel FABRICA

### Resumo
Pedido do Victor (3 frentes que na conversa se revelaram 2 modulos): (1) requisicao interna de
produtos - funcionario pede material (SKU, quem pede, quantidade, setor), gera numero sequencial,
gestor confirma/recusa e a confirmacao baixa o estoque no Omie sozinha; (2) baixa de estoque por
planilha de materia-prima (MAT) com colunas pedido/produto/NF/quantidade/OP/solicitante - o
"vinculo nota com pedido" vira a observacao do movimento no Omie; (3) papel novo FABRICA que ve SO
a tela de Requisicoes. Verificada a API do Omie (developer.omie.com.br): baixa = IncluirAjusteEstoque
(estoque/ajuste/, tipo SAI, origem AJU, motivo OPS, local padrao por omissao); saldo/CMC =
ListarPosEstoque (estoque/consulta/, portado do nextstep); validacao de codigo = ListarProdutos em
lote (ja provado em producao). `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (207 testes,
+48 novos) e `npm run build` verdes. Migration aplicada no Neon dev + seed.

### Decisoes com o usuario (AskUserQuestion)
- Modulo "NF <-> pedido" da mensagem original NAO e compra/venda: e a baixa por planilha (alguem
  precisa de material, sobe a planilha, da baixa no que tem no estoque). Pedido/NF/OP sao
  referencias que vao na observacao do ajuste.
- Baixa no local de estoque PADRAO (Venda).
- Requisicao MULTI-ITEM (carrinho) - 1 numero por pedido (REQ-0001, autoincrement do Postgres).
- Papel novo chama FABRICA (label "Fabrica").

### Arquivos criados
- `src/lib/estoque/omieEstoque.ts` (+ `.test.ts`, 12 testes) - modulo PURO estilo envioOmie:
  `buscarProdutosPorCodigo` (ListarProdutos em blocos de 50), `saldosPorCodigo` (ListarPosEstoque,
  1 chamada, local padrao, devolve saldo+CMC), `baixarEstoque` (IncluirAjusteEstoque sequencial:
  valor = CMC x qtd (campo obrigatorio), cod_int_ajuste = id do NOSSO item -> reenvio e duplicado
  idempotente (nunca baixa 2x), valida saldo/codigo LOCALMENTE antes (falha local nao gasta chamada
  nem conta pro freio), freio de sequencia de risco (5) igual envioOmie, OmieBlocked para o lote,
  erro de lote_validade vira mensagem amigavel), `dataOmieHoje` (fuso Sao Paulo).
- `src/app/(app)/requisicoes/` - `page.tsx` (guard por modulo; fila do gestor + form + meus pedidos)
  e `actions.ts` (`criarRequisicao`: valida SKUs no Omie na criacao, guarda descricao/id interno;
  `decidirRequisicao`: recusa exige motivo; confirmacao baixa item a item, persiste status por item
  + MovimentoEstoque, requisicao so vira CONFIRMADA se nao interrompeu - interrompido mantem
  PENDENTE e reconfirmar retoma so o restante).
- `src/components/requisicoes/CriarRequisicaoForm.tsx` (carrinho com linhas dinamicas, reset por
  "ajuste de estado no render") e `DecidirRequisicao.tsx` (confirmar/recusar com motivo).
- `src/lib/baixas/planilha.ts` (+ `.test.ts`, 6 testes) - modelo .xlsx gerado no navegador e parser
  tolerante (acha cabecalho, variacoes de coluna, qtd com virgula, erros por linha do Excel).
- `src/app/(app)/baixas/` - `page.tsx` (guard + baixas recentes) e `actions.ts` (`conferirBaixa`
  READ-only: codigos+saldos com consumo acumulado por SKU repetido; `executarBaixa`: persiste
  BaixaImport/BaixaItem e baixa; `continuarBaixa`: retoma import interrompido so nos PENDENTES).
- `src/components/baixas/BaixasClient.tsx` - fluxo baixar modelo -> subir -> conferencia automatica
  -> executar -> resultado por item + botao "Continuar baixa" quando interrompido.
- `src/lib/contracts/baixa.ts` - zod da baixa; `prisma/migrations/20260716121340_*`.

### Arquivos alterados (principais)
- `prisma/schema.prisma` - Requisicao reestruturada (numero Int autoincrement, solicitanteNome,
  observacao, motivoDecisao, decididaEm) + RequisicaoItem novo; BaixaImport/BaixaItem novos;
  MovimentoEstoque generalizado (sku, requisicaoItemId?/baixaItemId?). Tabelas antigas estavam
  vazias (stub da Fase 3) - sem risco de dado perdido.
- `src/lib/contracts/requisicao.ts` - multi-item (criarRequisicaoSchema com itens[1..50],
  decidirRequisicaoSchema, formatarNumeroRequisicao). `user.ts` - roleSchema + FABRICA.
- `src/lib/permissions.ts` - MODULES + "requisicoes"/"baixas"; DEFAULT_ROLE_PERMISSIONS com FABRICA
  (so requisicoes) e FUNCIONARIO com os modulos operacionais. `src/lib/rbac.ts` -
  canViewRequisicoes/canViewBaixas (configuraveis) e canDecideRequisicao (GESTOR/ADMIN, regra fixa).
- `src/lib/navigation.ts` (2 itens novos), `AppShell.tsx`/`(app)/page.tsx` (icones ClipboardList/
  PackageMinus, label/intro do papel FABRICA), `PermissionsMatrixForm.tsx` + `configuracoes/actions.ts`
  (FABRICA editavel na matriz), forms de usuario (opcao Fabrica), `usuarios/page.tsx` (label).
- `src/lib/tutorial.ts` + `Tutorial.tsx` (2 passos novos), `src/lib/changelog.ts` (entrada nova),
  `docs/REQUISITOS.md` (Secao 2 papel FABRICA, Secao 4 modelo novo, Secao 6 calls de estoque),
  `src/app/api/requisicoes/route.ts` (stub documenta que o fluxo vive em Server Actions),
  `eslint.config.mjs` (ignora public/pdf.worker.min.mjs - vendor minificado do pdfjs que ja vinha
  acusando 7 erros de lint pre-existentes), testes de navigation/permissions/tutorial atualizados.

### Comandos relevantes
- `npx prisma migrate dev --name requisicoes_multi_item_baixas` (Neon DEV us-east-1; producao
  aplica via `prisma migrate deploy` no vercel-build) + `npx prisma generate` + `npm run db:seed`.
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 207/207 (18 arquivos).
  `npm run build` -> OK (rotas /requisicoes e /baixas no output).

### Pendencias / proximos passos
1. NAO commitado/pushado ainda - push na master = deploy automatico; aguardando OK do Victor.
2. NAO exercido contra a API real do Omie (sandbox barra escrita na chave compartilhada): o
   IncluirAjusteEstoque real (campos confirmados so na doc), o valor do motivo "OPS" e o CMC do
   ListarPosEstoque (campo nCMC). Primeiro teste real: criar uma requisicao de 1 item barato,
   confirmar como gestor e conferir o movimento no Omie (Estoque -> Movimentacoes).
3. Produto com CONTROLE DE LOTE nao baixa pela API sem lote_validade - o item falha com orientacao
   de baixa manual. Se a maioria da MAT tiver lote, proxima iteracao: escolher lote (FIFO?) na tela.
4. Rodar o seed em PRODUCAO (ou salvar as permissoes na tela /configuracoes) para criar as linhas
   de RolePermission do papel FABRICA e dos modulos novos - sem isso os defaults em codigo ja
   funcionam, mas a matriz na tela e que persiste.
5. Criar os usuarios do chao de fabrica com papel FABRICA e validar o fluxo ponta a ponta na UI.

## 2026-07-16 (continuacao) - Code review da entrega + "como funciona" nas telas e no tutorial

### Resumo
Victor pediu code review e uma explicacao clara na tela e no tutorial para validar o fluxo com o
Daniel. Review (8 angulos, effort high) achou 10 pontos - 5 de correcao e 5 de limpeza - todos
corrigidos na sequencia. Depois, as telas /requisicoes e /baixas ganharam um passo a passo
"como funciona" no topo (4 cartoes numerados cada) e o tutorial foi atualizado (passo de papeis
estava desatualizado; passos de Requisicoes/Baixas agora explicam o fluxo em 4 passos). `tsc`,
`eslint`, `vitest` (207) e `npm run build` verdes.

### Achados do review e correcoes
1. excluirUsuario nao contava baixas no cheque de historico e BaixaImport e onDelete:Cascade -
   excluir usuario apagaria em silencio o historico de baixas (BaixaImport -> BaixaItem ->
   MovimentoEstoque). Corrigido: `baixas` no _count + mensagem.
2. Status do BaixaImport considerava so as falhas da RODADA: apos "Continuar baixa" sem falhas
   novas, import com falhas antigas virava CONCLUIDO. Corrigido: status derivado do estado REAL
   dos itens no banco (count PENDENTE/FALHA).
3. Falha de leitura (produtos/saldos) logo apos criar o import deixava ENVIANDO sem caminho de
   retomada na UI. Corrigido: erro com importId agora mostra botao "Tentar de novo" (continuar).
4. Botao de executar habilitado com 0 linhas ok na conferencia (criaria import 100% falha).
   Corrigido: podeExecutar exige linhasOk > 0.
5. Passo "roles" do tutorial desatualizado (nao citava Requisicoes/Baixas/Fabrica). Corrigido.
6. Fila do gestor era desc + take 100 (starvation dos antigos). Corrigido: FIFO (asc).
7. executarBaixa re-lia produtos dentro de processarBaixa (2x ListarProdutos). Corrigido:
   processarBaixa aceita produtosPrecarregados.
8. Matching fragil por 5 campos pra reconstruir a obs no executarBaixa. Corrigido: helper
   itemPersistidoDe deriva a obs dos campos persistidos (igual continuarBaixa ja fazia).
9. normalizarCabecalho/diacriticos em 3 copias (bomFile, planilha, omieEstoque). Extraido para
   `src/lib/texto.ts` (semAcento + normalizarCabecalho); os 3 agora importam de la.
10. formatarData duplicada em 2 paginas. Extraida para `src/lib/datas.ts` (formatarDataHora).

### "Como funciona" (para validar com o Daniel)
- /requisicoes: 4 cartoes no topo - 1. monte o pedido (carrinho, quem pede, setor); 2. pedido
  ganha numero REQ-#### e entra na fila; 3. gestor confirma/recusa (recusa com motivo); 4. baixa
  automatica no Omie item a item com situacao visivel. Texto do passo 3 muda se o usuario e gestor.
- /baixas: 4 cartoes - 1. baixe o modelo; 2. preencha e suba (pedido/NF/OP viram observacao no
  Omie); 3. conferencia no Omie sem baixar nada; 4. executar com retomada idempotente.
- Tutorial (?): passos de Requisicoes e Baixas reescritos em "Passo 1..4"; passo de papeis agora
  descreve FUNCIONARIO/FABRICA/GESTOR corretamente.

### Incidente de encoding (resolvido)
Um replace via PowerShell (Get-Content sem -Encoding) corrompeu o UTF-8 de requisicoes/page.tsx
(mojibake). Arquivo reescrito por completo com o conteudo correto ja incluindo fila FIFO +
formatarDataHora + secao ComoFunciona. Licao: nao usar Get-Content/Set-Content pra editar fonte
UTF-8 no Windows PowerShell 5.1.

### Comandos
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 207/207. `npm run build` -> OK.

### Pendencias
1. Commit local feito; push segue aguardando OK do Victor (deploy automatico).
2. Validacao com o Daniel: os textos "como funciona" das duas telas descrevem o fluxo pretendido?
   Ajustes de texto sao baratos.
3. Continuam as pendencias da entrada anterior (teste real de escrita no Omie, lote_validade,
   seed/permissoes em producao).

## 2026-07-16 (deploy) - Push pra master + deploy automatico no Vercel

### Resumo
Com o OK do Victor, push dos commits cb7b787 + 5721ffb pra master. Deploy automatico do Vercel
concluido (status Ready, ~2min, target production, alias vitalops.vitalscheffer.com.br). A
migration `20260716121340_requisicoes_multi_item_baixas` rodou no build (vercel-build =
prisma migrate deploy). Smoke test: /requisicoes, /baixas e / respondem 307 pro login (rotas no
ar, atras da autenticacao).

### Pendencias
1. Validar os textos "como funciona" com o Daniel e o fluxo ponta a ponta na UI de producao.
2. Primeiro teste REAL de escrita no Omie: requisicao de 1 item barato -> confirmar como gestor ->
   conferir a movimentacao no Omie (Estoque -> Movimentacoes). Atencao a produto com controle de
   lote (falha orientando baixa manual - limitacao conhecida).
3. Opcional: salvar a tela /configuracoes uma vez (ou rodar seed em prod) pra persistir as linhas
   de RolePermission do papel FABRICA e dos modulos novos (os defaults em codigo ja funcionam).
4. Criar os usuarios FABRICA do chao de fabrica.

## 2026-07-16 (continuacao 2) - Seletor de LOCAL DE ESTOQUE nas baixas e na confirmacao do gestor

### Resumo
Pedido do Victor: poder selecionar o local de estoque "para ver qual que tem". Implementado nas
duas telas: em /baixas o usuario escolhe o local ANTES de conferir - a conferencia re-consulta o
saldo naquele local na hora (trocar o local re-confere, e assim se ve qual local tem o material)
e a baixa sai do local escolhido; em /requisicoes o gestor escolhe o local no formulario de
confirmar (a validacao de saldo e a baixa usam esse local). A lista de locais vem do
ListarLocaisEstoque (estoque/local/, cache 1h) - DINAMICA por empresa/app_key, nada de codigo
fixo. `tsc`, `eslint`, `vitest` (211, +4) e `npm run build` verdes. Migration aplicada no dev.

### Detalhe tecnico importante (armadilha de ban evitada)
`ListarPosEstoque` com `cExibeTodos:"N"` + filtro de SKUs zerados num local da fault "Nao existem
registros" (= EMPTY = conta pro orcamento de banimento da Omie). A consulta de saldo passou a usar
`cExibeTodos:"S"` SEMPRE (traz os zeros sem fault) - receita ja confirmada contra a API real no
nextstep (memoria omie-estoque-listarposestoque). Isso tambem corrigiu um risco latente da versao
anterior (que usava "N" no local padrao).

### Arquivos alterados
- `src/lib/estoque/omieEstoque.ts` - `listarLocaisEstoque` (paginado, so ativos, ttl 3600),
  `nomeDoLocal` (best-effort), `LOCAL_PADRAO="0"`; `saldosPorCodigo` ganha `codigoLocal` e usa
  `cExibeTodos:"S"`; `baixarEstoque` inclui `codigo_local_estoque` no IncluirAjusteEstoque quando
  um local foi escolhido (omitido = padrao); mensagem de saldo insuficiente generalizada.
- `prisma/schema.prisma` + migration `20260716131234_local_estoque_selecionavel` -
  `localEstoqueCodigo/localEstoqueNome` (nullable) em Requisicao e BaixaImport (String: o id do
  local pode passar de 2^31). Persistidos para o "Continuar baixa" retomar no MESMO local e para
  historico ("Baixas recentes" ganhou coluna Local; cartao da requisicao mostra o local da baixa).
- `src/lib/contracts/baixa.ts`/`requisicao.ts` - `localCodigo` (regex digitos) nos payloads.
- `src/lib/estoque/estoque.server.ts` (novo) - `locaisDisponiveis()` server-only, best-effort
  (sem credencial/Omie fora -> [] e o seletor some, tudo cai no padrao).
- `src/app/(app)/baixas/actions.ts` - conferir/executar/continuar propagam o local; import
  persiste codigo+nome; retomada usa o local persistido.
- `src/app/(app)/requisicoes/actions.ts` - decidir aceita localCodigo; persiste local ANTES da
  baixa (interrupcao mantem o local pra reconfirmacao); auditoria cita o local.
- `src/components/baixas/BaixasClient.tsx` - select de local (default padrao) que RE-CONFERE ao
  trocar; coluna "Saldo no local".
- `src/components/requisicoes/DecidirRequisicao.tsx` - select "Local de estoque da baixa" no form
  do gestor (default: local da tentativa anterior ou padrao).
- Paginas requisicoes/baixas (locais via Promise.all, textos do "como funciona" e descricoes) e
  `src/lib/tutorial.ts` atualizados pra citar a escolha do local.
- Testes: +4 em omieEstoque.test.ts (cExibeTodos "S" + local especifico; codigo_local_estoque no
  ajuste quando escolhido/omitido quando padrao; listarLocaisEstoque filtra inativos; nomeDoLocal).

### Comandos
- `npx prisma migrate dev --name local_estoque_selecionavel` + `npx prisma generate` (o migrate
  nao regenerou o client sozinho - tsc acusou, generate resolveu).
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 211/211. `npm run build` -> OK.

### Pendencias
1. Commit local; push/deploy aguardando OK do Victor.
2. O teste real de escrita no Omie continua pendente - agora vale testar tambem uma baixa num
   local NAO-padrao e conferir no Omie em que local a saida caiu.

## 2026-07-16 (continuacao 3) - Setor sem opcoes na tela de Requisicoes

### Resumo
Victor reportou que o select de Setor da requisicao nao mostrava nada. Causa: NENHUM setor
cadastrado no banco (o select lista a tabela Setor, gerida em "Usuarios e setores", que estava
vazia em producao). Tres correcoes: (1) estado vazio explicito no form (aviso orientando o
gestor/admin a cadastrar setores, botao de enviar desabilitado) em vez de um select vazio;
(2) pre-selecao do setor do proprio usuario (primeiro membership UserSetor) quando existir;
(3) setores padrao no seed (Fabrica, Engenharia, Almoxarifado, Fiscal, Administrativo) -
via createMany + skipDuplicates porque o upsert de Setor disparou P2028 "Transaction already
closed" no Prisma 7 + Neon (aparentemente instabilidade de conexao; createMany e 1 query so).
Seed rodado no dev (setores criados). `tsc`, `eslint`, `vitest` (211) verdes.

### Producao
O deploy leva o aviso/pre-selecao, mas os setores em PRODUCAO precisam ser criados: ou o
admin cadastra na tela "Usuarios e setores", ou roda-se o seed contra o banco de producao
(exige autorizacao/participacao do Victor - segredos de prod).

## 2026-07-16 (continuacao 4) - Report do fabrica@: deploy do seletor de local + relatorio PDF

### Resumo
Report em producao (fabrica@, /baixas): a baixa saia sempre do Estoque Padrao, mas o saldo do
almoxarifado esta no Estoque de Materia-Prima -> itens falhavam com "saldo insuficiente". A
solucao (seletor de local) JA ESTAVA pronta local e foi deployada agora (push dos 3 commits
pendentes: seletor de local, fix de setores vazios, session log). Na sequencia, implementado o
RELATORIO EM PDF das requisicoes pedido pelo Victor: o gestor escolhe o periodo e baixa o resumo
(solicitado/aprovado/recusado, com itens e situacao). `tsc`, `eslint`, `vitest` (215, +4) e
`npm run build` verdes.

### Relatorio PDF (novo)
- `src/lib/requisicoes/relatorio.ts` (+ .test.ts, 4 testes) - parte PURA: monta as linhas
  (cabecalho com periodo/totais por status; um bloco por requisicao com numero REQ-####, status,
  solicitante/setor/data, decisao com gestor/local/motivo e itens com situacao/erro).
- `src/lib/requisicoes/relatorioPdf.ts` - client-only (pdf-lib ja era dependencia, mesmo esquema
  do Pranchas): desenha as linhas em A4 com quebra de linha por largura e paginacao; textos
  sanitizados pra WinAnsi (acentos pt-BR ok, caractere exotico vira "?").
- `src/app/(app)/requisicoes/actions.ts` - `relatorioRequisicoes({de, ate})` (guard gestor/admin,
  periodo em dia inteiro no fuso de Sao Paulo, ate 1000 registros, dados serializados).
- `src/components/requisicoes/RelatorioRequisicoes.tsx` - painel "Relatorio (PDF)" na tela (so
  gestor): De/Ate (default: mes atual) + botao que gera e baixa o PDF no navegador.

### Orientacoes passadas ao Victor (configuracao, nao codigo)
1. fabrica@ aprovar: editar o usuario em "Usuarios e setores" -> papel GESTOR (so gestor/admin
   decide; regra fixa). Obs.: GESTOR ve os demais modulos conforme a matriz de Configuracoes.
2. Pessoal do chao de fabrica: criar os usuarios com papel FABRICA (ve so Requisicoes).
3. Setores em producao continuam vazios ate cadastrarem na tela (ou seed em prod autorizado).

### Comandos
- `git push` (deploy dos commits bd389af/514bd93/ae5b84e) e depois do relatorio PDF.
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 215/215. `npm run build` -> OK.

## 2026-07-16 (continuacao 5) - Papel GESTOR DA FABRICA (Daniel aprova vendo so Requisicoes) + alinhamento em /baixas

### Resumo
Victor reportou que o Daniel (fabrica@, papel Fabrica) nao via os pedidos do pessoal nem o PDF -
comportamento correto do papel FABRICA (so solicita). Como Gestor comum daria ao Daniel acesso a
tudo (users/audit/etc), criado o papel FABRICA_GESTOR ("Gestor da Fabrica"): ve SO Requisicoes
(igual FABRICA) mas entra na regra fixa de decisao (canDecideRequisicao = ADMIN | GESTOR |
FABRICA_GESTOR) - ve a fila "Aguardando decisao", confirma/recusa com local de estoque e baixa o
relatorio PDF. Tambem corrigido o desalinhamento do seletor de local em /baixas (texto de ajuda
movido pra baixo da linha de campos - commit 22630f5, ja deployado antes desta entrega).

### Arquivos (papel novo - mesma lista do FABRICA)
- contracts/user.ts (roleSchema), permissions.ts (ROLES + defaults: so requisicoes),
  rbac.ts (DECIDING_ROLES), seed.ts (6 linhas novas), AppShell/usuarios/page (labels),
  (app)/page.tsx (ROLE_INTRO), CreateUserForm/EditUserDialog (opcao "Gestor da Fabrica
  (aprova Requisicoes)"), PermissionsMatrixForm + configuracoes/actions (EDITABLE_ROLES),
  tutorial.ts (passo de papeis). Testes: navigation.test (nav do FABRICA_GESTOR + decisao).
- Sem migration (role e String no banco).

### Como aplicar (producao)
Usuarios e setores -> Editar fabrica@ -> Papel "Gestor da Fabrica (aprova Requisicoes)". O
pessoal do chao continua com papel "Fabrica (so Requisicoes)".

### Comandos
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 216/216.

## 2026-07-16 (continuacao 6) - Local POR ITEM (opcional) na confirmacao da requisicao

### Resumo
Victor aprovou a evolucao com a condicao de que o padrao continue sendo UM local pro pedido
inteiro. Implementado: no form de decisao, o gestor (GESTOR/ADMIN/FABRICA_GESTOR) escolhe o local
do pedido como antes e, opcionalmente, marca "Escolher o local por item" (aparece so em pedido com
2+ itens pendentes) - cada item ganha um select com "Usar o local do pedido" (default) ou um local
especifico. `tsc`, `eslint`, `vitest` (219, +3) e build verdes. Migration aplicada no dev.

### Implementacao
- `src/lib/requisicoes/locaisPorItem.ts` (+ .test.ts, 3 testes) - logica pura: `localEfetivo`
  (valida o codigo do item, cai no local do pedido) e `agruparPorLocal` (preserva ordem).
- `src/app/(app)/requisicoes/actions.ts` - decidir: le `localItem__<id>` do FormData por item
  pendente; agrupa por local efetivo; UMA leitura de saldo POR LOCAL distinto (sequencial,
  cExibeTodos "S"); baixa POR GRUPO sequencial (grupo interrompido -> grupos seguintes nem
  comecam, itens ficam pendentes pra reconfirmar; idempotencia por cod_int_ajuste mantida);
  item BAIXADO grava localEstoqueCodigo/Nome proprios.
- `prisma/schema.prisma` + migration `20260716165954_local_por_item` - localEstoqueCodigo/Nome
  (nullable) em RequisicaoItem.
- `src/components/requisicoes/DecidirRequisicao.tsx` - checkbox opcional + select por item.
- `src/app/(app)/requisicoes/page.tsx` - passa itens pendentes pro form; item baixado mostra
  "local: X" na coluna Situacao.

### Observacao de comportamento
O freio de sequencia de risco zera entre grupos (cada grupo e uma chamada ao orquestrador);
`OmieBlocked` continua parando tudo. Aceitavel: o limite da Omie e por metodo e o bloqueio real
interrompe os grupos seguintes.

### Comandos
- `npx prisma migrate dev --name local_por_item` + generate.
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 219/219. `npm run build` -> OK.

## 2026-07-16 (continuacao 7) - Daniel (fabrica@) aprovar as proprias requisicoes: e config, nao codigo

### Resumo
Victor perguntou se dava pra deixar o Daniel (fabrica@) aprovar as proprias solicitacoes em
Requisicoes. Investigado: o codigo JA permite auto-aprovacao - `decidirRequisicao` so exige papel
decisor (`canDecideRequisicao` = ADMIN | GESTOR | FABRICA_GESTOR) e a fila "Aguardando decisao"
lista TODOS os pendentes, sem excluir os do proprio gestor. Nenhuma alteracao de codigo feita.

### Diagnostico
- O papel FABRICA_GESTOR (criado hoje, commit ea3cf66) ja esta em producao (push na master =
  deploy automatico; origin/master inclui ea3cf66 e f3a8750).
- O que falta e CONFIG em producao: fabrica@ ainda esta com papel FABRICA (so solicita).
- Atencao: o papel vive no token JWT de login (`jwt` callback em `src/lib/auth.ts` so sincroniza
  no sign-in). Depois de trocar o papel, o Daniel PRECISA sair e entrar de novo pra valer.

### Como aplicar (producao - Victor, via UI)
1. Usuarios e setores -> Editar fabrica@ -> Papel "Gestor da Fabrica (aprova Requisicoes)".
2. Daniel faz logout e login de novo.
3. Ele passa a ver "Aguardando decisao" com todos os pendentes (inclusive os dele) e decide.

### Follow-up (mesma sessao): Victor trocou o papel e "nao foi"
Victor aplicou o passo 1 (lista mostra fabrica@ = Gestor da Fabrica, Ativo) e o Daniel seguia
sem conseguir aprovar. Verificado por eliminacao:
- Deploy de producao OK: `vercel inspect` no deploy mais recente -> Ready, target production,
  criado hoje 14:04 (depois do commit ea3cf66 das 13:53), alias vitalops.vitalscheffer.com.br.
- Permissoes OK: `buildRolePermissionsMap` cai no default (requisicoes: true pro FABRICA_GESTOR)
  mesmo sem linha no banco; ADMIN nao consegue desligar isso sem salvar a matriz explicitamente.
- Causa restante: sessao JWT do Daniel ainda carrega o papel antigo (FABRICA). O `jwt` callback
  em auth.ts so re-sincroniza o papel NO LOGIN (`if (user?.email)`), e o NextAuth mantem o token
  por padrao ~30 dias. F5 nao resolve.
Solucao passada ao Victor: Daniel clica em "Sair" (topo da tela) e entra de novo.
Melhoria possivel (nao implementada, aguardando interesse): re-sincronizar o papel do banco a
cada request no callback `jwt`, pra troca de papel valer sem relogin.

### Pendencias / proximos passos
- Nenhuma no codigo. Se quiserem no futuro BLOQUEAR auto-aprovacao (segregacao de funcoes),
  ai sim seria codigo novo - hoje a auditoria registra quem confirmou cada pedido.

### Follow-up 2: Daniel relogou e AINDA nao aprovava -> papel relido do banco a cada request
Victor confirmou que o Daniel fez logout/login e continuou sem o painel de decisao. Sem acesso
a producao pra inspecionar a sessao dele (extensao do Chrome desconectada), implementada a
solucao definitiva que elimina a dependencia de relogin:
- `src/lib/auth.ts` (callback `jwt`): fora do login, o papel (e o uid) passam a ser RELIDOS do
  banco a cada request (`findUnique` por email, indice unico, custo desprezivel). Troca de papel
  em "Usuarios e setores" vale na request seguinte pra qualquer sessao aberta, nova ou velha.
  No login continua o `syncUser` (find-or-create) como antes.
- O proxy (src/proxy.ts) usa so o authConfig edge-safe (sem esse callback), entao nada de
  Prisma no edge.
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 219/219.
- Commit local; push (= deploy automatico em producao) aguardando OK do Victor.

### Checagens paralelas passadas ao Victor (se apos o deploy ainda falhar)
1. Configuracoes -> matriz de permissoes: linha "Gestor da Fabrica" precisa ter "Requisicoes"
   marcada (se alguem desmarcou e salvou, o Daniel perde o modulo inteiro, inclusive criar).
2. Auditoria: conferir o "fabrica@... entrou na plataforma" mais recente (se o horario for
   ANTERIOR a troca de papel, o relogin nao aconteceu de fato naquele dispositivo).

## 2026-07-17 — Baixa por lote (FEFO), baixa sem custo medio, busca de produto e arquivar requisicoes

### Resumo
Quatro pedidos do Victor/Daniel a partir das falhas na "Baixa de estoque":
1. **Baixa por lote**: a baixa falhava para produto com controle de lote (o Omie exige
   informar o lote na saida). Agora o sistema consulta os lotes do produto, escolhe de
   qual sair por FEFO (vence antes, sai antes) e manda `lote_validade` no ajuste.
2. **Sem custo medio**: quando o produto nao tinha custo medio (CMC 0), o ajuste mandava
   `valor: 0` e o Omie recusava. Agora, sem CMC, o campo `valor` e OMITIDO (na saida o
   Omie calcula pelo CMC; sem custo, baixa a 0, so consome o estoque).
3. **Busca de produto na Requisicao**: o campo de codigo virou autocomplete (busca por
   parte da descricao, ex. "cama", ou pelo codigo), clicar preenche o SKU.
4. **Arquivar requisicoes**: o gestor arquiva pedidos ja decididos para tirar das listas
   (nada e apagado; filtro "Ver arquivadas" e relatorio continuam completos).
`npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (231) e `npx next build` verdes.

### Como a API do Omie foi confirmada (doc oficial, 17/07/2026)
- `IncluirAjusteEstoque` (estoque/ajuste/): saida de produto com lote exige o array
  `lote_validade: [{ nIdLote, nQtdLote }]` (pode dividir entre lotes). Na saida, o `valor`
  e preenchido automaticamente pelo CMC do produto, entao da para omitir.
- `ConsultarLote` (produtos/produtoslote/): request `{ nCodProd, nIdLocal? }`; resposta
  `{ ident, lotes: [{ nIdLote, cNumLote, dDataValidade, nSaldoLote, nQuantDisponivel, ... }] }`.
  Uso `nSaldoLote` como saldo do lote (consistente com o `nSaldo` do ListarPosEstoque).
- `ListarProdutos` (geral/produtos/): a resposta traz `produto_lote` (S/N) por produto, e o
  filtro de texto e `filtrar_apenas_descricao` com curinga (`%TEXTO%` = contem). Nao existe
  filtro por codigo parcial (so `produtosPorCodigo` exato).

### Arquivos alterados/criados
- `src/lib/estoque/omieEstoque.ts`:
  - `ProdutoEstoque` ganhou `controleLote?` (lido de `produto_lote` no `buscarProdutosPorCodigo`).
  - `consultarLotes` / `lotesPorCodigo` (le lotes com saldo > 0 de produtos com controle de
    lote, um por produto, sequencial e cacheado).
  - `alocarLotesFEFO` (puro e testado): distribui a quantidade entre lotes por validade,
    descontando o que outro item do mesmo lote ja pegou na rodada; `faltou > 0` = sem saldo.
  - `buscarProdutosPorDescricao` (autocomplete): `ListarProdutos` com `filtrar_apenas_descricao`,
    ignora inativo/bloqueado, devolve `{codigo, descricao}`.
  - `baixarEstoque`: monta `lote_validade` FEFO para produto com lote (falha LOCAL sem gastar
    chamada se nao ha lote com saldo); OMITE `valor` quando CMC <= 0; `ContextoBaixa.lotes`.
- `src/app/(app)/baixas/actions.ts`: pre-carrega os lotes (`lotesPorCodigo`) e passa no contexto.
- `src/app/(app)/requisicoes/actions.ts`: resolve produtos via `buscarProdutosPorCodigo` (pra ter
  `controleLote`), pre-carrega saldos+lotes POR LOCAL, passa `lotes` na baixa. Novas actions
  `buscarProdutosOmie` (busca) e `arquivarRequisicao` (arquivar/desarquivar, gestor, auditado).
- `src/components/requisicoes/ProdutoSkuField.tsx` (novo): autocomplete client (debounce 350ms,
  teclado, sem useEffect, fecha no blur do container).
- `src/components/requisicoes/CriarRequisicaoForm.tsx`: usa o `ProdutoSkuField` no lugar do input
  de SKU; guarda a descricao escolhida por linha (some quando digita o codigo a mao).
- `src/components/requisicoes/ArquivarRequisicao.tsx` (novo): botao arquivar/desarquivar (transicao).
- `src/app/(app)/requisicoes/page.tsx`: listas escondem arquivadas por padrao; painel "Arquivadas"
  + filtro `?arquivadas=1` (gestor); botao arquivar nos decididos.
- `prisma/schema.prisma`: `Requisicao.arquivada` (Boolean default false) + `arquivadaEm`.
- `prisma/migrations/20260717120000_requisicao_arquivada/migration.sql` (novo): ALTER TABLE aditivo.
- `src/lib/estoque/omieEstoque.test.ts`: +10 testes (controleLote, consultarLotes, lotesPorCodigo,
  alocarLotesFEFO, baixa com lote_validade FEFO, dois itens do mesmo lote, sem lote, CMC 0).
- `src/lib/changelog.ts`: entrada 2026-07-17 (pt-BR, para quem usa o app).

### Decisoes importantes
- **FEFO por saldo do lote**: consumo ordenado por `dDataValidade` asc (sem validade por ultimo),
  empate pelo lote mais antigo (id menor). Uso `nSaldoLote` (fisico) pra bater com o `nSaldo` do
  ListarPosEstoque; se um dia houver reserva atrapalhando, trocar por `nQuantDisponivel`.
- **CMC 0 omite valor** (nao envia `valor: 0`): mudanca CIRURGICA, o caminho com CMC > 0 continua
  identico (nao mexi no que ja funcionava, "o resto ta ok").
- **Requisicao re-resolve os produtos** no confirmar (em vez de reusar so o id salvo na criacao)
  porque precisa do `produto_lote`; leitura em lote cacheada, custo baixo.
- **Arquivar = soft (nunca apaga)**: coerente com "audita tudo / nunca apagar". So decididas
  arquivam; idempotente; auditado (`requisicao.arquivar`/`desarquivar`).
- **Busca**: 1 leitura por termo (debounce + minimo 2 chars + cache do client), so descricao
  (o Omie nao tem busca por codigo parcial). O input aceita SKU digitado a mao como antes.

### Comandos relevantes
- `npx prisma generate` (client com os campos novos, sem tocar no banco).
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 231/231. `npx next build` -> OK.

### Pendencias / proximos passos
- **APLICAR A MIGRATION**: `20260717120000_requisicao_arquivada` foi CRIADA mas NAO aplicada no
  banco (nao rodei migrate contra o Neon). No proximo deploy o `vercel-build` roda
  `prisma migrate deploy` e aplica sozinho; para rodar local antes, `npx prisma migrate deploy`.
  ATENCAO: sem aplicar, a tela de Requisicoes quebra (o client Prisma ja espera a coluna
  `arquivada`). E aditiva e nao destrutiva.
- **Testar de verdade com o Omie** (nao exercido com credencial real nesta sessao): a baixa por
  lote (nomes `nIdLote`/`nQtdLote`/`lote_validade` confirmados na doc, nao contra a API viva) e a
  omissao do `valor` na saida sem CMC. Rodar uma baixa real de um item com lote e de um sem custo.
- A conferencia (tela da Baixa) checa so o saldo TOTAL, nao por lote; a alocacao FEFO acontece na
  execucao. Se um produto tiver saldo total mas os lotes nao cobrirem (ex. reserva), a conferencia
  diz "ok" e a execucao mostra a falha do item. Aceitavel; evita chamadas extras na conferencia.

## 2026-07-17 (cont.) — Finalidade do consumo na baixa + botao de tema claro/escuro

### Resumo
Duas demandas: (1) sugestao da fabrica (fabrica@) em /baixas: um campo livre de finalidade/motivo
na planilha que caia automaticamente na observacao do movimento no Omie; (2) o admin perguntou onde
esta o botao de trocar tema claro/escuro (nao existia; o app so seguia o prefers-color-scheme).
`npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (233) e `npx next build` verdes.
NAO deployado ainda (aguardando OK, no padrao "code review antes do push" da sessao anterior).

### 1) Campo "Observacao (finalidade / motivo)" na baixa por planilha
Obs.: a OP JA caia na observacao do Omie hoje (a planilha tem coluna OP e o obsDoItem ja montava
"...OP <x>"). O que faltava era um campo LIVRE de finalidade (o "CONSUMO FABRICA" do exemplo).
- `src/lib/contracts/baixa.ts`: `observacao` (opcional, max 300) no baixaLinhaSchema.
- `src/lib/baixas/planilha.ts`: coluna "Observacao (finalidade / motivo)" no modelo/exemplo;
  acharColunas reconhece observacao/finalidade/motivo/obs; le a celula.
- `prisma/schema.prisma` + migration `20260717150000_baixa_item_observacao`: BaixaItem.observacao
  (persistido pra o "Continuar baixa" reconstruir a MESMA observacao do Omie).
- `src/app/(app)/baixas/actions.ts`: obsDoItem poe a observacao NA FRENTE (o motivo que o pessoal
  quer ver), seguido do rastro (arquivo/solicitante/pedido/NF/OP); persiste no create; BaixaItemDb
  e itemPersistidoDe levam observacao.
- `src/components/baixas/BaixasClient.tsx`: dica atualizada. Teste novo no parser.
- Decisao: obrigatorio na planilha continua SKU + Quantidade (quantidade e essencial pra baixa);
  todo o resto (pedido/NF/OP/solicitante/observacao) opcional. A observacao livre lidera a obs.

### 2) Botao de tema claro/escuro (topo)
- `src/app/globals.css`: paleta escura agora aplica em `:root:not([data-theme="light"])` sob o
  media query (sistema escuro, a menos que o usuario force claro) E em `:root[data-theme="dark"]`
  (forcado). `data-theme="light"` so seta color-scheme (a paleta clara do :root ja vale). Sem
  data-theme = segue o sistema (comportamento antigo preservado). O `@theme inline` faz as
  utilities lerem as vars em runtime, entao trocar `--background` etc. re-tematiza tudo.
- `src/app/layout.tsx`: script inline (THEME_INIT) aplica o data-theme salvo ANTES do paint (sem
  piscar) + `suppressHydrationWarning` no <html> (o script mexe no atributo antes da hidratacao).
- `src/components/ThemeToggle.tsx` (novo): cicla Automatico -> Claro -> Escuro; grava "light"/"dark"
  (ou remove) em localStorage 'vs-theme' e seta data-theme. Le o modo com `useSyncExternalStore`
  (hidratacao segura, sem setState em efeito, reage a storage/evento proprio). Icone Monitor/Sun/Moon.
- `src/components/AppShell.tsx`: <ThemeToggle /> ao lado do tutorial no header.

### Comandos
- `npx prisma generate` (campo novo, sem tocar banco). `npx tsc --noEmit` -> 0. `npx eslint .` -> 0.
  `npx vitest run` -> 233/233. `npx next build` -> OK.

### Pendencias / proximos passos
- **APLICAR A MIGRATION** `20260717150000_baixa_item_observacao` (aditiva, coluna TEXT): aplica
  sozinha no proximo deploy (vercel-build roda migrate deploy). Sem aplicar, a tela de Baixas quebra
  (o client Prisma ja espera BaixaItem.observacao). A migration da arquivada (sessao anterior) ja foi.
- Ainda sem teste real contra o Omie: confirmar que a `obs` composta (com a observacao livre na
  frente) cabe/aparece direito no movimento (o campo e cortado em 500 chars antes de enviar).
- Login (/login) nao tem o botao de tema (nao usa o AppShell); o tema ainda se aplica la por CSS.

## 2026-07-17 (cont. 2) — Relatorio PDF com marca, saldo do Omie na requisicao, filtro INATIVO e piscada do tema

### Resumo
Rodada de ajustes pedidos pelo admin e pela fabrica: (1) piscada ao trocar tema; (2) PDF do
relatorio mais bonito + logo/Vital Scheffer; (3) busca da requisicao nao mostrar produtos
"INATIVO"; (4) mostrar o saldo do Omie ao lado do produto escolhido. tsc/eslint/vitest(240)/build
verdes. Commit + push (deploy) feitos ao final (o admin autorizou).

### 1) Piscada ao trocar de tema
- `src/components/ThemeToggle.tsx`: `aplicarSemPisca` injeta um `<style>` com
  `*{transition:none !important}` durante a troca, aplica o data-theme, forca um reflow
  (getComputedStyle) e remove o style no proximo requestAnimationFrame. Sem isso, os ~58 usos de
  `transition-colors`/etc. animavam a cor por ~0,15s na troca (o "borrao"/piscada).

### 2) Relatorio PDF com a marca (reescrito)
- `src/lib/requisicoes/relatorio.ts`: virou so a parte PURA (rotulos + `resumoRelatorio`);
  removidos `montarLinhasRelatorio`/`LinhaRelatorio` (o desenho agora consome os dados
  estruturados direto).
- `src/lib/requisicoes/relatorioPdf.ts`: reescrito. Faixa de cabecalho petroleo com a LOGO da
  Vital (desenhada com `drawSvgPath`+`drawCircle`, mesmos tracos do VitalLogo, em try/catch) +
  "Vital Scheffer" / "Vital Ops" / titulo / periodo. Resumo com os totais, um bloco por
  requisicao (faixa com REQ + status colorido), tabela de itens (Codigo/Descricao/Qtd/Situacao,
  situacao colorida, motivo da falha em vermelho), quebras de pagina com cabecalho compacto e
  rodape "Vital Scheffer - Vital Ops - Pagina i de N". Encoding WinAnsi preservado (paraWinAnsi).
- `src/components/requisicoes/RelatorioRequisicoes.tsx`: chama a nova assinatura
  `gerarRelatorioPdf(requisicoes, periodo, geradoEm)`.
- Testes: `relatorio.test.ts` reescrito (resumo + rotulos); novo `relatorioPdf.test.ts` (smoke:
  gera PDF valido %PDF-, periodo vazio, e caso com char fora do WinAnsi + varias paginas).
  NAO deu pra conferir o PDF no navegador (extensao do Chrome desconectada) - so os smoke tests.

### 3) Busca da requisicao: fora os "INATIVO" da descricao
- O screenshot do admin mostrou produtos tipo "INATIVO1-PAPEL HIGIENICO..." aparecendo: eles NAO
  estao com `inativo="S"` no Omie, tem o prefixo "INATIVO1-"/"INATIVO-" na DESCRICAO (convencao
  manual da empresa). `buscarProdutosPorDescricao` agora tambem descarta quem a descricao
  (sem acento) comeca com "inativo" (alem de inativo="S"/bloqueado="S", que ja filtrava).

### 4) Saldo do Omie ao lado do produto escolhido
- `src/lib/estoque/omieEstoque.ts`: `saldoTotalPorCodigo` (ListarPosEstoque com
  `lista_local_estoque: "TODOS"` + soma `nSaldo` por `cCodigo` = total de todos os locais; robusto
  a 1 linha por produto x local).
- `src/app/(app)/requisicoes/actions.ts`: action `saldoDoProduto(sku)` (best-effort; erro = ok:false).
- `src/components/requisicoes/ProdutoSkuField.tsx`: ao ESCOLHER um produto, busca o saldo e mostra
  "- estoque no Omie: N" ao lado da descricao (limpa ao digitar de novo; guarda de corrida por ref).
  Decisao: saldo APOS a selecao (1 chamada, sem risco de paginacao/cap) em vez de por resultado da
  busca (N produtos x locais poderia estourar a pagina). Da pra mover pra busca depois se quiserem.

### Comandos
- `npx prisma generate`. `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 240/240
  (21 arquivos). `npx next build` -> OK.

### Pendencias / proximos passos
- Confirmar no Omie real: se `lista_local_estoque: "TODOS"` traz mesmo todos os locais (o total do
  saldo depende disso); testar com um produto de saldo conhecido. Se vier so o padrao, a soma fica
  subestimada e a gente troca a abordagem.
- Conferir o visual do PDF (nao exercido no navegador nesta sessao).
- Se quiserem o saldo TAMBEM na lista de resultados da busca (nao so apos escolher), da pra fazer
  (custa 1 leitura a mais por busca e precisa cuidar de paginacao com muitos produtos).

## 2026-07-17 (cont. 3) — Baixa direto na tela (sem planilha) + historico reutilizavel

### Resumo
A fabrica pediu poder lancar a baixa DIRETO na tela (sem depender de planilha), com busca de
produto (descricao do Omie), so codigo+quantidade obrigatorios, e um HISTORICO com SELECAO pra
reusar lancamentos sem trazer o que nao quer. Feito reusando a busca de produto e a
conferencia/baixa que ja existiam. Code review feito antes de subir (2 bugs corrigidos).
tsc/eslint/vitest(240)/build verdes. Commit + push (deploy).

### Implementacao
- `src/components/requisicoes/ProdutoSkuField.tsx`: virou GENERICO — recebe `buscar` e `saldoDe`
  por prop (antes importava as actions da requisicao direto). Assim serve requisicao E baixa, cada
  uma com sua permissao. `CriarRequisicaoForm` passa `buscarProdutosOmie`/`saldoDoProduto`.
- `src/app/(app)/baixas/actions.ts`: novas actions `buscarProdutosBaixa`, `saldoProdutoBaixa`
  (guardadas por canViewBaixas, reusam buscarProdutosPorDescricao/saldoTotalPorCodigo) e
  `historicoBaixaItens` (ultimos BaixaItem status BAIXADO, 1 por SKU, ate 50). `obsDoItem` mudou o
  prefixo de "Baixa por planilha X" pra "Baixa: X" (serve planilha e "Digitada na tela").
- `src/components/baixas/BaixaManualCart.tsx` (novo): carrinho controlado. Cada linha tem o
  ProdutoSkuField (descricao Omie + saldo), quantidade, e um "mais campos" (pedido/NF/OP/observacao).
  So SKU+qtd obrigatorios (linhasValidas filtra o resto). Historico com filtro + CHECKBOX; "Adicionar
  selecionados" traz so os marcados ja preenchidos. Reporta as BaixaLinha validas pra tela via onLinhas.
- `src/components/baixas/BaixasClient.tsx`: alternador "Subir planilha" x "Digitar na tela". `linhasAtivas`
  vem do arquivo OU do carrinho; a conferencia e a baixa (executarBaixa com arquivoNome "Digitada na
  tela") sao as MESMAS dos dois modos. Modo manual confere no botao (nao auto).

### Code review (antes de subir) — 2 bugs corrigidos
- Editar o carrinho durante conferir/baixar incrementava o `reqId` e travava o spinner + descartava
  o resultado. Fix: carrinho (fieldset disabled) e alternador de modo travam enquanto conferindo||executando.
- `abrirHistorico` sem catch (rejeicao solta se a leitura falhar). Fix: catch -> trata como "nenhuma baixa".

### Comandos
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 240/240. `npx next build` -> OK.

### Pendencias / proximos passos
- Sem migration nesta entrega (nenhuma mudanca de schema).
- Historico dedup por SKU pega os 400 BaixaItem mais recentes e corta em 50 distintos; se quiserem
  historico maior/por periodo, da pra ajustar.
- Cap de 200 itens por baixa vale tambem no modo tela (schema); o carrinho nao bloqueia antes, so a
  action recusa com mensagem generica se passar (caso raro).

## 2026-07-17 (cont. 4) — Estorno de baixa, alerta de estoque minimo e excluir setor (+ fix da piscada)

### Resumo
Lote de melhorias pedido pelo admin (das que sugeri). Entregue nesta parte: (a) ESTORNAR uma baixa;
(b) ALERTA de estoque minimo na conferencia (so gestor); (c) EXCLUIR setor. Tambem subiu antes,
sozinho, o fix da PISCADA ao trocar de aba (commit 3739547). Code review rodado antes do push
(3 achados, 2 corrigidos). tsc/eslint/vitest(246)/build verdes.
FICOU PARA O PROXIMO LOTE (comunicado ao admin): relatorio de consumo em R$, aviso "qtd>saldo" no
carrinho, notificacao ao solicitante (o vital-ops NAO tem canal de e-mail/WhatsApp hoje - decisao
de infra a parte; fiz so a base), e a passada de responsividade (precisa testar no visual).

### Estorno (reverter uma baixa)
- Confirmado na doc do Omie: ENT com `lote_validade: [{nIdLote, nQtdLote}]` SOMA de volta no lote
  existente (por nIdLote). Entao o estorno replica a alocacao da baixa como ENTRADA.
- `prisma/schema.prisma` + migration `20260717180000_baixa_item_custo_estorno`: BaixaItem ganhou
  `custoUnitario` (CMC da baixa), `loteConsumido` (Json da alocacao), `estornadoEm`, `estornoRef`.
- `omieEstoque.ts`: `baixarEstoque` agora DEVOLVE `custoUnitario` e `lotes` no item baixado;
  `processarBaixa` guarda os dois no BaixaItem (base do relatorio futuro e do estorno). Nova funcao
  `reverterBaixa` (ENT nos mesmos lotes, valor=custo*qtd, cod_int `est-<item>` idempotente, ban-safe).
- `baixas/actions.ts`: `estornarBaixa(importId)` (guard canViewBaixas, carrega itens BAIXADO com
  estornadoEm=null, chama reverterBaixa no local do import, marca estornadoEm/estornoRef + cria
  MovimentoEstoque ENTRADA, auditado). `parseLotes` le o Json de volta.
- `baixas/page.tsx` + `EstornarBaixa.tsx`: botao "Estornar" (com confirmacao inline) na tabela de
  baixas recentes; marcador "estornada" depois.

### Alerta de estoque minimo (so gestor)
- `omieEstoque.ts`: `SaldoEstoque.estoqueMinimo` (le `estoque_minimo` do ListarPosEstoque).
- `baixas/actions.ts` `conferirItens`: `abaixoDoMinimo` = saldo apos a baixa < minimo.
- `BaixasClient.tsx`: recebe `role`; mostra "fica abaixo do minimo (N) - repor" na conferencia so
  para ADMIN/GESTOR/FABRICA_GESTOR.

### Excluir setor
- `usuarios/actions.ts` `excluirSetor` (canManageUsers): bloqueia se ha requisicoes ligadas (FK),
  senao exclui (memberships cascateiam), auditado, com try/catch pro caso de corrida. Botao X com
  confirmacao inline (`ExcluirSetor.tsx`) em cada chip de setor.

### Code review (antes do push)
- FIX: linha da baixa nao mostrava que foi estornada -> marcador "estornada".
- FIX: excluirSetor sem try/catch (corrida -> FK 500) -> mensagem amigavel.
- OK-como-esta: ENT do estorno omite valor com custo 0 (espelha a saida provada; confirmar no teste real).

### Comandos
- `npx prisma generate`. `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 246/246.
  `npx next build` -> OK.

### Pendencias / proximos passos
- APLICAR a migration `20260717180000_baixa_item_custo_estorno` (aditiva) - aplica sozinha no deploy.
- Testar o estorno de verdade com o Omie (ENT-lote e o valor com custo 0).
- Proximo lote: relatorio de consumo R$ (a base custoUnitario ja esta gravando), aviso qtd>saldo,
  notificacao (decidir e-mail x WhatsApp), responsividade.

## 2026-07-17 (cont. 5) — Relatorio de consumo R$, aviso qtd>saldo e notificacao in-app

### Resumo
Continuacao do lote. Entregue: (a) RELATORIO DE CONSUMO em R$ (por produto/OP/finalidade); (b)
aviso "qtd > saldo" no carrinho manual; (c) NOTIFICACAO IN-APP (destaque dos pedidos decididos
recentemente). Code review antes do push (1 fix). tsc/eslint/vitest(251)/build verdes.
Responsividade NAO feita (precisa testar no visual - extensao do Chrome desconectada); push por
WhatsApp/e-mail continua como decisao de infra a parte.

### Relatorio de consumo (R$) - gestor
- `src/lib/baixas/consumo.ts` (puro, testado): `ItemConsumo`, `resumoConsumo` (total + agrupa por
  produto/OP/finalidade, maior valor primeiro), `formatarReais`.
- `src/lib/baixas/consumoPdf.ts` + teste (smoke): PDF com a marca (mesma faixa/logo do relatorio de
  requisicoes), total do periodo em R$ e 3 tabelas. try/catch na logo, paraWinAnsi nos textos.
- `baixas/actions.ts` `relatorioConsumo({de,ate})`: itens BAIXADO e NAO estornado no periodo, com
  valor = custoUnitario * qtd. So ADMIN/GESTOR/FABRICA_GESTOR (dado financeiro). take 5000.
- `RelatorioConsumo.tsx` + painel na pagina de Baixas (so gestor).

### Aviso qtd > saldo (carrinho manual)
- `ProdutoSkuField` ganhou `onSaldo?(saldo)` (avisa a tela do saldo do produto escolhido).
- `BaixaManualCart`: guarda o saldo por linha (via atualizarSaldo, SEM passar pelo aplicar pra nao
  zerar a conferencia) e mostra "Quantidade (X) maior que o saldo no Omie (Y)" quando qtd > saldo.

### Notificacao in-app (requisicao)
- `requisicoes/page.tsx`: `decididaRecentemente` (decidida ha < 3 dias) destaca o cartao em "Meus
  pedidos" (borda + selo "novo"), sem schema nem canal externo. Push real (WhatsApp/e-mail) fica pra
  decisao de infra.

### Code review (antes do push)
- FIX: no PDF de consumo, o rotulo do agrupamento (larguraMax 350) podia encostar na coluna de qtd
  em valores largos -> reduzido pra 300.
- OK-como-esta: take 5000 no relatorio (cap generoso; paginar se virar problema).

### Comandos
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 251/251. `npx next build` -> OK.

### Pendencias / proximos passos
- Sem migration nesta entrega.
- RESPONSIVIDADE: nao feita (precisa validar no visual). Os componentes novos ja seguem os padroes.
- Notificacao PUSH (WhatsApp/e-mail): decidir infra (e-mail via Resend/SMTP no vital-ops, ou ponte
  pro WhatsApp do nextstep). Hoje so a notificacao in-app.
- O relatorio de consumo so tem valor cheio das baixas feitas DEPOIS desta entrega (o custoUnitario
  passou a ser gravado agora; baixas antigas entram com valor 0).

## 2026-07-20 — Busca de produto tambem por SKU (codigo)

### Resumo
Reclamacao do admin: na baixa, a busca nao achava por PRD (ex.: PRD00026). Causa: `filtrar_apenas_descricao`
so filtra pela DESCRICAO, nao pelo codigo. Fix: `buscarProdutosPorDescricao` agora, quando NAO acha
nada por descricao, tenta o termo como CODIGO EXATO (`produtosPorCodigo`). Serve requisicao e baixa
(ambas usam a mesma funcao). +1 teste. tsc/eslint/vitest/build verdes.
- Limitacao: SKU PARCIAL nao da (a API do Omie so tem descricao-contem OU codigo-exato); tem que
  digitar o codigo inteiro ou buscar pelo nome. Partial exigiria cache local do catalogo.
- `src/lib/estoque/omieEstoque.ts`: fallback por codigo (1 leitura extra so quando a descricao vem vazia).

## 2026-07-20 (cont.) — Sininho de notificacoes + sidebar fixa no tablet

### Resumo
Dois pedidos do admin: (a) a barra lateral "retraia" ao trocar de tela; (b) faltava o BOTAO de
notificacoes (so tinha o destaque "novo" nos cartoes). Code review antes do push (2 achados menores,
sem fix). tsc/eslint/vitest(252)/build verdes.

### Sidebar fixa no tablet
- Causa: abaixo de `lg` (1024px) a sidebar era um menu sobreposto que FECHA ao clicar num item
  (`closeMobile`) — no tablet parecia bug. Fix: baixei o breakpoint da sidebar fixa de `lg` pra `md`
  (768px) em `AppShell.tsx` (aside + botao de menu). Agora tablet (>=768px) tem sidebar fixa que nao
  fecha ao navegar; so celular (<768px) mantem o menu sobreposto.

### Sininho de notificacoes
- `src/lib/notificacoes.ts` (tipo `Notificacao`, client-safe).
- `src/components/NotificacoesBell.tsx` (novo): sino no header com contador + dropdown (fecha no blur).
- `src/app/(app)/layout.tsx`: `montarNotificacoes` (gestor -> pendentes aguardando decisao; solicitante
  -> minhas requisicoes decididas nos ultimos 3 dias) e passa pro AppShell.
- `AppShell.tsx`: prop `notificacoes` + <NotificacoesBell/> antes do Report.

### Code review
- montarNotificacoes: +2 queries por navegacao (leve, indexadas) — mantido.
- header pode apertar em celular <375px com o botao a mais — cosmetico, avaliar na responsividade.

### Comandos
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 252/252. `npx next build` -> OK.

## 2026-07-20 (cont. 2) — Setores em Configuracoes + sidebar nao pula mais ao navegar

### Resumo
Dois pedidos: (a) criar setor em Usuarios e ele aparecer em Configuracoes; (b) a sidebar ainda
"retraia e voltava" ao trocar de tela. (Comecei a fazer setor em Requisicoes/afrouxar permissao, mas
o admin corrigiu o escopo -> revertido.) tsc/eslint/vitest(252)/build verdes, code review antes do push.

### Setores em Configuracoes
- `configuracoes/page.tsx` (so ADMIN): novo painel "Setores" (lista + CreateSetorForm + ExcluirSetor),
  reusando os componentes de Usuarios.
- `usuarios/actions.ts`: `createSetor`/`excluirSetor` agora fazem `revalidatePath("/configuracoes")`
  alem de "/usuarios" -> criar/excluir num lugar aparece no outro na hora. (Guards voltaram ao
  original: canManageUsers; NAO afrouxei pra deciders.)

### Sidebar "retrai e volta" ao navegar (era layout shift da scrollbar)
- Causa: a barra de rolagem aparece/some entre telas de alturas diferentes, empurrando o layout ~15px.
- Fix: `html { scrollbar-gutter: stable }` no globals.css (reserva o espaco sempre). O ajuste anterior
  (lg->md) era so pra tablet e nao era essa a causa.

## 2026-07-20 (cont. 3) — PERFIS DE ACESSO CUSTOMIZADOS (papeis dinamicos)

### Resumo
O admin queria criar seus proprios grupos de acesso (ex.: um perfil que ve SO Requisicoes) e que
aparecessem na matriz de "Permissoes por papel". Antes os papeis eram 5 FIXOS em codigo. Agora da pra
criar/apagar perfis em Configuracoes, marcar os modulos de cada um na matriz e atribuir as pessoas.
Mudanca grande e sensivel (permissao), feita com testes + code review antes do push.
tsc/eslint/vitest(254)/build verdes.

### Modelo
- `Perfil { codigo (cuid, PK), nome (unique), criadoEm }` + migration `20260720170000_perfil_customizado`.
  A tabela guarda SO os customizados; os 5 fixos seguem em codigo (com seus poderes especiais).
- `User.role` agora e string livre = o codigo do papel fixo OU do perfil custom. `RolePermission.role`
  idem. A validacao de "existe mesmo" virou a funcao `papelValido` nas actions de usuario.

### Nucleo
- `contracts/user.ts`: `roleSchema` virou `z.string().min(1)` (Role = string); novos `PAPEIS_FIXOS`,
  `ROTULO_PAPEL_FIXO` e `isPapelFixo`.
- `permissions.ts`: `RolePermissionsMap` virou `Record<string, ...>`; `buildRolePermissionsMap(rows,
  perfisCustom)` semeia os fixos com os defaults e os customs com TUDO FALSE, aplica as linhas e trava
  ADMIN=true. Novos `PerfilView`, `PERFIS_FIXOS`, `rotuloPapel`.
- `permissions.server.ts`: `getRolePermissionsMap` le os perfis custom; novos `listarPerfis` e
  `nomesPerfisCustom`.

### Telas
- `configuracoes/actions.ts`: `criarPerfil` / `excluirPerfil` (so ADMIN; bloqueia nome reservado e
  exclusao com usuario em uso, apaga as linhas de permissao junto) e `atualizarPermissoes` agora
  itera fixos-nao-admin + customs.
- `configuracoes/page.tsx` + `CriarPerfilForm` + `PermissionsMatrixForm` (linhas dinamicas, badge
  "perfil" e X de excluir nos customs) + `ExcluirPerfil`.
- `CreateUserForm` / `EditUserDialog`: os perfis custom entram no dropdown de Papel (a opcao do perfil
  atual PRECISA existir, senao o select ficaria vazio).
- `usuarios/page.tsx` e `AppShell`/layout: rotulo do papel resolvido por `rotuloPapel` (fixo ou nome do
  perfil), em vez do mapa fixo.

### Seguranca (o que garante que nao escala privilegio)
- Perfil custom NAO tem poderes especiais: `canDecideRequisicao`/relatorios checam os NOMES dos papeis
  fixos, entao custom so tem acesso POR MODULO.
- ADMIN continua travado em tudo e so ADMIN cria/apaga perfil e edita a matriz.
- Custom nunca recebe o codigo "ADMIN" (codigo e cuid; nome reservado bloqueado).
- Um gestor atribuir um perfil custom nao escala nada: o teto do custom e o mesmo do GESTOR (6 modulos),
  que ele ja podia conceder.

### Code review (antes do push)
- FIX: criarPerfil bloqueava so os codigos fixos; agora bloqueia tambem os ROTULOS (evita dois "Gestor").
- OK-como-esta: corridas raras (excluir perfil x atribuir usuario; salvar matriz x excluir) deixam
  no maximo lixo inofensivo — o mapa ignora papel inexistente (sem acesso, sem escalada).

### Comandos
- `npx prisma generate`. `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 254/254.
  `npx next build` -> OK.

### Pendencias
- APLICAR a migration `20260720170000_perfil_customizado` (aplica sozinha no deploy).
- Perfil custom so "ve" telas. Se um dia precisarem que um perfil custom APROVE requisicao / veja os
  relatorios de gestor, ai vira permissao marcavel tambem (fase 2, combinada com o admin).

### Comandos
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 252/252. `npx next build` -> OK.

## 2026-07-20 (cont. 4) - Bug: baixa de produto com LOTE recusada pelo Omie (reserva de lote)

### Resumo
O admin reportou falha na aba "Baixa de estoque": PRD01098 e PRD01099 (RODIZIO 512), 50 un cada,
davam "Produto com controle de lote: o Omie recusou a baixa por lote". Diagnostiquei contra a API
REAL do Omie (so leitura) + o banco de producao. Causa confirmada: alocavamos o lote pelo SALDO
FISICO (`nSaldoLote`), ignorando a quantidade RESERVADA - o Omie recusa a saida da parte reservada.
Corrigido para usar `nQuantDisponivel`. Achei e corrigi tambem um bug latente de LOCAL no
`ConsultarLote`. tsc/eslint/vitest(256)/build verdes.

### Diagnostico (dados reais, 20/07/2026)
- Banco: import "Digitada na tela", local `5940905787` (Estoque de Materia - Prima), 50 un por item,
  status FALHA nos dois SKUs.
- `ListarProdutos`: os dois estao com `produto_lote: "S"` (controle de lote ligado), ativos.
- `ListarPosEstoque`: saldo 138 no local 5940905787 e 0 no padrao -> a validacao LOCAL de saldo
  passava (138 >= 50), por isso o erro so aparecia no write.
- `ConsultarLote` no local 5940905787:
  - PRD01098: lote 12128811578 (`nSaldoLote` 38, `nQuantReservada` 6, `nQuantDisponivel` 32,
    val. 10/07/2099) e lote 12137854548 (100/0/100, val. 16/07/2099).
  - PRD01099: lote 12128825141 (38/6/32, val. 07/04/2029) e 12137854572 (100/0/100, val. 16/07/2099).
- FEFO pegava 38 do PRIMEIRO lote (o que vence antes), mas so 32 estavam livres -> o Omie recusava.
  O SESSION_LOG de 17/07 ja tinha previsto exatamente isso: "se um dia houver reserva atrapalhando,
  trocar por `nQuantDisponivel`". Era o dia.

### Fix 1 (a causa) - alocar por quantidade DISPONIVEL
- `src/lib/estoque/omieEstoque.ts`: `LoteDisponivel.saldo` virou `disponivel` (`nQuantDisponivel`,
  com fallback pro `nSaldoLote` se o campo faltar) + `saldoFisico` (so log/diagnostico).
  `alocarLotesFEFO` passa a distribuir sobre `disponivel`. No caso real: 32 do lote que vence antes
  + 18 do outro = 50, tudo livre.
- Mensagem da falha local agora diz que parte do saldo pode estar RESERVADA em pedidos/OPs.

### Fix 2 (bug latente de local, mesmo sintoma)
- Confirmado contra a API: o `ConsultarLote` NAO assume o local padrao quando `nIdLocal` e omitido,
  ele devolve os lotes de TODOS os locais (diferente do `ListarPosEstoque`, onde
  `codigo_local_estoque: 0` E o padrao; tambem testei). Com `LOCAL_PADRAO` ("0") o codigo omitia o
  campo e podia alocar lote de OUTRO local, com recusa garantida do Omie.
- `consultarLotes` agora resolve o codigo REAL do local padrao (via `listarLocaisEstoque`, cache 1h) e
  sempre manda `nIdLocal`; alem disso descarta lote cujo `nIdLocal` nao bate. Se a leitura dos locais
  falhar, segue sem filtro (comportamento antigo) em vez de derrubar a baixa.
- Impacto: a tela de Baixas sempre manda o codigo real do local, entao ela nao era afetada; o caminho
  de Requisicoes (`decidirRequisicao`) usa `?? LOCAL_PADRAO` e ERA.

### Fix 3 (diagnosticabilidade)
- `motivoAmigavel` engolia a `faultstring` do Omie: a falha em producao virava um texto generico e o
  motivo real se perdia (foi o que atrasou este diagnostico). Agora a dica amigavel vai junto com a
  "Resposta do Omie: <texto cru>".

### Arquivos alterados
- `src/lib/estoque/omieEstoque.ts` (os 3 fixes + comentarios de contrato da API atualizados).
- `src/lib/estoque/omieEstoque.test.ts` (+4 testes: reserva descontada, lote 100% reservado fora,
  local padrao resolvido e filtrado, fallback sem filtro; fixtures migradas pra disponivel/saldoFisico).
- `src/lib/changelog.ts` (entrada 2026-07-20 pra quem usa o app).

### Comandos
- `npx tsc --noEmit` -> 0. `npx eslint .` -> 0. `npx vitest run` -> 256/256. `npx next build` -> OK.

### Pendencias / proximos passos
- Sem migration nesta entrega.
- RETESTAR a baixa dos dois RODIZIOS depois do deploy. Se ainda falhar, a mensagem agora traz a
  resposta crua do Omie, e com ela o motivo real sai na hora.
- A conferencia (tela) continua mostrando o saldo FISICO do local (`nSaldo`), que inclui reserva.
  Entao da pra conferir 138 e a baixa falhar por lote em 132. Se incomodar, o proximo passo e a
  conferencia tambem olhar o disponivel por lote (custa 1 leitura por SKU com lote).

## 2026-07-21 - Configurador de produto (Maca Padiola): viabilidade e plano

### Resumo
Pedido: tela no vital-ops onde o comercial configura um produto por opcoes (Maca
Padiola como primeiro caso), e o resultado cai numa tela NOVA no nextstep para a
equipe de Projetos (Jonathan / projetos02@). Esta sessao foi so levantamento de
viabilidade nos 3 repos envolvidos + plano. Nenhum codigo alterado.

### Levantamento
- vital-ops: nao existe nada de configurador (greenfield). Os 5 papeis fixos nao
  incluem comercial e nenhum vendedor esta cadastrado (prisma/seed.ts so tem
  admin@ e gestor@). Escrita = Server Actions + audit() + changelog.
- nextstep (origin/main): acesso por membership de Sector. Setores existentes em
  apps/accounts/sectors.py: Comercial, Financeiro, Logistica, Geral. NAO existe
  setor Projetos. NAO existe auth por token/API key para sistema externo: as
  unicas portas nao-sessao sao os webhooks HMAC (Meta, D4Sign) e o form publico
  de lead. Molde de modulo de setor = apps/logistica (models + services + board +
  auditoria campo a campo). "Tela nova" = novo ViewId em frontend/app/page.tsx,
  nao rota nova. ATENCAO: o checkout local esta na branch
  feat/disparo-multiselect-vendedor, defasado (a main tem apps/pcp e apps/reports).
- configurador-cama-hospitalar: ja faz configuracao por opcoes para a cama
  (EC2+SQLite, HTML monolitico com as opcoes chumbadas no markup). Nao sera
  reaproveitado como codigo, mas 2 ideias vem dele: o codigo determinstico da
  configuracao e a checagem "essa combinacao ja tem projeto CAD?".

### Decisoes (usuario, 2026-07-21)
1. Configurador no vital-ops; tela de Projetos no nextstep. Implica construir a
   ponte entre os dois sistemas (foi apresentada a alternativa de fazer tudo no
   nextstep, sem integracao; o usuario optou pelo split).
2. Configuracao AVULSA, sem vinculo com lead/cliente. Quem preenche e o pessoal
   do comercial (ex.: Rodrigo Sefas).
3. Setor novo "Projetos" no nextstep, com membership dupla (Projetos + Logistica).
4. A tela do Jonathan: ve, responde (status + numero do projeto CAD) e detecta
   combinacoes repetidas.

### Arquitetura
- Catalogo orientado a DADOS, nao chumbado: Produto -> Grupo -> Opcao, com flag
  isPadrao, ordem, e tipos alem de radio (opcao que exige texto, caso do "OUTRO
  PESO - INDICAR" e "OUTRA MEDIDA"). Assim a Maca Padiola e o primeiro registro e
  o proximo produto e cadastro, nao deploy. (A Maca ja esta definida: 10 grupos +
  observacoes adicionais.)
- Codigo de identidade determinstico, derivado de grupo+opcao numa ordem estavel
  (derivado do catalogo, nao escrito a mao como no configurador da cama). As
  observacoes adicionais NAO entram no codigo, senao a deteccao de repetidos
  nunca casa; entram como flag "tem observacao".
- "Fora do padrao" calculado comparando a selecao com a opcao padrao. E o
  destaque principal da tela do Jonathan, mais util que a lista completa.
- No nextstep, snapshot desnormalizado (padrao Delivery/Pickup): o board nao
  consulta o vital-ops para renderizar.
- Ponte: POST assinado com HMAC SHA-256 do vital-ops para o nextstep, no molde de
  apps/webhooks (services/signature.py reutilizavel + WebhookEvent para raw,
  idempotencia e reprocesso). Outbox com retry do lado do vital-ops. Callback na
  direcao inversa (nextstep -> vital-ops) devolvendo status e numero do CAD, mesmo
  mecanismo, segredo separado.

### Plano por fases (fatiado para entregar valor antes do encanamento)
- Fase 1 (vital-ops, ja testavel sozinha): schema do catalogo + seed da Maca
  Padiola + modulo/tela do configurador + codigo de identidade + destaque de fora
  do padrao + persistencia local. Acesso: perfil customizado "Comercial" (model
  Perfil ja existe, criado por /configuracoes) com apenas o modulo novo, em vez de
  inventar papel fixo. Criar os logins do comercial.
- Fase 2 (nextstep): apps/projetos + setor Projetos + is_projetos no
  UserSerializer + nav-access + projetos-view + deteccao de repetidos + resposta
  com numero do CAD. Alimentada por seed/import manual nesta fase.
- Fase 3: a ponte HMAC + outbox/retry.
- Fase 4: callback de resposta (status + CAD) de volta para o vital-ops.

### Pendencias / proximos passos
- Confirmar a lista de logins do comercial no vital-ops. ATENCAO: o Rodrigo Sefas
  loga como vendas10@ mas o e-mail dele e vendas01@; o login do vital-ops e por
  e-mail @vitalscheffer.com.br, entao definir qual vale.
- O usuario vai compilar as opcoes dos demais produtos; o catalogo tem que
  aguentar isso sem deploy.
- Imagem do produto: a render da maca ja existe e nao muda por enquanto.
- Lembrar: entrada em src/lib/changelog.ts em toda entrega do vital-ops;
  responsividade mobile (breakpoint 768) na tela do nextstep.
- Seguranca (achado colateral, fora do escopo): CamaHospitalarFTP/send.php tem a
  senha do e-mail em texto puro, e o SESSION_LOG do configurador-cama-hospitalar
  tem AWS access key + secret em texto puro (a rotacao ja esta anotada la como
  pendencia aberta). Vale rotacionar.

## 2026-07-21 - Fase 1 do configurador: modulo no vital-ops (EM PRODUCAO)

### Resumo
Implementada a Fase 1 do plano acima: modulo "Configurador" no vital-ops, onde o
comercial monta o produto opcao por opcao a partir de uma foto de referencia e
envia a especificacao. Primeiro produto: Maca Padiola (10 grupos + observacoes).
A tela da equipe de Projetos no nextstep e a ponte entre os sistemas continuam
para as fases 2 a 4.

### Arquivos criados
- `src/lib/configurador/catalogo.ts` - catalogo tipado (Produto -> Grupo -> Opcao),
  com flag de padrao e opcao que abre campo de texto livre. A Maca Padiola inteira
  vive aqui; a tela renderiza generico, sem nenhuma opcao chumbada no JSX.
- `src/lib/configurador/codigo.ts` - nucleo puro: `resolverSelecoes` (valida contra
  o catalogo), `montarCodigo` (identidade deterministica), `foraDoPadrao`,
  `escolhasPadrao`, `resumoTexto`.
- `src/lib/configurador/codigo.test.ts` - 18 testes (determinismo, texto livre
  normalizado, acento, truncagem, desvios, catalogo bem formado).
- `src/lib/contracts/configuracao.ts` - zod + `formatarNumeroConfiguracao` (CFG-0001).
- `src/app/(app)/configurador/page.tsx` - tela (guard + formulario + lista das 20
  ultimas).
- `src/app/(app)/configurador/actions.ts` - Server Action `criarConfiguracao`.
- `src/components/configurador/ConfiguradorForm.tsx` - formulario cliente com
  previa ao vivo do codigo e dos desvios.
- `prisma/migrations/20260721120000_configurador/migration.sql` - tabela Configuracao.
- `public/configurador/maca-padiola.jpg` - foto de referencia (1600x759).

### Arquivos alterados
- `prisma/schema.prisma` - model `Configuracao` + relacao em `User`.
- `src/lib/permissions.ts`, `prisma/seed.ts` - novo modulo `configurador` na matriz
  (ADMIN/GESTOR/FUNCIONARIO true; FABRICA e FABRICA_GESTOR false).
- `src/lib/rbac.ts` - `canViewConfigurador`.
- `src/lib/navigation.ts`, `src/components/AppShell.tsx`, `src/app/(app)/page.tsx`,
  `src/components/configuracoes/PermissionsMatrixForm.tsx` - item de menu, icone
  (SlidersHorizontal) e rotulo do modulo.
- `src/lib/changelog.ts` - entrada 2026-07-21 para quem usa o app.
- `src/lib/permissions.test.ts`, `src/lib/navigation.test.ts` - expectativas com o
  modulo novo + 2 testes do perfil customizado "Comercial" vendo so o configurador.

### Decisoes importantes
- **Catalogo em codigo, nao no banco.** Sem tela de cadastro de catalogo, semear
  tabela na mao seria pior que editar um arquivo revisavel (o diff vira historico).
  O formato ja e o mesmo que as tabelas terao quando virar cadastro. Custo: produto
  novo exige deploy (automatico, ~1 min). Isso muda o que estava escrito no plano
  ("cadastro, nao deploy") - decisao consciente para entregar a Fase 1 antes.
- **Observacoes livres NAO entram no codigo de identidade.** Se entrassem, todo
  texto digitado geraria codigo novo e a deteccao de repetidos (fase 2) nunca casaria.
- **Snapshot desnormalizado** das selecoes (com rotulos) no campo `selecoes` Json:
  configuracao antiga continua legivel se o catalogo mudar. Mesmo padrao do
  Delivery/Pickup do nextstep.
- **Modulo proprio** na matriz, nao pendurado em "products": o publico e o comercial,
  que nao deve enxergar BOM/estoque. O comercial entra por perfil customizado.
- **Texto livre no codigo e truncado em 16 caracteres normalizados.** Duas medidas
  que coincidam nos 16 primeiros geram o mesmo codigo; aceitavel porque o texto
  integral fica no snapshot e aparece inteiro na tela de Projetos.

### Comandos
- `npx prisma generate` -> OK. `npx tsc --noEmit` -> 0 erros. `npx eslint .` -> 0.
- `npx vitest run` -> 276/276 (18 novos). `npx next build` -> OK, rota /configurador.
- `npx prisma migrate deploy` -> migration aplicada no Neon de PRODUCAO (autorizada
  pelo usuario; so CREATE TABLE + indices + FK, nao altera tabela existente).
- `git push origin master` -> deploy Vercel `vital-33y5py9su`, status Ready, 47s.

### NAO verificado
A tela nao foi exercitada por dentro: nao tenho credencial de login do vital-ops,
entao o fluxo (marcar opcoes -> enviar -> aparecer na lista) nao foi rodado por mim.
Build, tipos, lint e os 276 testes passam, e a rota responde em producao (307 para
/login, como toda rota protegida). Falta um teste humano.

### Pendencias / proximos passos
- **Liberar acesso ao comercial**: em /configuracoes, criar o perfil "Comercial" e
  marcar SO o modulo Configurador; depois atribuir o perfil as pessoas em /usuarios.
  Definir os e-mails (atencao ao Rodrigo Sefas: loga como vendas10@ mas o e-mail e
  vendas01@; no vital-ops o login e por e-mail).
- Confirmar com o usuario se as 10 secoes + observacoes sao a lista fechada da maca.
- Fase 2: `apps/projetos` no nextstep (setor Projetos + membership dupla com
  Logistica, tela no nav, deteccao de repetidos, resposta com numero do CAD).
- Fase 3: ponte HMAC vital-ops -> nextstep (outbox/retry; os campos
  `sincronizadoEm`, `sincronizacaoErro` e `tentativasSync` ja existem na tabela).
- Fase 4: callback de resposta (status + CAD) de volta para o vital-ops (campos
  `projetoCad`, `respostaNota`, `respondidoPor`, `respondidoEm` ja existem).

## 2026-07-21 (parte 2) - Tela de Projetos NO VITAL-OPS (mudanca de rumo)

### Resumo
O usuario mudou de ideia: a tela da equipe de Projetos NAO vai para o nextstep,
vai direto no vital-ops. Tudo que tinha sido escrito no nextstep foi descartado e
o fluxo inteiro (configurar -> fila -> responder) passou a viver aqui. Tambem
entrou o historico ("se for a mesma configuracao, so puxar do historico").

### O que foi DESCARTADO (nao existe mais)
- O worktree C:\Users\TREINAMENTO\nextstep-projetos-wt e a branch
  `projetos-configuracoes` foram removidos. Nada chegou a ser commitado nem
  pushado: a `main` do nextstep nunca foi tocada. Ficam sem efeito os planos de
  `apps/projetos` no Django, setor "Projetos", ponte HMAC e as fases 3 e 4 do
  SESSION_LOG anterior.

### Arquivos criados
- `src/lib/configurador/historico.ts` (+ teste) - agrupa envios por CODIGO de
  identidade (a mesma maca pedida 5x aparece 1x, com a contagem) e devolve as
  escolhas prontas para recarregar o formulario.
- `src/lib/configurador/fila.ts` (+ teste) - regras da fila (estaAberta,
  podeAssumir), o indice "essa combinacao ja foi desenhada?" e a cor de status
  compartilhada pelas duas telas.
- `src/app/(app)/projetos/page.tsx` e `actions.ts` - a fila e as acoes
  (assumir / atender com numero do projeto / recusar com motivo).
- `src/components/projetos/ConfiguracaoCard.tsx` - item da fila.
- `prisma/migrations/20260721160000_fila_projetos/migration.sql`.

### Arquivos alterados
- `prisma/schema.prisma` - Configuracao perdeu os campos de sincronizacao
  (sincronizadoEm/sincronizacaoErro/tentativasSync, restos da ponte que nao
  existe mais) e `respondidoPor` virou relacao com User. Indice `codigo` virou
  composto `(codigo, status)`, que e como a busca de reuso filtra.
- `src/lib/permissions.ts` + `seed.ts` + testes - novo modulo `projetos`.
- `src/lib/rbac.ts`, `navigation.ts`, `AppShell.tsx`, `page.tsx`,
  `PermissionsMatrixForm.tsx` - item de menu, icone (Ruler), rotulo.
- `src/lib/configurador/codigo.ts` - `textoDaSelecao`/`rotuloDaSelecao` viraram
  fonte unica do formato (antes eram 3 implementacoes, 2 formatos diferentes).
- `src/lib/changelog.ts` - entrada nova da tela Projetos.

### Decisoes importantes
- **Tudo no vital-ops.** Sem ponte entre sistemas: sem HMAC, sem outbox/retry,
  sem duplicar usuario, e o vendedor ve a resposta na mesma tela em que pediu.
- **Observacoes livres continuam fora do codigo de identidade**, senao a
  deteccao de repetidos nunca casaria.
- **Modulo `projetos` separado do `configurador`**: sao os dois lados do mesmo
  fluxo, com publicos diferentes. Nenhum dos dois vai para papel de fabrica por
  padrao; cada time entra por perfil customizado.

### Code review (feito nesta sessao, achados corrigidos)
- Indice de "ja desenhado" lia as 300 atendidas mais recentes: combinacao antiga
  sumia do indice e a equipe redesenharia projeto existente. Agora a consulta e
  restrita aos codigos da pagina - exata e mais barata.
- Assumir/responder faziam check-then-act (findUnique + update): duas pessoas
  podiam responder a mesma configuracao e a segunda sobrescrevia a primeira. A
  guarda de estado foi para o WHERE do updateMany; count === 0 = alguem chegou
  primeiro.
- Aba "Atendidas" ordenava asc com corte em 50: quem acabou de responder nao
  achava o proprio item. Agora aberta = asc (FIFO), concluidas = desc.
- Corte de 50 era silencioso; a tela agora diz "Mostrando X de N".
- 3 implementacoes de formatar selecao, com 2 formatos - consolidadas.

### Comandos
- `npx prisma generate`, `npx tsc --noEmit` -> 0, `npx eslint .` -> 0,
  `npx vitest run` -> 294/294, `npx next build` -> OK (rotas /configurador e
  /projetos).

### Pendencias / proximos passos
- **Liberar acesso**: em /configuracoes criar os perfis "Comercial" (so o modulo
  Configurador) e "Projetos" (so o modulo Projetos), e atribuir as pessoas em
  /usuarios. Definir os e-mails (Rodrigo Sefas loga como vendas10@ mas o e-mail
  e vendas01@; aqui o login e por e-mail).
- Nenhuma das duas telas foi exercitada por dentro (nao tenho credencial de
  login) - falta teste humano do fluxo completo.
- Confirmar se as 10 secoes + observacoes sao a lista fechada da maca.
- Proximos produtos: acrescentar em src/lib/configurador/catalogo.ts (exige
  deploy, ~1 min; virar cadastro em tela so se a frequencia justificar).

## 2026-07-21 - Pranchas: leitura dos codigos novos (5-5-5) e lista de materiais

### Resumo
O modulo Pranchas estava quebrado para os codigos de engenharia atuais. A regex
de `src/lib/pranchas/codes.ts` so entendia o formato antigo
("C4MEC P01 C00 R00") e casava **1 dos 658** desenhos reais da pasta de producao
(`Downloads\- PDF''s`). Alinhado o parser ao formato 5-5-5 que o modulo de
Produtos ja usa (`src/lib/bom/bomParser.ts`), mantendo o formato antigo. Somada
a lista de material de compra com multiplicador e exportacao para Excel.

### Bug secundario (mais grave que o primeiro)
A chave de familia era `prefixo + tipo + numero`, ignorando o bloco de material.
Nos arquivos reais isso funde **71 familias** de pecas distintas que so diferem
no material/acabamento: `SPDSP PC001 INCTP` x `SPDSP PC001 INDTP`,
`CREHS PC001 CCSLD` (carbono) x `CREHS PC001 ICSLD` (inox), `MXAPH PC004` em
tres acabamentos. Ou seja: mesmo com a regex corrigida, imprimiria o desenho
errado. A identidade agora sao os tres blocos.

### Arquivos alterados/criados
- `src/lib/pranchas/codes.ts` - reescrito. Suporta os dois formatos (o antigo so
  e tentado quando o texto nao tem nenhum codigo atual, senao
  "POADH PC008 CCSLD C00 R00" gerava um codigo fantasma "CCSLD C00"). Chave de
  familia = 3 blocos. Itens comprados (familia "COM*") marcados com
  `comercial: true` e excluidos das pranchas. Novo status `norev`.
- `src/lib/pranchas/bom.ts` - planilha passa a ser lida linha a linha (descricao
  limpa da celula, quantidade da coluna certa) em vez de concatenar tudo num
  texto. Devolve `itens` com `quantidadeEfetiva`.
- `src/lib/pranchas/materiais.ts` (novo) - agrupa comprados por codigo, aplica o
  multiplicador, gera o .xlsx.
- `src/lib/pranchas/codes.test.ts` - refeito com dados reais das duas BOMs.
- `src/lib/pranchas/materiais.test.ts` (novo).
- `src/components/pranchas/PranchasClient.tsx` - badge "SEM REVISAO", secao
  "Material de compra" com multiplicador e botao de Excel.

### Decisoes importantes
- **Arquivo sem R## casa e avisa** (98 dos 658 arquivos nao declaram revisao):
  status `norev`, entra na compilacao por padrao mas fica sinalizado. Se existir
  a revisao exata, ela tem prioridade sobre o arquivo sem revisao.
- **Quantidade efetiva = qtd da linha x qtd de todos os pais.** Na BOM
  "CREHI MT005", `CREHS SM005` tem QTD 2 e os filhos QTD 1: a peca entra 2x.
  Somar a coluna crua daria lista de separacao curta.
- **Lista de materiais exige a planilha .xls/.xlsx.** No PDF o texto nao tem
  colunas e a quantidade encosta na descricao; a tela avisa em vez de gerar
  numero nao confiavel.
- **Nao precisa zipar a pasta** (duvida do Jhonatan): o seletor de pasta so
  enumera os arquivos; os bytes so sao lidos dos desenhos que a BOM pediu, no
  navegador. 658 PDFs = ~26 MB.

### Comandos relevantes
- `npx vitest run src/lib/pranchas` -> 28/28.
- `npx eslint src/lib/pranchas src/components/pranchas/PranchasClient.tsx` -> 0.
- `npx tsc --noEmit` -> 0 erros em pranchas.

### Pendencias / proximos passos
- **Commitado local, sem push.** Durante a sessao apareceram no working tree 15
  arquivos de `requisicoes` de outra frente em andamento (schema.prisma com
  `cancelada`, actions.ts, rbac.ts, migration nova, ExcluirRequisicao.tsx). O
  commit desta sessao inclui **so** os arquivos de pranchas + este log; a outra
  frente ficou intacta no working tree. O `tsc` acusa 17 erros e 2 testes falham
  **nessa** frente, porque o Prisma Client nao foi regenerado (`canceladaEm` = 0
  ocorrencias no client). Rodar `npx prisma generate` antes de fechar aquilo.
- Falta teste humano: compilar um conjunto de ponta a ponta com o Jhonatan.
- O formato antigo nao tem arquivo de desenho real aqui para validar o
  casamento fim a fim (so o BOM `C4MEC M01 R00`). Confirmar com o Lucas se
  desenho antigo ainda sera impresso por essa tela.

## 2026-07-21 - Requisicoes: excluir pedido (gestor da fabrica) + unidade de medida do Omie

### Resumo
Dois pedidos na tela de Requisicoes:
1. **Excluir requisicao** disponivel para o Gestor da Fabrica.
2. **Unidade de medida do produto** (a `unidade` do cadastro do Omie: KG, M3, UN...)
   aparecendo ao lado da quantidade, preenchida sozinha e bloqueada, so para
   mostrar em que unidade o item esta sendo pedido.

Escopo confirmado com o usuario antes de codar: exclusao e **soft delete**
(cancelamento com registro de quem excluiu e por que), liberada para o gestor da
fabrica em **qualquer status**.

### Arquivos criados
- `prisma/migrations/20260721190000_requisicao_cancelada_e_unidade/migration.sql`
  4 colunas em `Requisicao` (`cancelada`, `canceladaPorId`, `canceladaEm`,
  `motivoCancelamento`) + `unidade` em `RequisicaoItem` + FK para `User`.
- `src/components/requisicoes/ExcluirRequisicao.tsx` botao "Excluir" que abre um
  confirmar inline com motivo obrigatorio e o aviso de estoque ja baixado.

### Arquivos alterados
- `prisma/schema.prisma` campos acima + relacao `Cancelador` em `User`.
- `src/lib/estoque/omieEstoque.ts` `ProdutoEstoque.unidade` e `ProdutoResumo.unidade`,
  lidos de `registro.unidade` em `buscarProdutosPorCodigo` e nos dois caminhos de
  `buscarProdutosPorDescricao` (descricao e fallback por codigo). Zero chamada nova
  ao Omie: o campo ja vinha na mesma resposta de `ListarProdutos` e era descartado.
- `src/lib/contracts/requisicao.ts` `cancelarRequisicaoSchema` (motivo min 3, max 500).
- `src/lib/rbac.ts` `canCancelRequisicao`.
- `src/app/(app)/requisicoes/actions.ts` Server Action `cancelarRequisicao(id, motivo)`;
  `criarRequisicao` grava a `unidade`; `decidirRequisicao` e `arquivarRequisicao`
  recusam pedido ja excluido; relatorio carrega os campos novos.
- `src/app/(app)/requisicoes/page.tsx` coluna "Un." na tabela de itens, selo
  "Excluida (Confirmada)", linha com quem excluiu/motivo, botao de excluir nos dois
  paineis do gestor, filtros das listas.
- `src/components/requisicoes/CriarRequisicaoForm.tsx` campo de unidade `readOnly`
  + `disabled` ao lado da quantidade, preenchido ao escolher o produto.
- `src/components/requisicoes/ProdutoSkuField.tsx` `onPick` passa a unidade;
  unidade tambem aparece no dropdown de busca; `min-w-0` para a linha nao estourar
  no celular (agora sao 4 elementos na mesma linha).
- `src/lib/requisicoes/relatorio.ts` + `relatorioPdf.ts` `quantidadeComUnidade`,
  coluna "QTD / UN.", chip "excluidos" no resumo, linha de exclusao no bloco.
- Testes: `omieEstoque.test.ts` (+2), `relatorio.test.ts` (+2), `navigation.test.ts` (+1).

### Decisoes importantes
- **`cancelada` e uma FLAG, nao um status.** Primeira versao usava
  `status: "CANCELADA"`, mas isso apaga a informacao de quem tinha aprovado ou
  recusado o pedido antes. Virou booleano ortogonal (mesmo padrao do `arquivada`
  que ja existia), entao um pedido excluido preserva a decisao anterior e a tela
  mostra "Excluida (Confirmada)".
- **Excluir arquiva junto.** Reaproveita o filtro que ja existia: o pedido sai das
  listas do dia a dia e reaparece em "Ver arquivadas", sem painel novo.
- **Motivo obrigatorio.** Da para excluir pedido ja confirmado, cujos itens ja
  baixaram estoque no Omie, entao o registro precisa explicar o porque. Se pesar no
  dia a dia, e so afrouxar o `min(3)` no `cancelarRequisicaoSchema`.
- **Exclusao NAO estorna estoque no Omie.** O aviso aparece no confirmar (com a
  contagem de itens ja baixados), na mensagem de sucesso e na auditoria.
- **Unidade e copiada na criacao, nao lida na hora de exibir.** O cadastro do Omie
  pode mudar depois; o pedido tem que mostrar a unidade em que foi feito. Itens
  criados antes desta mudanca ficam com `unidade` null e a tela mostra "-".
- **Unidade nao vai no payload do cliente.** O form so exibe; o servidor le a
  unidade do Omie de novo na criacao (o cliente nao define esse dado).
- **`min-w-0` no ProdutoSkuField.** Input tem largura intrinseca de ~20 caracteres,
  o que trava o encolhimento do flex item e estouraria a linha no mobile.

### Comandos relevantes
- `npx prisma generate` (obrigatorio: o client estava desatualizado, era a causa
  dos 17 erros de tsc anotados na pendencia da sessao anterior).
- `npx tsc --noEmit` -> 0. `npx eslint src` -> 0. `npm run test` -> 27 arquivos,
  319 testes passando. `npm run build` -> sucesso.

### Correcao no mesmo dia (apos teste do usuario em producao)
Excluida ainda aparecia em "Meus pedidos" (print do REQ-0008 "Excluida (Recusada)").
Eu tinha deixado de proposito, pro solicitante entender por que o pedido sumiu;
o usuario decidiu que excluida **nao aparece em tela nenhuma**, e so no banco,
na auditoria e no relatorio PDF.
- `src/app/(app)/requisicoes/page.tsx`: constante `VISIVEL = { cancelada: false }`
  espalhada nas 4 buscas da tela (minhas, pendentes, decididas, arquivadas), pra
  lista nova nao esquecer o filtro. Removi o que virou codigo morto: linha
  "Excluida por ... em ... motivo", o include de `canceladaPor` e o ramo que
  escondia o botao de desarquivar. `decididaRecentemente` voltou ao original.
- Mantive de proposito o ramo de excluida no `selo()`: e rede de seguranca. Se
  alguma busca futura esquecer o `VISIVEL`, o pedido aparece marcado
  "Excluida (Recusada)" em vermelho em vez de se passar por pedido normal.

### Pendencias / proximos passos
- **Migration ainda NAO aplicada no banco.** Ela roda sozinha no deploy
  (`vercel-build` = `prisma migrate deploy`). Nao rodei `prisma migrate dev` aqui
  para nao tocar o banco de producao.
- **Falta validar com produto real do Omie** que o campo `unidade` vem preenchido
  para os itens de KG/M3. Atencao: produto cadastrado pelo proprio Vital Ops sai
  com `UNIDADE_FIXA = "UN"` (`src/lib/produtos/envioOmie.ts`); KG/M3 so aparecem em
  produto cadastrado direto no Omie.
- **Bug pre-existente, fora do escopo:** ~30 usos de `text-destructive` /
  `bg-destructive` em 12 arquivos nao correspondem a nenhum token do tema. O
  `globals.css` define `--color-danger`, nao `destructive`, entao essas mensagens de
  erro nao ficam vermelhas: herdam a cor do pai. Meus arquivos novos usam `danger`.
  Vale uma troca em massa `destructive` -> `danger` numa proxima passada.

## 2026-07-21 (parte 3) - Aviso de versao nova (modal + botao no cabecalho)

### Resumo
Quando sobe versao nova, quem esta com a aba aberta passa a ser avisado. Dois
sinais separados, de proposito:
- **Changelog novo** (alguem escreveu novidade em `src/lib/changelog.ts`):
  modal com o que mudou, o mesmo texto da /novidades.
- **Build novo sem changelog** (correcao pequena): sem modal, so um botao
  discreto de recarregar ao lado do sino, com bolinha.
O botao do cabecalho tambem e a saida de quem fechou o modal em "Agora nao".

### Arquivos alterados/criados
- `next.config.ts` - `env.NEXT_PUBLIC_BUILD` a partir de `VERCEL_GIT_COMMIT_SHA`
  (inlinado no bundle no build; em dev fica "dev" e o aviso nunca dispara).
- `src/lib/versao.ts` (novo) - `BUILD_ATUAL`, contrato da resposta e o tipo
  `EstadoAtualizacao` (atual | silenciosa | novidade).
- `src/lib/changelog.ts` - `versaoDaEntrada()`, `VERSAO_ATUAL`,
  `novidadesDesde()`. Mais as entradas de changelog do Pranchas e deste aviso.
- `src/app/api/versao/route.ts` (novo) - `force-dynamic` + `no-store`,
  auth-gate no padrao de `api/auth/me`.
- `src/components/NovaVersao.tsx` (novo) - `useNovaVersao()`,
  `<BotaoAtualizar>`, `<NovaVersaoModal>` e `recarregarLimpo()`.
- `src/components/AppShell.tsx` - hook chamado uma vez, alimentando o botao
  (ao lado do sino) e o modal (junto do `<Tutorial>`).
- `src/lib/changelog.test.ts` - 6 testes novos.

### Decisoes importantes
- **Gatilho do modal e o changelog, nao o commit.** Amarrar ao SHA faria todo
  push disparar modal sem ter o que mostrar. O comentario no topo do
  changelog.ts ja obriga entrada nova por entrega, entao a disciplina existe.
- **Versao derivada de (data + titulo), sem campo `version` manual.** Campo
  manual esquecido falha em SILENCIO (o aviso some e ninguem descobre). Tem
  teste garantindo que nao ha versao duplicada.
- **Quem monta a lista de novidades e o SERVIDOR.** O navegador que precisa do
  aviso esta com o bundle antigo e nao tem as entradas novas no CHANGELOG dele.
  Por isso a rota recebe `?desde=` e devolve as entradas.
- **Modal nao prende.** Recarregar no meio do Configurador (sem rascunho) ou com
  a pasta de 658 PDFs carregada no Pranchas jogaria trabalho fora.
- **Nao existe Ctrl+Shift+R programatico.** `location.reload(true)` foi
  descontinuado e e ignorado. `recarregarLimpo()` desregistra service worker e
  limpa Cache Storage antes do reload; como os assets do Next tem hash no nome,
  o efeito e equivalente.
- Primeira checagem 10s apos montar (nao disputa rede com o carregamento),
  depois a cada 3 min, mais uma checagem quando a aba volta ao foco.

### Comandos relevantes
- `npx tsc --noEmit` -> 0. `npx eslint <arquivos>` -> 0.
- `npx vitest run` -> 325/325 (27 arquivos).
- `npx next build` -> OK; /api/versao sai como dinamica.

### Pendencias / proximos passos
- **ATENCAO - Skew Protection da Vercel.** Se estiver ligada no projeto, ela
  roteia a requisicao do cliente antigo de volta para o deploy antigo. A rota
  /api/versao devolveria a versao velha e o aviso NUNCA apareceria. Conferir no
  painel da Vercel (Settings > Advanced/Deployment Protection). Se estiver
  ligada, trocar a fonte da versao por algo fora do deploy.
- **O primeiro deploy nao avisa ninguem.** Quem ja esta com a aba aberta nao tem
  o verificador no bundle. Do proximo deploy em diante funciona.
- Falta teste humano: subir duas versoes seguidas e ver o modal aparecer.
- O changelog do Pranchas foi escrito agora; a entrega anterior tinha ficado
  sem entrada em /novidades.

## 2026-07-21 (parte 4) - Modo brilho escondido (easter egg da logo)

### Resumo
Pedido: estilizar o Vital Ops com animacoes profissionais (topo, barra lateral,
fundo e botoes) que a pessoa liga se quiser. No meio da sessao o usuario trocou
o botao visivel por um easter egg: DOIS CLIQUES rapidos na logo do cabecalho
ligam/desligam o "modo brilho". A escolha persiste por navegador (localStorage
`vs-sparkle` -> atributo `data-sparkle` no `<html>`, reaplicado antes do
primeiro paint pelo mesmo script do tema). Por pedido explicito, NADA foi
escrito no changelog (/novidades): o modo e segredo.

O que o modo liga (tudo CSS puro, escopado em `:root[data-sparkle="on"]`):
- Fundo: "aurora" fixa no topo da tela (3 brilhos radiais petroleo/turquesa/
  agua deslocando devagar, mask esvaindo pra baixo). Sem as bolhas do login
  (o usuario nao gosta delas).
- Header: fio de 2px com gradiente da marca deslizando na borda inferior,
  titulo "Vital Ops" com gradiente + brilho que vai e volta, halo pulsando
  atras da logo.
- Barra lateral: entrada em cascata (35ms por item), barrinha turquesa que
  DESLIZA ate o item ativo ao navegar, glow + gradiente animado no ativo,
  "pop" no icone e 2px de deslocamento no hover.
- Botoes: micro-lift (sobe 1px no hover, afunda no clique) em todos; gradiente
  animado + reflexo diagonal ("shine") no hover dos primarios.
- Burst de 8 estrelinhas (Sparkles/lucide) saindo da logo ao ligar.

### Arquivos alterados
- `src/app/globals.css` - secao "Modo brilho" inteira: keyframes vs-*,
  variaveis `--sparkle-grad-acao`/`--sparkle-grad-titulo` por tema, e bloco
  `prefers-reduced-motion` desligando tudo.
- `src/app/layout.tsx` - `THEME_INIT` tambem aplica `data-sparkle` antes do
  primeiro paint.
- `src/components/AppShell.tsx` - a logo saiu do `<Link>` e virou botao com
  detector de clique duplo (400ms) + burst; classes `app-header`/`app-title`/
  `app-logo`/`nav-item`; barrinha `.nav-glide` posicionada por medicao real
  (offsetTop/offsetHeight do item ativo, remedida em pathname/mobileOpen).
  O caminho pra home continua no titulo "Vital Ops" ao lado da logo.

### Decisoes importantes
- **Logo fora do Link**: clique duplo em link navegaria no primeiro clique;
  agora um clique na logo nao faz nada (o titulo ao lado leva pra home).
- **`[class~="bg-primary"]`** casa so o token exato (nao pega `bg-primary/10`
  de chips) e `:is(button, a)`: spans (badge do sino, bolinhas do Tutorial)
  ficam de fora. `:not(:disabled)` preserva o visual de desabilitado
  (`disabled:bg-muted` continuaria escondido atras do gradiente sem isso).
- **Cascata com `animation-fill-mode: backwards`** (nao forwards/both):
  forwards travaria o `transform` no fim da animacao e mataria o hover.
- **Contraste**: gradiente de acao termina no teal no claro (texto branco
  >= 4.5:1) e vai de turquesa a agua no escuro (texto escuro). Titulo passa
  pelo turquesa so numa faixa estreita do gradiente.
- **Transicao de pagina intocada** (fade puro sem deslocamento, escolha
  registrada no proprio globals.css).
- Animacoes so de transform/opacity/background-position; com o modo desligado
  nenhuma regra se aplica e o app fica identico ao de antes.

### Comandos relevantes
- `npx tsc --noEmit` e `npx eslint` nos arquivos alterados (ver abaixo).

### Ajustes na mesma sessao (feedback apos teste do usuario)
1. **Barra lateral estava sutil demais; usuario pediu as cores da interface
   nova do app do Gemini.** Entraram `--gem-azul #3e6de8`, `--gem-roxo #8b5cd6`
   e `--gem-rosa #cc5069` (o degrade do Gemini levemente escurecido pra texto
   branco ficar legivel). Aplicadas no item ativo da navegacao (degrade animado
   + glow roxo + texto branco forcado, porque no escuro o
   text-primary-foreground e escuro), na barrinha deslizante (4px, era 3px),
   numa lavagem de gradiente no hover dos itens inativos, e nos botoes
   primarios (degrade + glow, hover com glow maior). Aurora do fundo, fio do
   header e titulo continuam nas cores da marca.
2. **Flash no texto do item ao clicar na barra lateral.** Causa: ao trocar o
   ativo, a lista de `animation` do item mudava ([vs-nav-in] <-> [vs-grad-slide])
   e o navegador reiniciava a entrada em cascata (item sumia e reaparecia).
   Correcao: itens de navegacao sairam da regra generica de `bg-primary`
   (`:not(.nav-item)`) e o `.nav-item-active` mantem `vs-nav-in` NA MESMA
   POSICAO da lista da regra `.nav-item`; só a `vs-grad-slide` entra/sai e a
   entrada nao reinicia.
3. **Shine removido de tudo.** O reflexo branco atravessando a escrita ficou
   feio (lateral e botoes). Sairam o ::before, a keyframe vs-shine e o
   overflow:hidden/position:relative que so existiam por causa dele.

### Segundo ajuste na mesma sessao (o pedido era outro, KKKK do usuario)
Eu tinha entendido errado: as cores do Gemini eram SO para o FUNDO DA BARRA
LATERAL. O verde da marca ("o verdinho tava legal") voltou para o item ativo,
barrinha deslizante (3px turquesa/agua) e botoes primarios, exatamente como na
v1 (sem glow roxo, sem texto branco forcado). O fundo do `<aside>`
(classe `app-aside`) ganhou uma lavagem com o degrade Gemini (azul 16% ->
roxo 14% -> rosa 12% sobre o bg-card) deslizando devagar na vertical
(vs-grad-slide-y, 14s). Aurora do fundo da tela segue teal, como sempre foi.

### Bug "a barra lateral retrai ao trocar de tela" (corrigido de vez)
Com o modo ligado, TODA navegacao re-executava a cascata de entrada dos itens
(sumiam e deslizavam de novo = a barra parecia retrair). Correcao estrutural:
a cascata (vs-nav-in) saiu do caminho permanente e so roda sob o atributo
`data-sparkle-reveal`, que o AppShell poe no `<html>` NO INSTANTE em que o
modo e ligado e remove ~1,2s depois. Trocar de tela, abrir o menu mobile ou
remontar o shell nao reanima mais item nenhum; no item ativo so entra/sai a
vs-grad-slide (fundo), que nao mexe em posicao/opacidade do texto.

### Terceiro ajuste na mesma sessao: o fundo da barra virou um MAR verde
O usuario trocou o degrade Gemini do fundo da barra por agua verde da marca
que se comporta como oceano: cada clique de navegacao agita e SOBE a mare;
clicando rapido ela acumula e sobe alto, parado ela desce sozinha ate a base.
- AppShell: estado `nivelAgua` (base 10%, max 40%; +10 por clique nos itens da
  nav, -2,5 a cada 400ms ate voltar a base). O valor vira `--agua-nivel` num
  span `.agua` dentro de `.agua-clip` (overflow hidden pra onda gigante nao
  criar barra de rolagem; o nav e relative e pinta por cima).
- CSS: `.agua` e uma camada de altura total transladada em Y pelo nivel
  (transition com bezier de leve estouro = a subida "quica" como marolada).
  As ondas sao ::before/::after gigantes (300% de largura, border-radius
  47%/45%) girando em sentidos opostos (13s/19s); a borda que cruza a linha
  d'agua ondula. Cor = color-mix do teal/turquesa com --card (funciona nos
  dois temas sem regra extra). Sairam as cores/vars do Gemini e a lavagem
  vs-grad-slide-y; prefers-reduced-motion para o giro e a transicao do nivel.

### Quarto ajuste (feedback: "so faz um movimento" e agua alta demais)
- Mar mais vivo: cada onda agora soma DOIS movimentos, o giro (borda
  ondulando) e um balanco vertical (marulho) em keyframes proprios
  (agua-boia-tras 9,5s / agua-boia-frente 6,5s), com duracoes que nao sao
  multiplas entre si; as fases nunca coincidem e o movimento nao se repete
  igual. Onda da frente ficou um pouco mais "brava" (border-radius 44%).
  O translate estatico dos pseudos virou fallback do prefers-reduced-motion
  (sem ele, com animation none, a onda perderia o centro da linha d'agua).
- Agua mais baixa (pedido: ~25% menos): base 10 -> 8, teto 40 -> 30,
  ganho por clique 10 -> 7. Descida continua 2,5 a cada 400ms.

### Pendencias / proximos passos
- Falta teste humano: ligar o modo (2 cliques na logo), navegar rapido varias
  vezes e ver a mare subir/descer; conferir claro/escuro e mobile; confirmar
  que a barra nao "retrai" mais ao navegar. Ajustar base/max/velocidade da
  mare ou a amplitude das ondas se precisar.
- O diff de outra frente (ConfiguracaoCard.tsx + entrada de changelog de
  Projetos) continua no working tree, FORA deste commit.

---

## 2026-07-22 - Requisicoes: fila "Itens com falha" + reprocessar a baixa em outro local

### Resumo
Pedido do Victor a partir da REQ-0009 (confirmada por Daniel em 22/07, dois itens
em falha: PRD02486 e PRD08238, ambos "Saldo insuficiente neste local de estoque:
disponivel 0, pedido 1"). Duas coisas: (1) o pedido com item falho tem que
APARECER pro gestor da fabrica e pro gestor; (2) eles precisam poder trocar o
local de estoque de cada item (ou de todos de uma vez) e mandar lancar de novo.

Buraco real que isso fecha: `decidirRequisicao` so aceita `status === "PENDENTE"`,
e a confirmacao marca o pedido como CONFIRMADA mesmo com itens em FALHA (o
contador de falhas era so informativo). Ou seja: item que falhava numa confirmacao
ficava TRAVADO pra sempre, sem nenhuma UI de retentativa. A unica saida era
excluir o pedido (que nao estorna nada) e refazer. So o caminho de INTERRUPCAO
(bloqueio Omie / pausa de seguranca) preservava o PENDENTE e permitia retomar.

### O que entrou
- **Painel "Itens com falha (N)"** na tela de Requisicoes, logo abaixo de
  "Aguardando decisao", visivel pra quem decide (ADMIN | GESTOR | FABRICA_GESTOR).
  Lista pedidos CONFIRMADA, nao arquivados, com pelo menos um item em FALHA,
  do mais antigo pro mais novo.
- **Botao "Tentar baixar de novo (N itens)"** em cada cartao. Abre um form com:
  seletor de local pra tentativa inteira, checkbox opcional "escolher o local por
  item" (mesmos campos `localItem__<id>` da confirmacao) e a lista dos itens
  falhos com o motivo do erro de cada um.
- **Server Action `reprocessarItensRequisicao`**: reenvia SO os itens em FALHA,
  no(s) local(is) escolhido(s). Item que sai vira BAIXADO + MovimentoEstoque;
  item que falha de novo continua FALHA com o motivo ATUALIZADO.

### Arquivos alterados/criados
- `src/lib/contracts/requisicao.ts` - `reprocessarRequisicaoSchema` (id +
  localCodigo opcional, mesmo regex `/^\d{1,15}$/` do resto).
- `src/app/(app)/requisicoes/actions.ts`:
  - novo helper privado `executarBaixaPorLocal(itens, localPorItem, obs)` com o
    miolo que a confirmacao e o reprocessamento compartilham: agrupa por local,
    le produtos/saldos/lotes uma vez por local, baixa grupo a grupo, devolve
    `{resultado, nomesPorLocal}` ou `{ok:false, erro}`.
  - `decidirRequisicao` passou a usar o helper (mesmo comportamento, ~90 linhas
    a menos duplicadas).
  - nova action `reprocessarItensRequisicao`.
- `src/components/requisicoes/ReprocessarItens.tsx` (novo) - o form, fechado por
  padrao pra nao poluir o cartao.
- `src/app/(app)/requisicoes/page.tsx` - constante `TEM_ITEM_COM_FALHA`, nova
  busca `comFalha`, painel novo, exclusao dos mesmos pedidos de "Decididas
  recentemente" (`NOT: TEM_ITEM_COM_FALHA`) e passo 4 do "Como funciona"
  reescrito (agora explica o que acontece quando um item falha).

### Decisoes importantes
- **Nao e uma re-decisao, e uma nova tentativa de EXECUCAO.** O pedido continua
  CONFIRMADA e a decisao original (gestor, data, motivo) fica intacta. Por isso
  action separada em vez de afrouxar o guard de `decidirRequisicao`: reabrir a
  decisao de um pedido confirmado sobrescreveria `gestorId`/`decididaEm` e
  bagunçaria o historico.
- **So itens FALHA entram.** Os BAIXADO nem sao lidos, entao nao existe risco de
  baixar duas vezes por descuido de filtro. E o `cod_int_ajuste` continua sendo o
  id do RequisicaoItem, entao se a baixa original TINHA entrado no Omie sem a
  gente saber, o Omie devolve duplicado e o item vira "ja baixado" em vez de
  duplicar a saida.
- **Motivo do erro sempre atualizado** no reprocessamento, inclusive no
  `nao_baixado` (interrupcao antes de chegar no item). Sem isso o gestor leria o
  erro da rodada passada achando que era o desta.
- **Pedido com falha sai de "Decididas recentemente".** O mesmo cartao em duas
  listas, uma com botao de reprocessar e outra sem, confunde. E "Decididas"
  pegava so os 15 mais recentes, entao um pedido travado sumiria da tela com o
  tempo; a fila nova nao tem esse limite pratico (take 100).
- **Arquivar e excluir continuam no cartao da fila nova**: e a saida pra quem
  resolveu por fora (baixou na mao no Omie) ou pra item que nao vai sair mesmo.
  Arquivar tira da fila sem apagar nada.
- **Persistencia do local do pedido subiu pra antes da leitura de saldo** em
  `decidirRequisicao` (efeito do refactor). Diferenca so no caminho de erro: se a
  leitura do Omie falhar, o pedido ja fica com `localEstoqueCodigo` gravado. Como
  ele segue PENDENTE e o campo so serve de default pra proxima tentativa, o
  efeito e ate melhor (a tela ja sugere o local que o gestor tinha escolhido).
- Sem teste unitario novo: a logica pura envolvida (`localEfetivo`,
  `agruparPorLocal`) ja e coberta por `locaisPorItem.test.ts`, e o projeto nao
  testa Server Actions (convencao: so `lib/` puro).

### Comandos relevantes
- `npx tsc --noEmit` -> OK
- `npx eslint` nos 4 arquivos alterados -> OK
- `npm test` -> 27 arquivos, 325 testes, todos passando
- `npm run build` -> OK (rota /requisicoes no output)
- Script temporario com `tsx` batendo no banco (SELECT puro) pra validar os
  filtros Prisma novos: `comFalha` devolveu exatamente a REQ-0009 com
  PRD02486 + PRD08238, e a REQ-0010 (sem falha) ficou em "Decididas".

### Pendencias / proximos passos
1. **Teste humano**: entrar como Daniel (FABRICA_GESTOR), ver a REQ-0009 no
   painel novo, trocar o local dos dois itens pro estoque que tem o material e
   mandar baixar. Conferir que os itens viram "baixado" com o local certo e que
   o pedido some da fila.
2. **Deploy**: nao ha migration nova (nenhuma mudanca de schema), entao e so o
   build da Vercel.
3. ~~Ideia pra depois: mostrar o saldo POR LOCAL de cada item falho.~~ FEITO na
   mesma sessao, ver abaixo.

---

## 2026-07-22 (continuacao) - Saldo por local no form de reprocessar

### Resumo
Victor pediu na sequencia: "podia mostrar quanto tem cada estoque, a medida que
ele for trocando o estoque do lado dos produtos". Eu tinha deixado isso de fora
alegando custo de ban no Omie. **Revisei e o custo estava superestimado**: o
`chamar` cacheia leitura por 60s (DEFAULT_TTL_SECONDS) e `saldosPorCodigo` manda
`cExibeTodos: "S"`, que faz local zerado voltar 0 SEM virar fault. Ou seja, sao
leituras BEM-SUCEDIDAS, e o orcamento de bloqueio conta chamada INCORRETA (§6).

Com isso, em vez do que foi pedido (saldo do local selecionado, atualizando a
cada troca), entregei o superset: **o saldo de cada item em TODOS os locais de
uma vez**, numa tabela. O gestor ve na hora onde esta o material em vez de ir
trocando o seletor pra descobrir. Mesmo custo (4 locais = 4 leituras em lote).

### Arquivos alterados/criados
- `src/app/(app)/requisicoes/actions.ts` - action nova `saldosPorLocalDosItens`
  (SO LEITURA, guard `canDecideRequisicao`): le os locais, faz uma
  `ListarPosEstoque` em lote por local pros SKUs em FALHA e devolve
  `{locais, itens:[{sku, descricao, quantidade, saldos:{codigoLocal: saldo}}]}`.
  Best-effort: qualquer erro vira `ok:false` e a tela segue funcionando sem os
  numeros. Novo import de `locaisDisponiveis`.
- `src/components/requisicoes/ReprocessarItens.tsx` - subcomponente
  `SaldoPorLocal` (tabela: uma linha por item, uma coluna por local, "Precisa" ao
  lado; verde/semibold onde o saldo COBRE a quantidade) + botao "Atualizar".

### Decisoes importantes
- **Leitura disparada no EVENTO (clique que abre o form), nao em `useEffect`.**
  Primeira versao usava effect e o eslint do React Compiler barrou
  (`react-hooks/set-state-in-effect`): "calling setState synchronously within an
  effect can trigger cascading renders". A regra esta certa aqui, abrir o painel
  e acao do usuario, nao sincronizacao com sistema externo. Virou
  `useTransition` + handler.
- **Verde = saldo cobre a quantidade do item**, que e exatamente a conta que
  `baixarEstoque` refaz antes de chamar o Omie. Entao o que aparece verde e o que
  deve passar na baixa.
- **Ressalva escrita na tela**: produto com controle de lote pode ter parte do
  saldo reservada em pedidos/OPs (o `nQuantDisponivel` do lote e menor que o
  `nSaldo` do local), entao a baixa ainda pode recusar. Nao inventamos precisao
  que a leitura de saldo nao tem.

### Comandos relevantes
- `npx tsc --noEmit`, `npx eslint`, `npm test` (325 testes), `npm run build` -> OK
- Script temporario `tsx` (SO leitura) batendo no Omie de verdade com os SKUs da
  REQ-0009. Resultado, que ja explica a falha do dia:

  | SKU | Padrao | Materia-Prima | Locacao | Reservado Licitacao |
  |---|---|---|---|---|
  | PRD02486 | 0 | **4** | 0 | 0 |
  | PRD08238 | 0 | **2** | 0 | 0 |

  A baixa foi tentada no Local de Estoque Padrao, onde os dois estao zerados. O
  material esta no Estoque de Materia-Prima. Com a tabela nova isso fica obvio
  antes de tentar.

### Pendencias / proximos passos
- Segue valendo o teste humano da entrada anterior. Agora com um resultado
  esperado concreto: abrir a REQ-0009, ver 4 e 2 em verde na coluna
  "Estoque de Materia - Prima", escolher esse local e os dois itens devem baixar.
- Os 4 locais cabem na tabela; se a empresa cadastrar muitos locais, a tabela
  rola na horizontal (overflow-x-auto). Se virar problema, filtrar pra mostrar so
  os locais com saldo > 0.

---

## 2026-07-22 (continuacao 2) - Correcao: o seletor vinha no local que TINHA FALHADO

### Resumo
Victor reportou a REQ-0011 (PRD00063 STRETCH S/ TUBET, 16 KG): "troco de estoque
e continua isso, disponivel 0, pedido 16. ta certo? todos vir com 0?".

Diagnostico feito no Omie e na auditoria, nao no chute:
- O produto TEM 168 KG, mas no `Estoque de Materia - Prima` (5940905787).
  No `Local de Estoque Padrao` (5702636851) ele tem 0. A mensagem estava CERTA.
- Auditoria da REQ-0011 (horarios BRT):
  - 10:14 confirmada no Local de Estoque Padrao -> 0 baixados, 1 falha
  - 10:15 reprocessar **no Local de Estoque Padrao** -> 0 baixados, ainda falha
  - 10:19 reprocessar no Estoque de Materia - Prima -> **1 baixado**
    (omieRef 12140825940)

Ou seja: o fluxo funciona, e o item ja esta baixado. Mas a tentativa das 10:15
rodou no MESMO local que tinha acabado de falhar, e isso e culpa de uma escolha
minha: eu fiz o seletor vir marcado em `requisicao.localEstoqueCodigo`, que e
exatamente o local onde a baixa falhou. Quem abre e clica repete o erro.

Padrao mais amplo que isso revelou: o Local de Estoque Padrao da empresa e
praticamente vazio; o material real fica no Estoque de Materia - Prima. Entao
TODO pedido confirmado no padrao falha com "disponivel 0". Vale rever qual local
o gestor escolhe na CONFIRMACAO (hoje o default e o padrao do Omie).

### Arquivos alterados/criados
- `src/lib/requisicoes/saldoLocais.ts` (novo) - logica pura: `itensCobertos`
  (quantos itens o local atende, saldo >= quantidade, a MESMA conta do
  `baixarEstoque`) e `localQueCobreTudo` (primeiro local que atende todos).
- `src/lib/requisicoes/saldoLocais.test.ts` (novo) - 7 testes, incluindo o caso
  real da REQ-0011 e o caso "nenhum local sozinho da conta".
- `src/components/requisicoes/ReprocessarItens.tsx`:
  - seletor virou CONTROLADO (`localEscolhido`). O local salvo no pedido e so o
    ponto de partida; quando o saldo chega, ele **pula sozinho** pro local que
    atende todos os itens.
  - opcoes do seletor do lote ganharam `· N/M com saldo`; as do seletor POR ITEM
    ganharam `· saldo X` (no item, o que importa e o saldo daquele item).

### Decisoes importantes
- **Auto-selecao dentro do handler, nao em `useEffect`.** A leitura ja roda numa
  `useTransition` disparada pelo clique, entao o `setLocalEscolhido` acontece no
  mesmo lugar, sem esbarrar no `react-hooks/set-state-in-effect`.
- **Nenhum local cobre tudo -> nao mexe na selecao.** Nao ha resposta certa
  automatica (o gestor pode querer local por item, ou acertar o saldo no Omie
  antes); forcar uma escolha esconderia o problema.
- **Empate resolvido pela ordem dos locais** (o primeiro que cobre vence), com
  teste fixando isso pra nao virar comportamento acidental.

### Comandos relevantes
- `npx tsc --noEmit`, `npx eslint`, `npm test` (28 arquivos, 332 testes),
  `npm run build` -> tudo OK
- Diagnostico feito com scripts `tsx` temporarios (SO leitura): `ListarPosEstoque`
  cru do PRD00063 nos 4 locais + dump da REQ-0011 e do AuditLog dela.

### Pendencias / proximos passos
1. A REQ-0011 ja esta resolvida (item baixado 10:19). Nada a fazer nela.
2. **Rever o default do local na CONFIRMACAO** (`DecidirRequisicao`): hoje cai no
   local padrao do Omie, que e o vazio. Se a regra da empresa for "requisicao de
   fabrica sai da Materia-Prima", vale mudar o default ali e evitar a falha na
   origem, em vez de so facilitar o conserto depois.
3. Perguntar ao Victor se existe regra fixa de qual local atende requisicao de
   fabrica, ou se depende do item.
