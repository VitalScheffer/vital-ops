import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { CreateSetorForm } from "@/components/users/CreateSetorForm";
import { ExcluirSetor } from "@/components/users/ExcluirSetor";
import { CreateUserForm } from "@/components/users/CreateUserForm";
import { EditUserDialog } from "@/components/users/EditUserDialog";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { rotuloPapel } from "@/lib/permissions";
import { getRolePermissionsMap, listarPerfis } from "@/lib/permissions.server";
import { canEditUser, canManageUsers } from "@/lib/rbac";

export const metadata = { title: "Usuários e setores — Vital Ops" };

function badgeClass(role: Role): string {
  if (role === "ADMIN") {
    return "bg-primary/10 text-primary";
  }
  if (role === "GESTOR") {
    return "bg-brand-turquesa/15 text-brand-teal";
  }
  return "bg-muted text-muted-foreground";
}

// Gestão de usuários e setores (ADMIN/GESTOR). Guard de papel na própria página.
export default async function UsuariosPage() {
  const session = await auth();
  const role = session!.user.role;
  const permissions = await getRolePermissionsMap();
  if (!canManageUsers(role, permissions)) {
    return <Forbidden message="A gestão de usuários é restrita a quem tem esse módulo liberado." />;
  }

  const [users, setores, perfis] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { setores: { include: { setor: true } } },
    }),
    prisma.setor.findMany({ orderBy: { nome: "asc" } }),
    listarPerfis(),
  ]);
  // Perfis customizados p/ o dropdown de papel; mapa codigo→nome p/ os rótulos.
  const perfisCustom = perfis.filter((perfil) => !perfil.fixo).map((perfil) => ({ codigo: perfil.codigo, nome: perfil.nome }));
  const nomesCustom = Object.fromEntries(perfisCustom.map((perfil) => [perfil.codigo, perfil.nome]));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Usuários e setores
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastre pessoas, defina papéis e organize os setores.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel
          title="Novo usuário"
          description="Defina o e-mail (@vitalscheffer.com.br) e a senha inicial de acesso."
        >
          <CreateUserForm
            setores={setores.map((setor) => ({ id: setor.id, nome: setor.nome }))}
            canCreateAdmin={role === "ADMIN"}
            perfisCustom={perfisCustom}
          />
        </Panel>

        <Panel title="Setores" description="Usados para associar usuários e requisições.">
          <CreateSetorForm />
          {setores.length > 0 && (
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
          )}
        </Panel>
      </div>

      <Panel title={`Usuários (${users.length})`}>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Papel</th>
                  <th className="px-3 py-2 font-medium">Setores</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-card-foreground">{user.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(user.role as Role)}`}
                      >
                        {rotuloPapel(user.role, nomesCustom)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {user.setores.length === 0
                        ? "—"
                        : user.setores.map((membership) => membership.setor.nome).join(", ")}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          user.active ? "text-success" : "text-muted-foreground"
                        }
                      >
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canEditUser(role, user.role as Role, permissions) ? (
                        <EditUserDialog
                          user={{
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role as Role,
                            active: user.active,
                            setorIds: user.setores.map((membership) => membership.setorId),
                          }}
                          setores={setores.map((setor) => ({ id: setor.id, nome: setor.nome }))}
                          canAssignAdmin={role === "ADMIN"}
                          isSelf={user.id === session!.user.id}
                          perfisCustom={perfisCustom}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
