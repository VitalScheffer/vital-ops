import type { NextConfig } from "next";

// Identidade deste build, usada pelo aviso de atualização (ver
// src/lib/versao.ts). Fica em `env` para ser INLINADA no bundle no momento do
// build: assim o navegador carrega o valor do build dele, e a rota /api/versao,
// que roda no deploy novo, devolve o valor novo. A diferença entre os dois é o
// próprio sinal de "esta aba está com código velho".
//
// Na Vercel, VERCEL_GIT_COMMIT_SHA muda a cada deploy. Em desenvolvimento fica
// "dev" nos dois lados, então o aviso nunca dispara rodando local.
const BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_DEPLOYMENT_ID ?? "dev";

const nextConfig: NextConfig = {
  // Prisma 7 (driver adapter pg) roda no servidor; não deve
  // ser empacotado pelo bundler das Server Components/Route Handlers.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  env: {
    NEXT_PUBLIC_BUILD: BUILD,
  },
};

export default nextConfig;
