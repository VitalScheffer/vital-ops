import type { Role } from "@/lib/contracts";
import { prisma } from "@/lib/db";

export interface AppUser {
  id: string;
  role: Role;
  active: boolean;
}

// Find-or-create no primeiro login (o domínio já foi validado no callback signIn).
// Papel padrão FUNCIONARIO; a promoção para GESTOR/ADMIN é feita por um admin.
// O nome existente NÃO é sobrescrito (um admin pode tê-lo ajustado).
// role vem como String do SQLite; o valor sempre é um Role válido (default no schema).
export async function syncUser(email: string, name?: string | null): Promise<AppUser> {
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: name ?? email },
    update: {},
    select: { id: true, role: true, active: true },
  });
  return { ...user, role: user.role as Role };
}
