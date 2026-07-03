This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backend (Fase 1 — Fundação)

Plataforma interna de operações da Vital Scheffer. Stack: Next.js 16 (App Router)
+ Prisma 7 + PostgreSQL (Neon) + Auth.js v5 (login interno e-mail + senha) + client
Omie próprio.

### Setup

1. Copie `.env.example` para `.env`, preencha `AUTH_SECRET` (`openssl rand -base64 32`)
   e `DATABASE_URL` com a connection string do Postgres (em dev, um projeto Neon
   gratuito funciona bem; em produção, Neon/Vercel Postgres/Supabase).
2. Instale dependências: `npm install` (roda `prisma generate` no `postinstall`).
3. Aplique as migrations: `npm run db:migrate` (usa o histórico em `prisma/migrations`).
4. Semeie os usuários e permissões padrão: `npm run db:seed`.
5. Suba o app: `npm run dev` → http://localhost:3000.
6. Verde: `npm test`, `npm run lint`, `npx tsc --noEmit`.

**Logins padrão (dev):**

| Papel | E-mail | Senha |
|---|---|---|
| ADMIN | `admin@vitalscheffer.com.br` | `vital123` |
| GESTOR | `gestor@vitalscheffer.com.br` | `vital123` |

### Banco de dados

Roda em **PostgreSQL** (Neon serverless em dev e produção — sem instalar servidor
local). Prisma 7: a URL de conexão fica em `prisma.config.ts` (migrate) e o runtime
usa o **driver adapter** `@prisma/adapter-pg` em `src/lib/db.ts`. Papel/status são
`String` (sem enum nativo — valores validados no zod dos contratos,
`src/lib/contracts`). Permissões por papel × módulo ficam em `RolePermission`
(configuráveis por um ADMIN em `/configuracoes`). O seed (`prisma/seed.ts`) cria
ADMIN, GESTOR e as permissões padrão de forma idempotente. No deploy (Vercel), o
build roda `prisma migrate deploy` (script `vercel-build`) — nunca `migrate dev`
em produção.

### Variáveis de ambiente

| Chave | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL (Neon) — migrate + runtime |
| `AUTH_SECRET` | assina a sessão JWT (`openssl rand -base64 32`) |
| `AUTH_URL` | base da app em dev (`http://localhost:3000`) |
| `OMIE_APP_KEY` / `OMIE_APP_SECRET` | credenciais próprias do Omie |
| `OMIE_BASE_URL` | base da API Omie (default oficial) |
| `OMIE_TIMEOUT_MS` | opcional, timeout das chamadas (default 20000) |

### Autenticação e proteção de rotas

- Login interno por **e-mail + senha** (provider Credentials do Auth.js), **restrito
  a `@vitalscheffer.com.br`**. O `authorize` (`src/lib/auth.ts`) valida domínio,
  existência/atividade do usuário e a senha (`bcrypt.compare`). O admin define a
  senha inicial ao criar o usuário em `/usuarios`. Config edge-safe em
  `src/lib/auth.config.ts`; instância Node (Credentials + papel/id no JWT) em
  `src/lib/auth.ts`. Helper `auth()` exportado de `src/lib/auth.ts`.
- No Next.js 16 o `middleware` virou **`proxy`** — `src/proxy.ts` protege tudo
  exceto `/login` e `/api/auth`. Sessão via JWT (`session.user.id` e `.role`).

### Contratos, rotas e o client Omie (para o frontend)

- **Contratos** (tipos + zod) em `src/lib/contracts/` — importe de `@/lib/contracts`:
  `roleSchema`, `userSchema`, `meResponseSchema`, `MeResponse`, `produtoItemSchema`,
  `estruturaItemSchema`, `requisicaoSchema`, `criarRequisicaoSchema`, `ApiError`,
  `ApiResult<T>`.
- **Rotas** (`src/app/api/`): `GET /api/auth/me` (usuário + papel + setores),
  `[...nextauth]` (login/logout). Stubs 501 documentados: `/api/produtos/imports`
  (Fase 2) e `/api/requisicoes` (Fase 3).
- **Auditoria**: helper `audit({ actor, action, entity, entityId, summary, before?,
  after?, omieTarget?, req })` em `src/lib/audit.ts` — chame em toda mutation.
- **Client Omie** em `src/lib/omie/`: `chamar(path, call, param, { write })` com
  breaker (soft 6/2min + hard) + cache (TTL ≥ 60s) + classificação por
  `faultstring`. Erros tipados `OmieBlocked` / `OmieDuplicate` / `OmieError`.
  Lógica pura (`taxonomy`, `breaker`) coberta por testes em `src/lib/omie/__tests__`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
