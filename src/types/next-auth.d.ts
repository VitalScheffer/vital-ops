import type { Role } from "@/lib/contracts";
import type { DefaultSession } from "next-auth";

// Augmenta a sessão/JWT do Auth.js com o id do usuário e o papel (role).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
  }
}
