import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { PermissionsMatrixForm } from "@/components/configuracoes/PermissionsMatrixForm";
import { CreateSetorForm } from "@/components/users/CreateSetorForm";
import { ExcluirSetor } from "@/components/users/ExcluirSetor";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";

export const metadata = { title: "Configurações — Vital Ops" };

// Configurações (item 3 — permissões por papel). SOMENTE ADMIN: guard fixo em
// código na própria sessão, não passa pela tabela que esta tela edita.
export default async function ConfiguracoesPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") {
    return (
      <Forbidden message="As configurações de permissões são restritas a administradores." />
    );
  }

  const [permissions, setores] = await Promise.all([
    getRolePermissionsMap(),
    prisma.setor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha quais módulos cada papel pode acessar e gerencie os setores da plataforma.
        </p>
      </header>

      <Panel
        title="Permissões por papel"
        description="Marque os módulos que cada papel enxerga no menu e pode acessar."
      >
        <PermissionsMatrixForm permissions={permissions} />
      </Panel>

      <Panel title="Setores" description="Usados para associar usuários e requisições. Criar ou excluir aqui vale para toda a plataforma.">
        <CreateSetorForm />
        {setores.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {setores.map((setor) => (
              <li
                key={setor.id}
                className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-card-foreground"
              >
                {setor.nome}
                <ExcluirSetor setorId={setor.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum setor cadastrado ainda.</p>
        )}
      </Panel>
    </div>
  );
}
