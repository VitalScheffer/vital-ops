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

// A política de conteúdo (CSP) NÃO mora aqui: ela carrega um nonce novo a cada
// resposta, então é montada por request no proxy (src/proxy.ts + src/lib/csp.ts).
// Aqui ficam só os cabeçalhos que são iguais em toda resposta.
//
// Cabeçalhos de segurança aplicados a TODA resposta. A Vercel já termina o TLS
// e redireciona HTTP para HTTPS; o HSTS abaixo declara isso para o navegador,
// que passa a nem tentar a versão insegura.
const CABECALHOS_SEGURANCA = [
  // Nunca adivinhar o tipo do conteúdo pelo que tem dentro.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ninguém embute esta aplicação em iframe (clickjacking). Vale para quem nos
  // embute; o iframe que a tela de pranchas cria é `blob:` da própria página e
  // não passa por aqui.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Câmera liberada só para a origem, porque o "ver no meu espaço" (AR) usa a
  // câmera do celular. O resto fica desligado.
  {
    key: "Permissions-Policy",
    value: "camera=(self), xr-spatial-tracking=(self), microphone=(), geolocation=(), payment=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: CABECALHOS_SEGURANCA }];
  },
  // Prisma 7 (driver adapter pg) roda no servidor; não deve
  // ser empacotado pelo bundler das Server Components/Route Handlers.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // O model-viewer (AR) é publicado como ES module moderno com sintaxe que o
  // Next precisa transpilar para não quebrar em navegadores mais antigos.
  transpilePackages: ["@google/model-viewer"],
  env: {
    NEXT_PUBLIC_BUILD: BUILD,
  },
};

export default nextConfig;
