import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { PermissionsMatrixForm } from "@/components/configuracoes/PermissionsMatrixForm";
import { auth } from "@/lib/auth";
import { getRolePermissionsMap } from "@/lib/permissions";

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

  const permissions = await getRolePermissionsMap();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha quais módulos cada papel pode acessar na plataforma.
        </p>
      </header>

      <Panel
        title="Permissões por papel"
        description="Marque os módulos que cada papel enxerga no menu e pode acessar."
      >
        <PermissionsMatrixForm permissions={permissions} />
      </Panel>
    </div>
  );
}
