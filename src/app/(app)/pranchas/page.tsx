import { PranchasClient } from "@/components/pranchas/PranchasClient";
import { Forbidden } from "@/components/Forbidden";
import { auth } from "@/lib/auth";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewPranchas } from "@/lib/rbac";

export const metadata = { title: "Pranchas (compilar desenhos) — Vital Ops" };

// Módulo Pranchas: junta os desenhos de um conjunto num PDF único pronto para
// impressão. Sobe o BOM (PDF com os códigos) e a pasta com os PDFs dos desenhos;
// o sistema casa cada peça pela versão/revisão e compila tudo. Todo o
// processamento roda no navegador (nenhum arquivo vai para o servidor). O menu
// e esta rota usam a mesma permissão para impedir acesso direto quando desativada.
export default async function PranchasPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!canViewPranchas(session!.user.role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar Pranchas." />;
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pranchas (compilar desenhos)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chega de entrar na pasta e baixar desenho por desenho. Suba o BOM do conjunto e a pasta dos desenhos: o
          sistema acha cada prancha na versão e revisão certas e devolve um PDF único pronto para plotar.
        </p>
      </header>

      <PranchasClient />
    </div>
  );
}
