import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { CriarPerfilForm } from "@/components/configuracoes/CriarPerfilForm";
import { PermissionsMatrixForm } from "@/components/configuracoes/PermissionsMatrixForm";
import { CreateSetorForm } from "@/components/users/CreateSetorForm";
import { ExcluirSetor } from "@/components/users/ExcluirSetor";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap, listarPerfis } from "@/lib/permissions.server";

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

  const [permissions, perfis, setores] = await Promise.all([
    getRolePermissionsMap(),
    listarPerfis(),
    prisma.setor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  // ADMIN é linha travada dentro da própria matriz; os demais (fixos + custom)
  // são editáveis.
  const perfisEditaveis = perfis.filter((perfil) => perfil.codigo !== "ADMIN");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie perfis de acesso, escolha o que cada papel enxerga e gerencie os setores.
        </p>
      </header>

      <Panel
        title="Permissões por papel"
        description="Crie um perfil novo e marque os módulos que ele vê no menu e pode acessar. Depois é só atribuir o perfil às pessoas em Usuários e setores."
      >
        <div className="mb-5">
          <CriarPerfilForm />
        </div>
        <PermissionsMatrixForm permissions={permissions} perfis={perfisEditaveis} />
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
