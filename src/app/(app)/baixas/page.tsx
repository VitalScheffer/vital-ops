import { BaixasClient } from "@/components/baixas/BaixasClient";
import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewBaixas } from "@/lib/rbac";

export const metadata = { title: "Baixa de estoque — Vital Ops" };

const STATUS_LABEL: Record<string, string> = {
  ENVIANDO: "Em andamento",
  CONCLUIDO: "Concluída",
  FALHA: "Com falhas",
};

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

// Baixa de estoque por planilha (matéria-prima MAT): sobe a planilha com os
// itens (código Omie, quantidade, pedido/NF/OP e solicitante), o sistema
// confere código e saldo no Omie e a execução lança a saída no local padrão.
export default async function BaixasPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!canViewBaixas(session!.user.role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar a Baixa de estoque." />;
  }

  const recentes = await prisma.baixaImport.findMany({
    orderBy: { criadoEm: "desc" },
    take: 10,
    include: {
      autor: { select: { name: true } },
      itens: { select: { status: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Baixa de estoque (planilha)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suba a planilha de matéria-prima com o código do Omie, a quantidade e as referências (pedido,
          nota fiscal, OP): o sistema confere o saldo e dá baixa direto no estoque do Omie.
        </p>
      </header>

      <Panel
        title="Nova baixa"
        description="Baixe o modelo, preencha, suba o arquivo e confira antes de executar. A baixa sai no local de estoque padrão."
      >
        <BaixasClient defaultSolicitante={session!.user.name ?? ""} />
      </Panel>

      <Panel title="Baixas recentes" description="Últimas planilhas processadas (de todos os usuários).">
        {recentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma baixa registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Arquivo</th>
                  <th className="py-2 pr-3 font-medium">Solicitante</th>
                  <th className="py-2 pr-3 font-medium">Quem subiu</th>
                  <th className="py-2 pr-3 font-medium">Itens (baixados/total)</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((importacao) => {
                  const baixados = importacao.itens.filter((item) => item.status === "BAIXADO").length;
                  return (
                    <tr key={importacao.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-card-foreground">{importacao.arquivoNome}</td>
                      <td className="py-2 pr-3 text-card-foreground">{importacao.solicitante}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{importacao.autor.name}</td>
                      <td className="py-2 pr-3 text-card-foreground">
                        {baixados}/{importacao.totalItens}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {STATUS_LABEL[importacao.status] ?? importacao.status}
                      </td>
                      <td className="py-2 text-muted-foreground">{formatarData(importacao.criadoEm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
