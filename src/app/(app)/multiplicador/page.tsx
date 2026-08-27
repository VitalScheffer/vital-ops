import { MultiplicadorClient } from "@/components/multiplicador/MultiplicadorClient";
import { Forbidden } from "@/components/Forbidden";
import { auth } from "@/lib/auth";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewPranchas } from "@/lib/rbac";

export const metadata = { title: "Multiplicador de BOMs — Vital Ops" };

export default async function MultiplicadorPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();
  if (!canViewPranchas(session!.user.role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar Multiplicador." />;
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Multiplicador</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suba vários BOMs, escolha o fator e multiplique quantidade, peso ou os dois. Os arquivos são processados
          apenas neste navegador; o PDF preserva a página original e troca só os valores da tabela.
        </p>
      </header>
      <MultiplicadorClient />
    </div>
  );
}
