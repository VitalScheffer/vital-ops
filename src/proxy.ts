import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Proxy = "middleware" no Next.js 16 (renomeado). Protege tudo exceto /login e
// /api/auth. Usa só a config edge-safe (sem Prisma): a decisão é pela presença
// de sessão (callback `authorized`); a autorização fina fica nas rotas/ações.
export default NextAuth(authConfig).auth;

export const config = {
  // Roda em todas as rotas, menos assets estáticos e otimização de imagem.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
