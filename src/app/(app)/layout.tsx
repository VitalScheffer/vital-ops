import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { auth } from "@/lib/auth";
import { visibleNavFor } from "@/lib/navigation";
import { getRolePermissionsMap } from "@/lib/permissions.server";

// Shell autenticado: header com usuário/logout + navegação lateral filtrada por
// papel. O proxy já barra anônimos; aqui garantimos a sessão (defesa em camadas)
// e montamos apenas os itens que o papel pode ver.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = {
    id: session.user.id,
    name: session.user.name ?? session.user.email,
    email: session.user.email,
    role: session.user.role,
  };

  const permissions = await getRolePermissionsMap();

  return (
    <AppShell user={user} nav={visibleNavFor(session.user.role, permissions)}>
      {children}
    </AppShell>
  );
}
