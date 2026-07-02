"use server";

import { audit } from "@/lib/audit";
import { auth, signOut } from "@/lib/auth";
import { requestHeaders } from "@/lib/request";

// Logout: registra na auditoria (REQUISITOS §5) e encerra a sessão.
export async function logoutAction(): Promise<void> {
  const session = await auth();
  if (session?.user?.email) {
    await audit({
      actor: { id: session.user.id, email: session.user.email },
      action: "auth.logout",
      entity: "User",
      entityId: session.user.id,
      summary: `Logout de ${session.user.email}.`,
      req: await requestHeaders(),
    });
  }
  await signOut({ redirectTo: "/login" });
}
