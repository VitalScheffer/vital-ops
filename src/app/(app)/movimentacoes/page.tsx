import { ArrowLeftRight, ListChecks, PackageMinus, PackageSearch, Send } from "lucide-react";

import { Forbidden } from "@/components/Forbidden";
import {
  MovimentacaoOpClient,
  type PendenteResumo,
} from "@/components/movimentacoes/MovimentacaoOpClient";
import { Panel } from "@/components/Panel";
import { auth } from "@/lib/auth";
import { formatarDataHora } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { locaisDisponiveis } from "@/lib/estoque/estoque.server";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewMovimentacoes } from "@/lib/rbac";

export const metadata = { title: "Movimentação por OP — Vital Ops" };

const STATUS_LABEL: Record<string, string> = {
  ENVIANDO: "Em andamento",
  CONCLUIDO: "Concluída",
  PENDENTE: "Entrada pendente",
  FALHA: "Com falhas",
};

const STATUS_CLASS: Record<string, string> = {
  ENVIANDO: "bg-muted text-muted-foreground",
  CONCLUIDO: "bg-primary/10 text-primary",
  PENDENTE: "bg-warning-dim text-warning",
  FALHA: "bg-danger-dim text-danger",
};

// Passo a passo no topo da tela — explica o fluxo inteiro para quem vai usar.
function ComoFunciona() {
  const passos = [
    {
      icon: PackageSearch,
      titulo: "1. Digite o número da OP",
      texto:
        "Só o número (ex.: 2026/00802). Nada de PDF: o sistema busca a ordem no Omie e traz o produto, a quantidade a produzir e a lista de material.",
    },
    {
      icon: ListChecks,
      titulo: "2. Confira a lista",
      texto:
        "As quantidades já vêm multiplicadas pela quantidade da OP, na unidade de cada cadastro (10 unidades de uma chapa de 1 kg aparecem como 10 kg). Item sem saldo no código novo oferece o cadastro antigo que tem o material; se a lista vier vazia, busque o código na própria linha. Quando o De/Para tem o fator do par, a quantidade já vem convertida.",
    },
    {
      icon: ArrowLeftRight,
      titulo: "3. Escolha de onde e para onde",
      texto:
        "Origem e destino são seus (o padrão é sair da matéria-prima e ir para Reservado Produção). Trocar a origem reconsulta o saldo na hora, então dá para ver qual local tem o material.",
    },
    {
      icon: Send,
      titulo: "4. Transfira",
      texto:
        "O Omie não tem transferência: cada item vira uma saída na origem e uma entrada no destino. Se algo interromper no meio, a tela avisa quais itens ficaram sem a entrada e conclui só o que falta, sem mover nada duas vezes.",
    },
    {
      icon: PackageMinus,
      titulo: "5. Quando a produção começar, dê baixa",
      texto:
        "Abaixo aparece a tabelinha do que está reservado para a OP. Escolha um local para todos ou um por item e dê baixa: aí sim o material sai do saldo. Errou? \"Reverter baixa\" devolve tudo ao mesmo local e aos mesmos lotes.",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

export default async function MovimentacoesPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!canViewMovimentacoes(session!.user.role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar a Movimentação por OP." />;
  }

  const [recentes, locais] = await Promise.all([
    prisma.movimentoOp.findMany({
      orderBy: { criadoEm: "desc" },
      take: 10,
      include: {
        autor: { select: { name: true } },
        itens: { select: { status: true } },
      },
    }),
    locaisDisponiveis(),
  ]);

  // Movimentações com item em SAIDA_OK: material que saiu da origem e não
  // chegou ao destino. Sobe pro topo da tela porque é divergência de estoque
  // aberta, não histórico.
  const pendentes: PendenteResumo[] = recentes
    .map((mov) => ({
      id: mov.id,
      numeroOp: mov.numeroOp,
      origemNome: mov.origemNome ?? mov.origemCodigo,
      destinoNome: mov.destinoNome ?? mov.destinoCodigo,
      itensPendentes: mov.itens.filter((item) => item.status === "SAIDA_OK").length,
      criadoEm: formatarDataHora(mov.criadoEm),
    }))
    .filter((mov) => mov.itensPendentes > 0);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Movimentação por OP</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Digite o número da Ordem de Produção do Omie e transfira a matéria-prima e os componentes dela para o
          local de produção. A lista de material e as quantidades vêm da própria OP.
        </p>
      </header>

      <ComoFunciona />

      <Panel
        title="Nova movimentação"
        description="Busque a OP, confira a lista, escolha os locais e transfira. Nada é escrito no Omie até você confirmar."
      >
        {locais.length === 0 ? (
          <p className="rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
            Não consegui ler os locais de estoque do Omie agora. Sem eles não dá para escolher origem e destino.
            Tente recarregar a página em alguns minutos.
          </p>
        ) : (
          <MovimentacaoOpClient locais={locais} pendentes={pendentes} />
        )}
      </Panel>

      <Panel title="Últimas movimentações" description="As 10 mais recentes, com a situação de cada uma.">
        {recentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma movimentação por OP ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentes.map((mov) => {
              const transferidos = mov.itens.filter((i) => i.status === "TRANSFERIDO").length;
              return (
                <li
                  key={mov.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-card-foreground">
                      OP <b>{mov.numeroOp}</b>
                      {mov.produtoCodigo ? ` · ${mov.produtoCodigo}` : ""} ·{" "}
                      {mov.origemNome ?? mov.origemCodigo} → {mov.destinoNome ?? mov.destinoCodigo}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {transferidos} de {mov.totalItens} item(ns) · {mov.autor.name} ·{" "}
                      {formatarDataHora(mov.criadoEm)}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_CLASS[mov.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {STATUS_LABEL[mov.status] ?? mov.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
