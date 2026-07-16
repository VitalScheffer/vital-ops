import { CheckCircle2, ClipboardList, PackageMinus, UserCheck } from "lucide-react";

import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { CriarRequisicaoForm } from "@/components/requisicoes/CriarRequisicaoForm";
import { DecidirRequisicao } from "@/components/requisicoes/DecidirRequisicao";
import { RelatorioRequisicoes } from "@/components/requisicoes/RelatorioRequisicoes";
import { auth } from "@/lib/auth";
import { formatarNumeroRequisicao } from "@/lib/contracts";
import { formatarDataHora } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { locaisDisponiveis } from "@/lib/estoque/estoque.server";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canDecideRequisicao, canViewRequisicoes } from "@/lib/rbac";

export const metadata = { title: "Requisições — Vital Ops" };

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Aguardando gestor",
  CONFIRMADA: "Confirmada",
  RECUSADA: "Recusada",
};

const STATUS_CLASS: Record<string, string> = {
  PENDENTE: "bg-muted text-muted-foreground",
  CONFIRMADA: "bg-primary/10 text-primary",
  RECUSADA: "bg-destructive/10 text-destructive",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "pendente",
  BAIXADO: "baixado ✓",
  FALHA: "falha",
};

function formatarQuantidade(quantidade: unknown): string {
  return Number(quantidade).toLocaleString("pt-BR");
}

type RequisicaoComTudo = Awaited<ReturnType<typeof buscarRequisicoes>>[number];

// A fila do gestor é FIFO ("asc": o pedido mais antigo primeiro, ninguém fica
// pra trás); as listas de acompanhamento mostram o mais recente primeiro.
function buscarRequisicoes(where: object, take: number, ordem: "asc" | "desc" = "desc") {
  return prisma.requisicao.findMany({
    where,
    include: {
      itens: { orderBy: { sku: "asc" } },
      setor: { select: { nome: true } },
      solicitante: { select: { name: true, email: true } },
      gestor: { select: { name: true } },
    },
    orderBy: { criadoEm: ordem },
    take,
  });
}

// Passo a passo exibido no topo da tela — a mesma explicação vale pro
// solicitante (FABRICA/FUNCIONARIO) e pro gestor validarem o fluxo.
function ComoFunciona({ decide }: { decide: boolean }) {
  const passos = [
    {
      icon: ClipboardList,
      titulo: "1. Monte o pedido",
      texto:
        "Informe quem está pedindo, o setor e os itens (código do produto no Omie + quantidade). Dá para pedir vários itens de uma vez, tipo um carrinho.",
    },
    {
      icon: CheckCircle2,
      titulo: "2. Pedido ganha um número",
      texto:
        "Ao enviar, o sistema confere se cada código existe no Omie e gera um número sequencial (ex.: REQ-0001). O pedido entra na fila do gestor como \"Aguardando gestor\".",
    },
    {
      icon: UserCheck,
      titulo: "3. Gestor confirma ou recusa",
      texto: decide
        ? "Você (gestor) vê a fila abaixo, do pedido mais antigo pro mais novo, e decide. Recusar exige um motivo, que o solicitante vê."
        : "Só o gestor decide. Se recusar, o motivo aparece no seu pedido em \"Meus pedidos\".",
    },
    {
      icon: PackageMinus,
      titulo: "4. Baixa automática no Omie",
      texto:
        "Quando o gestor confirma, ele escolhe o local de estoque, o sistema confere o saldo lá e lança a saída no Omie item por item. O resultado de cada item fica visível no pedido — ninguém precisa mexer no Omie na mão.",
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

function CartaoRequisicao({
  requisicao,
  mostrarSolicitante,
  acoes,
}: {
  requisicao: RequisicaoComTudo;
  mostrarSolicitante: boolean;
  acoes?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-card-foreground">
            {formatarNumeroRequisicao(requisicao.numero)}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[requisicao.status] ?? "bg-muted text-muted-foreground"}`}
          >
            {STATUS_LABEL[requisicao.status] ?? requisicao.status}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{formatarDataHora(requisicao.criadoEm)}</span>
      </header>

      <p className="text-sm text-muted-foreground">
        {mostrarSolicitante ? (
          <>
            Pedido por <span className="text-card-foreground">{requisicao.solicitanteNome}</span>
            {requisicao.solicitante ? ` (conta ${requisicao.solicitante.email})` : null} — setor{" "}
            {requisicao.setor.nome}
          </>
        ) : (
          <>
            Solicitante: <span className="text-card-foreground">{requisicao.solicitanteNome}</span> — setor{" "}
            {requisicao.setor.nome}
          </>
        )}
        {requisicao.observacao ? <> · Obs.: {requisicao.observacao}</> : null}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Código</th>
              <th className="py-1.5 pr-3 font-medium">Descrição</th>
              <th className="py-1.5 pr-3 font-medium">Qtd</th>
              <th className="py-1.5 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {requisicao.itens.map((item) => (
              <tr key={item.id} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3 font-mono text-xs text-card-foreground">{item.sku}</td>
                <td className="py-1.5 pr-3 text-card-foreground">{item.descricao}</td>
                <td className="py-1.5 pr-3 text-card-foreground">{formatarQuantidade(item.quantidade)}</td>
                <td className="py-1.5">
                  <span
                    className={
                      item.status === "FALHA"
                        ? "text-destructive"
                        : item.status === "BAIXADO"
                          ? "text-primary"
                          : "text-muted-foreground"
                    }
                  >
                    {ITEM_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                  {item.status === "BAIXADO" && item.localEstoqueNome ? (
                    <span className="block text-xs text-muted-foreground">local: {item.localEstoqueNome}</span>
                  ) : null}
                  {item.motivoErro ? (
                    <span className="block text-xs text-muted-foreground">{item.motivoErro}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {requisicao.status !== "PENDENTE" ? (
        <p className="text-xs text-muted-foreground">
          {requisicao.status === "CONFIRMADA" ? "Confirmada" : "Recusada"}
          {requisicao.gestor ? ` por ${requisicao.gestor.name}` : null}
          {requisicao.decididaEm ? ` em ${formatarDataHora(requisicao.decididaEm)}` : null}
          {requisicao.status === "CONFIRMADA" && requisicao.localEstoqueNome
            ? ` — baixa no local ${requisicao.localEstoqueNome}`
            : null}
          {requisicao.motivoDecisao ? ` — ${requisicao.motivoDecisao}` : null}
        </p>
      ) : null}

      {acoes}
    </article>
  );
}

// Requisições de fábrica (Fase 3): o solicitante monta o pedido (vários itens),
// o gestor confirma/recusa e a confirmação baixa o estoque no Omie.
export default async function RequisicoesPage() {
  const session = await auth();
  const role = session!.user.role;
  const permissions = await getRolePermissionsMap();

  if (!canViewRequisicoes(role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar Requisições." />;
  }

  const decide = canDecideRequisicao(role, permissions);
  const userId = session!.user.id;

  const [setores, membership, minhas, pendentes, decididas, locais] = await Promise.all([
    prisma.setor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.userSetor.findFirst({ where: { userId }, select: { setorId: true } }),
    buscarRequisicoes({ solicitanteId: userId }, 30),
    decide ? buscarRequisicoes({ status: "PENDENTE" }, 100, "asc") : Promise.resolve([]),
    decide ? buscarRequisicoes({ status: { not: "PENDENTE" } }, 15) : Promise.resolve([]),
    decide ? locaisDisponiveis() : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Requisições</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Precisa de material do estoque? Monte o pedido com os itens e envie: o gestor confirma e a
          baixa no Omie acontece sozinha.
        </p>
      </header>

      <ComoFunciona decide={decide} />

      {decide ? (
        <Panel
          title={`Aguardando decisão (${pendentes.length})`}
          description="Pedidos pendentes de todos os solicitantes, do mais antigo pro mais novo. Confirmar dá baixa no estoque do Omie no local que você escolher; recusar exige motivo."
        >
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido aguardando decisão.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {pendentes.map((requisicao) => (
                <CartaoRequisicao
                  key={requisicao.id}
                  requisicao={requisicao}
                  mostrarSolicitante
                  acoes={
                    <DecidirRequisicao
                      requisicaoId={requisicao.id}
                      locais={locais}
                      itens={requisicao.itens
                        .filter((item) => item.status !== "BAIXADO")
                        .map((item) => ({ id: item.id, sku: item.sku }))}
                      localAtualCodigo={requisicao.localEstoqueCodigo ?? undefined}
                    />
                  }
                />
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      <Panel
        title="Novo pedido"
        description="Informe o código do produto no Omie (SKU), a quantidade e quem está pedindo. Pode adicionar quantos itens precisar antes de enviar."
      >
        <CriarRequisicaoForm
          setores={setores}
          defaultNome={session!.user.name ?? ""}
          defaultSetorId={membership?.setorId}
        />
      </Panel>

      <Panel title="Meus pedidos" description="Acompanhe aqui o andamento do que você pediu: aguardando gestor, confirmado (com a baixa item a item) ou recusado (com o motivo).">
        {minhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {minhas.map((requisicao) => (
              <CartaoRequisicao key={requisicao.id} requisicao={requisicao} mostrarSolicitante={false} />
            ))}
          </div>
        )}
      </Panel>

      {decide && decididas.length > 0 ? (
        <Panel title="Decididas recentemente" description="Últimos pedidos confirmados ou recusados.">
          <div className="flex flex-col gap-4">
            {decididas.map((requisicao) => (
              <CartaoRequisicao key={requisicao.id} requisicao={requisicao} mostrarSolicitante />
            ))}
          </div>
        </Panel>
      ) : null}

      {decide ? (
        <Panel
          title="Relatório (PDF)"
          description="Baixe o resumo do período: o que foi solicitado, quem pediu, o que foi aprovado ou recusado e a situação de cada item."
        >
          <RelatorioRequisicoes />
        </Panel>
      ) : null}
    </div>
  );
}
