import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Proxy = "middleware" no Next.js 16 (renomeado). Protege tudo exceto /login e
// /api/auth. Usa só a config edge-safe (sem Prisma): a decisão é pela presença
// de sessão (callback `authorized`); a autorização fina fica nas rotas/ações.
export default NextAuth(authConfig).auth;

export const config = {
  // Roda em todas as rotas, menos assets estáticos e otimização de imagem.
  //
  // Arquivo de `public/` (foto do produto, modelo 3D) também fica de fora, pela
  // EXTENSÃO. Sem isso a foto do configurador quebra: o otimizador do Next
  // busca o PNG original por HTTP no próprio servidor, essa busca interna não
  // leva o cookie de sessão, e o proxy responde com o redirecionamento para
  // /login em vez da imagem. O preço é que esses arquivos ficam legíveis por
  // quem tiver a URL exata — são as mesmas fotos e modelos que qualquer
  // vendedor logado já vê.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|glb|mjs)$).*)",
  ],
};
