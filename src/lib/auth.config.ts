import type { NextAuthConfig } from "next-auth";

// Configuração edge-safe (SEM Prisma) compartilhada entre o app e o proxy.
// O login é restrito ao domínio corporativo; o provider Credentials (email +
// senha) e os callbacks que dependem do banco ficam no lado Node
// (src/lib/auth.ts), fora daqui. Aqui o proxy só decide pela presença de sessão.

export const COMPANY_DOMAIN = "vitalscheffer.com.br";

export function isCompanyEmail(email?: string | null): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${COMPANY_DOMAIN}`);
}

// `/ver/...` é a tela de conferência que o vendedor manda para o cliente: ela
// existe justamente para ser aberta por quem não tem login. Não consulta banco
// nenhum — a configuração inteira vem na URL (ver `compartilhar.ts`) —, então
// abrir essa rota não expõe nada além do que o vendedor decidiu enviar.
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" || pathname.startsWith("/api/auth") || pathname.startsWith("/ver/")
  );
}

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  // Providers ficam no lado Node (Credentials precisa de bcrypt/Prisma).
  providers: [],
  callbacks: {
    // REJEITA qualquer e-mail fora de @vitalscheffer.com.br (defesa em camadas;
    // o authorize do Credentials já valida antes).
    signIn({ user, profile }) {
      return isCompanyEmail(profile?.email ?? user?.email);
    },
    // ATENÇÃO: este callback NÃO é o que barra anônimo hoje. O next-auth só
    // aplica o redirect dele quando o proxy é o handler cru; como `src/proxy.ts`
    // passa uma função própria (para o nonce da CSP), aquele ramo é pulado e um
    // `false` daqui seria ignorado. A decisão que vale está no proxy, usando a
    // mesma `isPublicPath`. Fica aqui como rede de segurança para o caso de o
    // proxy voltar a ser o handler cru.
    authorized({ request, auth }) {
      if (isPublicPath(request.nextUrl.pathname)) {
        return true;
      }
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
