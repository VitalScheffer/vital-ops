import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { auth } from "@/lib/auth";
import { formatarNumeroRequisicao, type Role } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { visibleNavFor } from "@/lib/navigation";
import type { Notificacao } from "@/lib/notificacoes";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canDecideRequisicao } from "@/lib/rbac";
import type { RolePermissionsMap } from "@/lib/permissions";

const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

// Notificações do sininho: pra gestor, os pedidos aguardando decisão; pra quem
// pediu, as requisições decididas nos últimos 3 dias. Best-effort/leve.
async function montarNotificacoes(
  userId: string,
  role: Role,
  permissions: RolePermissionsMap,
): Promise<Notificacao[]> {
  const notificacoes: Notificacao[] = [];

  if (canDecideRequisicao(role, permissions)) {
    const pendentes = await prisma.requisicao.count({ where: { status: "PENDENTE" } });
    if (pendentes > 0) {
      notificacoes.push({
        id: "req-pendentes",
        texto: `${pendentes} pedido(s) de requisição aguardando sua decisão`,
        href: "/requisicoes",
      });
    }
  }

  const decididas = await prisma.requisicao.findMany({
    where: {
      solicitanteId: userId,
      status: { not: "PENDENTE" },
      decididaEm: { gte: new Date(Date.now() - TRES_DIAS_MS) },
    },
    select: { id: true, numero: true, status: true },
    orderBy: { decididaEm: "desc" },
    take: 10,
  });
  for (const req of decididas) {
    notificacoes.push({
      id: `req-dec-${req.id}`,
      texto: `${formatarNumeroRequisicao(req.numero)} ${req.status === "CONFIRMADA" ? "foi aprovada" : "foi recusada"}`,
      href: "/requisicoes",
    });
  }

  return notificacoes;
}

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
  const notificacoes = await montarNotificacoes(session.user.id, session.user.role, permissions);

  return (
    <AppShell
      user={user}
      nav={visibleNavFor(session.user.role, permissions)}
      notificacoes={notificacoes}
    >
      {children}
    </AppShell>
  );
}
