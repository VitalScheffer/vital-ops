import { Download, FileSpreadsheet, PackageMinus, SearchCheck } from "lucide-react";

import { BaixasClient } from "@/components/baixas/BaixasClient";
import { EstornarBaixa } from "@/components/baixas/EstornarBaixa";
import { RelatorioConsumo } from "@/components/baixas/RelatorioConsumo";
import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { auth } from "@/lib/auth";
import { formatarDataHora } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { locaisDisponiveis } from "@/lib/estoque/estoque.server";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewBaixas } from "@/lib/rbac";

export const metadata = { title: "Baixa de estoque — Vital Ops" };

const STATUS_LABEL: Record<string, string> = {
  ENVIANDO: "Em andamento",
  CONCLUIDO: "Concluída",
  FALHA: "Com falhas",
};

// Passo a passo exibido no topo da tela — explica o fluxo inteiro pra quem
// vai usar (e pra validação do processo com o time).
function ComoFunciona() {
  const passos = [
    {
      icon: Download,
      titulo: "1. Baixe o modelo",
      texto:
        "Clique em \"Baixar modelo (.xlsx)\". Ele já vem com as colunas certas: Produto (código Omie), Quantidade e as referências Pedido, Nota Fiscal, OP e Solicitante.",
    },
    {
      icon: FileSpreadsheet,
      titulo: "2. Preencha e suba",
      texto:
        "Preencha uma linha por item de matéria-prima e arraste o arquivo pra cá. Código e quantidade são obrigatórios; pedido, NF e OP são opcionais e ficam registrados na movimentação do Omie.",
    },
    {
      icon: SearchCheck,
      titulo: "3. Confira antes de baixar",
      texto:
        "Escolha o local de estoque e o sistema consulta o Omie linha a linha: se o código existe, a descrição real e o saldo NAQUELE local. Troque o local pra ver qual tem o material — nada é baixado nesta etapa.",
    },
    {
      icon: PackageMinus,
      titulo: "4. Execute a baixa",
      texto:
        "Ao confirmar, a saída é lançada no estoque do Omie no local escolhido, item por item, com quem solicitou e o vínculo pedido/NF/OP na observação. Se algo interromper no meio, dá pra continuar de onde parou sem baixar nada duas vezes.",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {passos.map((passo) => (
        <div key={passo.titulo} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <passo.icon className="h-5 w-5" />
          </span>
          <h2 className="text-sm font-semibold text-card-foreground">{passo.titulo}</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{passo.texto}</p>
        </div>
      ))}
    </section>
  );
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

  const podeRelatorio = ["ADMIN", "GESTOR", "FABRICA_GESTOR"].includes(session!.user.role);

  const [recentes, locais] = await Promise.all([
    prisma.baixaImport.findMany({
      orderBy: { criadoEm: "desc" },
      take: 10,
      include: {
        autor: { select: { name: true } },
        itens: { select: { status: true, estornadoEm: true } },
      },
    }),
    locaisDisponiveis(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Baixa de estoque (planilha)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suba a planilha de matéria-prima com o código do Omie, a quantidade e as referências (pedido,
          nota fiscal, OP): o sistema confere o saldo e dá baixa direto no estoque do Omie.
        </p>
      </header>

      <ComoFunciona />

      <Panel
        title="Nova baixa"
        description="Baixe o modelo, preencha, suba o arquivo e confira antes de executar. A baixa sai no local de estoque padrão."
      >
        <BaixasClient
          defaultSolicitante={session!.user.name ?? ""}
          locais={locais}
          role={session!.user.role}
        />
      </Panel>

      {podeRelatorio ? (
        <Panel
          title="Relatório de consumo (PDF)"
          description="Quanto de matéria-prima foi baixado no período, em R$, por produto, OP e finalidade (não conta o que foi estornado)."
        >
          <RelatorioConsumo />
        </Panel>
      ) : null}

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
                  <th className="py-2 pr-3 font-medium">Local</th>
                  <th className="py-2 pr-3 font-medium">Itens (baixados/total)</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((importacao) => {
                  const baixados = importacao.itens.filter((item) => item.status === "BAIXADO").length;
                  const estornavel = importacao.itens.some(
                    (item) => item.status === "BAIXADO" && !item.estornadoEm,
                  );
                  const estornada = !estornavel && importacao.itens.some((item) => item.estornadoEm);
                  return (
                    <tr key={importacao.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-card-foreground">{importacao.arquivoNome}</td>
                      <td className="py-2 pr-3 text-card-foreground">{importacao.solicitante}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{importacao.autor.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {importacao.localEstoqueNome ?? "Padrão"}
                      </td>
                      <td className="py-2 pr-3 text-card-foreground">
                        {baixados}/{importacao.totalItens}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {STATUS_LABEL[importacao.status] ?? importacao.status}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{formatarDataHora(importacao.criadoEm)}</td>
                      <td className="py-2">
                        {estornavel ? (
                          <EstornarBaixa importId={importacao.id} />
                        ) : estornada ? (
                          <span className="text-xs text-muted-foreground">estornada ↺</span>
                        ) : null}
                      </td>
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
