import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { audit } from "@/lib/audit";
import { authConfig, isCompanyEmail } from "@/lib/auth.config";
import type { Role } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { syncUser } from "@/lib/users";

// Reconstrói um Headers "real" (o audit() checa instanceof Headers) para capturar
// IP/user-agent no login. Best-effort: se não houver contexto de request, audita sem.
async function tryRequestHeaders(): Promise<Headers | undefined> {
  try {
    const incoming = await headers();
    const out = new Headers();
    incoming.forEach((value, key) => out.set(key, value));
    return out;
  } catch {
    return undefined;
  }
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// Instância completa (Node runtime): estende a config edge-safe com o provider
// Credentials (email + senha) e os callbacks que dependem do banco.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      // REJEITA se: e-mail fora do domínio, usuário inexistente, inativo, sem
      // senha cadastrada ou senha incorreta. Só então retorna { id, email, name }.
      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email);
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password || !isCompanyEmail(email)) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, active: true, passwordHash: true },
        });
        if (!user || !user.active || !user.passwordHash) {
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.email) {
        const appUser = await syncUser(user.email, user.name);
        token.uid = appUser.id;
        token.role = appUser.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (typeof token.uid === "string") {
          session.user.id = token.uid;
        }
        if (typeof token.role === "string") {
          session.user.role = token.role as Role;
        }
      }
      return session;
    },
  },
  events: {
    // Auditoria de login (auditoria em TUDO). Nunca trava o login se falhar.
    async signIn({ user }) {
      if (!user?.email) {
        return;
      }
      try {
        const appUser = await syncUser(user.email, user.name);
        await audit({
          actor: { id: appUser.id, email: user.email },
          action: "auth.login",
          entity: "User",
          entityId: appUser.id,
          summary: `${user.email} entrou na plataforma.`,
          req: await tryRequestHeaders(),
        });
      } catch {
        // auditoria não deve impedir o login
      }
    },
  },
});
